import { createDb } from '@solarc/db'
import PgBoss from 'pg-boss'

import { EvalRunner } from '../../web/src/server/services/evals/runner'
import { SelfHealingCortex } from '../../web/src/server/services/healing/cortex'
import { HealingEngine } from '../../web/src/server/services/healing/healing-engine'
import { InstinctEvolver } from '../../web/src/server/services/instincts/evolve'
import { runInstinctPipeline } from '../../web/src/server/services/instincts/instinct-pipeline'
import { InstinctObserver } from '../../web/src/server/services/instincts/observer'
import { MemoryService } from '../../web/src/server/services/memory/memory-service'
import { CronEngine } from '../../web/src/server/services/orchestration/cron-engine'
import { TicketExecutionEngine } from '../../web/src/server/services/orchestration/ticket-engine'
import { ModeRouter } from '../../web/src/server/services/task-runner/mode-router'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:dev@localhost:5432/solarc'

async function main() {
  console.warn('[Worker] Starting pg-boss worker...')

  const db = createDb(DATABASE_URL)
  const boss = new PgBoss(DATABASE_URL)

  boss.on('error', (err) => console.error('[Worker] pg-boss error:', err))

  await boss.start()
  console.warn('[Worker] pg-boss started.')

  // === Service instances ===
  const ticketEngine = new TicketExecutionEngine(db)
  const cronEngine = new CronEngine(db)
  const memoryService = new MemoryService(db)
  const evalRunner = new EvalRunner(db)
  const healingEngine = new HealingEngine(db)
  const modeRouter = new ModeRouter(db)

  // === Job Handlers ===

  // Ticket execution (autonomous mode) — route through ModeRouter for auto-detection
  await boss.work<{ ticketId: string }>('ticket:execute', async ([job]) => {
    const { ticketId } = job.data
    console.warn(`[Worker] Executing ticket: ${ticketId}`)
    try {
      // Transition to queued, then let the mode router handle execution
      await ticketEngine.transition(ticketId, 'queued')
      const result = await modeRouter.route(ticketId, '', { forceMode: 'autonomous' })
      console.warn(
        `[Worker] Ticket ${ticketId} completed (mode=${result.mode}, ${result.latencyMs}ms)`,
      )
    } catch (err) {
      console.error(`[Worker] Ticket ${ticketId} failed:`, err)
      try {
        await ticketEngine.transition(ticketId, 'failed')
      } catch (statusErr) {
        console.warn(`[Worker] Best-effort status update failed for ticket ${ticketId}:`, statusErr)
      }
      throw err
    }
  })

  // Cron job execution — fetch due jobs and execute them
  await boss.work<{ cronJobId: string }>('cron:execute', async ([job]) => {
    const { cronJobId } = job.data
    console.warn(`[Worker] Executing cron job: ${cronJobId}`)
    try {
      const dueJobs = await cronEngine.getDueJobs()
      const target = dueJobs.find((j) => j.id === cronJobId)
      if (!target) {
        console.warn(`[Worker] Cron job ${cronJobId} not due or not found, skipping`)
        return
      }
      // Record success — the actual task payload execution is delegated to the
      // cron job's configured task type (future: dispatch to ticket:execute)
      await cronEngine.recordSuccess(cronJobId, 'executed by worker')
      console.warn(`[Worker] Cron job ${cronJobId} completed`)
    } catch (err) {
      console.error(`[Worker] Cron job ${cronJobId} failed:`, err)
      await cronEngine.recordFailure(cronJobId, String(err))
      throw err
    }
  })

  // Memory compaction — process pending promotions and decay stale memories
  await boss.work<{ workspaceId: string }>('memory:compact', async ([job]) => {
    const { workspaceId } = job.data
    console.warn(`[Worker] Compacting memory for workspace: ${workspaceId}`)
    try {
      const [promotions, decay] = await Promise.all([
        memoryService.processPromotions(),
        memoryService.decayConfidence(),
      ])
      console.warn(
        `[Worker] Memory compaction done: ${promotions.promoted} promoted, ` +
          `${promotions.rejected} rejected, ${decay.decayed} confidence-decayed`,
      )
    } catch (err) {
      console.error(`[Worker] Memory compaction failed for workspace ${workspaceId}:`, err)
      throw err
    }
  })

  // Eval suite execution — run all cases in a dataset
  await boss.work<{ datasetId: string }>('eval:run', async ([job]) => {
    const { datasetId } = job.data
    console.warn(`[Worker] Running eval suite: ${datasetId}`)
    try {
      const result = await evalRunner.runDataset(datasetId)
      console.warn(
        `[Worker] Eval run ${result.runId} finished: score=${result.overallScore.toFixed(3)}, ` +
          `passRate=${(result.passRate * 100).toFixed(1)}%`,
      )
    } catch (err) {
      console.error(`[Worker] Eval run failed for dataset ${datasetId}:`, err)
      throw err
    }
  })

  // Health monitoring — run full system diagnostics
  await boss.work<{ entityId: string }>('health:check', async ([job]) => {
    const { entityId } = job.data
    console.warn(`[Worker] Health check for entity: ${entityId}`)
    try {
      const report = await healingEngine.diagnose()
      console.warn(
        `[Worker] Health check complete: status=${report.overallStatus}, ` +
          `checks=${report.checks.length}, recommendations=${report.recommendations.length}`,
      )
    } catch (err) {
      console.error(`[Worker] Health check failed for entity ${entityId}:`, err)
      throw err
    }
  })

  // Instinct observation (background, cheap model) — flush buffered observations
  await boss.work('instinct:observe', async () => {
    console.warn(`[Worker] Observing instinct pattern`)
    try {
      const observer = new InstinctObserver({
        onFlush: async (observations) => {
          console.warn(`[Worker] Flushed ${observations.length} instinct observations`)
        },
      })
      await observer.flush()
      console.warn(`[Worker] Instinct observation cycle complete`)
    } catch (err) {
      console.error(`[Worker] Instinct observation failed:`, err)
      throw err
    }
  })

  // Self-healing cortex — full OODA cycle (Observe/Orient/Decide/Act/Learn)
  // Flushes evidence pipeline, runs recovery state machine, adaptive tuning,
  // degradation checks. Scheduled every 10 minutes.
  await boss.work('healing:cycle', async () => {
    console.warn('[Worker] Running cortex OODA cycle')
    try {
      const cortex = new SelfHealingCortex(db)
      const result = await cortex.runCycle()
      const actionsCount = result.phases.act?.healingActions?.length ?? 0
      const riskLevel = result.phases.orient?.riskLevel ?? 'unknown'
      console.warn(
        `[Worker] Cortex cycle complete: ${actionsCount} healing actions, risk=${riskLevel}`,
      )
    } catch (err) {
      console.error('[Worker] Cortex cycle failed:', err)
      throw err
    }
  })

  // Instinct pipeline — daily sweep: detect patterns, score confidence, promote candidates
  await boss.work('instinct:pipeline', async () => {
    console.warn('[Worker] Running instinct pipeline sweep')
    try {
      const result = await runInstinctPipeline(db)
      console.warn(
        `[Worker] Instinct pipeline done: ${result.observationsProcessed} obs processed, ` +
          `${result.candidatesCreated} candidates, ${result.promoted} promoted, ` +
          `${result.decayed} decayed`,
      )
    } catch (err) {
      console.error('[Worker] Instinct pipeline failed:', err)
      throw err
    }
  })

  // Instinct evolution — weekly sweep: cluster mature instincts into Skills and Commands
  await boss.work('instinct:evolve', async () => {
    console.warn('[Worker] Running instinct evolution sweep')
    try {
      const allInstincts = await db.query.instincts.findMany({
        orderBy: (t, { desc }) => [desc(t.confidence)],
        limit: 500,
      })

      const evolver = new InstinctEvolver()
      const clusters = evolver.findRelatedClusters(
        allInstincts.map((i) => ({
          ...i,
          domain: i.domain ?? 'universal',
          entityId: i.entityId ?? '',
          evidenceCount: i.evidenceCount ?? 1,
          lastObservedAt: i.lastObservedAt ?? new Date(),
          createdAt: i.createdAt,
          updatedAt: i.updatedAt,
        })),
      )

      let evolved = 0
      for (const cluster of clusters) {
        const result = await evolver.evolveToSkill(cluster)
        if (result) evolved++
      }
      console.warn(
        `[Worker] Instinct evolution done: ${clusters.length} clusters, ${evolved} evolved to skills`,
      )
    } catch (err) {
      console.error('[Worker] Instinct evolution failed:', err)
      throw err
    }
  })

  // === Periodic schedules (idempotent — pg-boss deduplicates by schedule name) ===
  await boss.schedule('healing:cycle', '*/10 * * * *', {}) // every 10 min
  await boss.schedule('instinct:pipeline', '0 2 * * *', {}) // daily at 02:00
  await boss.schedule('instinct:evolve', '0 3 * * 0', {}) // weekly on Sunday at 03:00

  console.warn('[Worker] All job handlers registered. Waiting for jobs...')

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.warn('[Worker] SIGTERM received, shutting down...')
    await boss.stop()
    process.exit(0)
  })

  process.on('SIGINT', async () => {
    console.warn('[Worker] SIGINT received, shutting down...')
    await boss.stop()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('[Worker] Fatal error:', err)
  process.exit(1)
})
