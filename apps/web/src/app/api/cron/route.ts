// Vercel Cron Route — runs scheduled tasks like health sweeps and user-defined cron jobs.
// Configure in vercel.json: crons: [{ path: "/api/cron", schedule: "*/5 * * * *" }]

export const dynamic = 'force-dynamic'

import { createDb, waitForSchema } from '@solarc/db'

import { logger } from '../../../lib/logger'
import { AtlasFreshnessScanner } from '../../../server/services/atlas'
import { GatewayRouter } from '../../../server/services/gateway'
import { getOrCreateCortex } from '../../../server/services/healing/index'
import { runInstinctPipeline } from '../../../server/services/instincts/instinct-pipeline'
import { CronEngine, SystemOrchestrator } from '../../../server/services/orchestration'

export async function GET(req: Request) {
  // Verify cron secret — Vercel sends this automatically for cron jobs
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const url = process.env.DATABASE_URL
    if (!url) return Response.json({ error: 'DATABASE_URL not set' }, { status: 503 })

    const db = createDb(url)
    await waitForSchema()

    const orchestrator = new SystemOrchestrator(db)
    const cortex = getOrCreateCortex(db)
    const cronEngine = new CronEngine(db)

    // 1. Run health sweep
    const healthResult = await orchestrator.monitorHealth()

    // 2. Run Self-Healing Cortex OODA cycle (replaces simple autoHeal)
    // This runs: predictive analysis → recovery state machine → adaptive tuning
    //            → instinct execution → agent degradation → learning feedback
    let cortexResult: Awaited<ReturnType<typeof cortex.runCycle>> | null = null
    try {
      cortexResult = await cortex.runCycle()
    } catch (err) {
      logger.warn({ err }, 'cron: cortex cycle failed, falling back to autoHeal')
      // Fallback: run the base healing engine directly
      await cortex.healer.autoHeal()
    }

    // 3. Rebalance agents if any workspace is overloaded
    let rebalanceMoves: Array<{ agentId: string; from: string; to: string }> = []
    try {
      const healthReports = await orchestrator.getAllWorkspacesHealth()
      const hasOverloaded = healthReports.some(
        (ws) => ws.agentCount > 0 && ws.idleAgents === 0 && ws.busyAgents > 0,
      )
      if (hasOverloaded) {
        rebalanceMoves = await orchestrator.rebalanceAgents()
      }
    } catch (err) {
      logger.warn({ err }, 'cron: rebalance failed')
    }

    // 4. Execute due user-defined cron jobs
    let jobsExecuted = 0
    let jobsFailed = 0
    try {
      const dueJobs = await cronEngine.getDueJobs()
      for (const job of dueJobs) {
        try {
          if (job.agentId) {
            const gateway = new GatewayRouter(db)
            const result = await gateway.chat({
              model: undefined,
              messages: [
                {
                  role: 'system',
                  content: `You are executing a scheduled cron job: "${job.name}". Task: ${job.task ?? 'Execute your assigned duties.'}`,
                },
                { role: 'user', content: job.task ?? `Run scheduled task: ${job.name}` },
              ],
              agentId: job.agentId,
            })
            await cronEngine.recordSuccess(job.id, result.content?.slice(0, 500))

            // Feed outcome to Cortex for adaptive tuning + degradation
            cortex.recordAgentOutcome(job.agentId, job.name, true, 0, 0)
          } else {
            await cronEngine.recordSuccess(job.id, 'Executed (no agent assigned)')
          }
          jobsExecuted++
        } catch (jobErr) {
          const errMsg = jobErr instanceof Error ? jobErr.message : String(jobErr)
          await cronEngine.recordFailure(job.id, errMsg)
          jobsFailed++

          // Feed failure to Cortex
          if (job.agentId) {
            cortex.recordAgentOutcome(job.agentId, job.name, false, 0, 0)
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, 'cron: job execution failed')
    }

    // 5. ATLAS freshness scan — run weekly (Sundays at hour 0)
    let atlasTicketsCreated = 0
    try {
      const now = new Date()
      if (now.getDay() === 0 && now.getHours() === 0 && now.getMinutes() < 5) {
        const scanner = new AtlasFreshnessScanner(db)
        const scanResult = await scanner.scan()
        if (scanResult.uncoveredFiles.length > 0) {
          atlasTicketsCreated = await scanner.createDiscoveryTickets(scanResult)
          logger.info(
            {
              covered: scanResult.coveredFiles,
              total: scanResult.totalFiles,
              ticketsCreated: atlasTicketsCreated,
            },
            'atlas freshness scan complete',
          )
        }
      }
    } catch (err) {
      logger.warn({ err }, 'cron: atlas freshness scan failed')
    }

    // 6. Instinct pipeline — detect patterns, score confidence, promote
    let instinctResult = { observationsProcessed: 0, candidatesCreated: 0, promoted: 0 }
    try {
      instinctResult = await runInstinctPipeline(db)
    } catch (err) {
      logger.warn({ err }, 'cron: instinct pipeline failed')
    }

    // Build response
    const cortexStatus = cortex.getStatus()

    return Response.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      health: {
        workspacesChecked: healthResult.workspacesChecked,
        issues: healthResult.issues.length,
      },
      cortex: cortexResult
        ? {
            riskLevel: cortexResult.phases.orient.riskLevel,
            healingActions: cortexResult.phases.act.healingActions.length,
            recoveryExecutions: cortexResult.phases.act.recoveryExecutions.length,
            tuningActions: cortexResult.phases.act.tuningActions.length,
            instinctExecutions: cortexResult.phases.act.instinctExecutions.length,
            degradationEvents: cortexResult.phases.act.degradationEvents.length,
            predictiveInterventions:
              cortexResult.phases.observe.predictiveReport.interventions.length,
            durationMs: cortexResult.durationMs,
            systemHealth: cortexStatus.systemHealth,
          }
        : { fallback: true },
      rebalance: {
        moves: rebalanceMoves.length,
      },
      cronJobs: {
        executed: jobsExecuted,
        failed: jobsFailed,
      },
      atlas: {
        ticketsCreated: atlasTicketsCreated,
      },
      instincts: {
        observations: instinctResult.observationsProcessed,
        candidates: instinctResult.candidatesCreated,
        promoted: instinctResult.promoted,
      },
    })
  } catch (err) {
    return Response.json(
      { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
