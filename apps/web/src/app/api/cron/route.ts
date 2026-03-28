// Vercel Cron Route — runs scheduled tasks like health sweeps and user-defined cron jobs.
// Configure in vercel.json: crons: [{ path: "/api/cron", schedule: "*/5 * * * *" }]

export const dynamic = 'force-dynamic'

import { createDb, waitForSchema } from '@solarc/db'

import { AtlasFreshnessScanner } from '../../../server/services/atlas'
import { GatewayRouter } from '../../../server/services/gateway'
import { HealingEngine } from '../../../server/services/healing/healing-engine'
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
    const healer = new HealingEngine(db)
    const cronEngine = new CronEngine(db)

    // 1. Run health sweep
    const healthResult = await orchestrator.monitorHealth()

    // 2. Auto-heal any issues found
    const healResult = await healer.autoHeal()

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
      console.warn('[Cron] rebalance failed:', err)
    }

    // 4. Execute due user-defined cron jobs
    let jobsExecuted = 0
    let jobsFailed = 0
    try {
      const dueJobs = await cronEngine.getDueJobs()
      for (const job of dueJobs) {
        try {
          // If job has an agentId, dispatch to agent via gateway
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
          } else {
            // Job without agent — just mark as executed
            await cronEngine.recordSuccess(job.id, 'Executed (no agent assigned)')
          }
          jobsExecuted++
        } catch (jobErr) {
          const errMsg = jobErr instanceof Error ? jobErr.message : String(jobErr)
          await cronEngine.recordFailure(job.id, errMsg)
          jobsFailed++
        }
      }
    } catch (err) {
      console.warn('[Cron] job execution failed:', err)
    }

    // 5. ATLAS freshness scan — run weekly (every ~2016 cron ticks at 5min intervals)
    // Simple check: run on Sundays at the first cron tick (hour 0, minute 0-4)
    let atlasTicketsCreated = 0
    try {
      const now = new Date()
      if (now.getDay() === 0 && now.getHours() === 0 && now.getMinutes() < 5) {
        const scanner = new AtlasFreshnessScanner(db)
        const scanResult = await scanner.scan()
        if (scanResult.uncoveredFiles.length > 0) {
          atlasTicketsCreated = await scanner.createDiscoveryTickets(scanResult)
          console.warn(
            `[ATLAS] Freshness scan: ${scanResult.coveredFiles}/${scanResult.totalFiles} covered, ${atlasTicketsCreated} tickets created`,
          )
        }
      }
    } catch (err) {
      console.warn('[Cron] ATLAS freshness scan failed:', err)
    }

    return Response.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      health: {
        workspacesChecked: healthResult.workspacesChecked,
        issues: healthResult.issues.length,
      },
      healing: {
        actions: healResult.actions?.length ?? 0,
      },
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
    })
  } catch (err) {
    return Response.json(
      { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
