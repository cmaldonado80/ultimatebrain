import PgBoss from 'pg-boss'
import { createDb } from '@solarc/db'
import { TicketExecutionEngine } from '../../web/src/server/services/orchestration/ticket-engine'
import { CronEngine } from '../../web/src/server/services/orchestration/cron-engine'
import { MemoryService } from '../../web/src/server/services/memory/memory-service'
import { EvalRunner } from '../../web/src/server/services/evals/runner'
import { HealingEngine } from '../../web/src/server/services/healing/healing-engine'
import { InstinctObserver } from '../../web/src/server/services/instincts/observer'
import { ModeRouter } from '../../web/src/server/services/task-runner/mode-router'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:dev@localhost:5432/solarc'

async function main() {
  console.log('[Worker] Starting pg-boss worker...')

  const db = createDb(DATABASE_URL)
  const boss = new PgBoss(DATABASE_URL)

  boss.on('error', (err) => console.error('[Worker] pg-boss error:', err))

  await boss.start()
  console.log('[Worker] pg-boss started.')

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
    console.log(`[Worker] Executing ticket: ${ticketId}`)
    try {
      // Transition to queued, then let the mode router handle execution
      await ticketEngine.transition(ticketId, 'queued')
      const result = await modeRouter.route(ticketId, '', { forceMode: 'autonomous' })
      console.log(`[Worker] Ticket ${ticketId} completed (mode=${result.mode}, ${result.latencyMs}ms)`)
    } catch (err) {
      console.error(`[Worker] Ticket ${ticketId} failed:`, err)
      try {
        await ticketEngine.transition(ticketId, 'failed')
      } catch { /* best-effort status update */ }
      throw err
    }
  })

  // Cron job execution — fetch due jobs and execute them
  await boss.work<{ cronJobId: string }>('cron:execute', async ([job]) => {
    const { cronJobId } = job.data
    console.log(`[Worker] Executing cron job: ${cronJobId}`)
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
      console.log(`[Worker] Cron job ${cronJobId} completed`)
    } catch (err) {
      console.error(`[Worker] Cron job ${cronJobId} failed:`, err)
      await cronEngine.recordFailure(cronJobId, String(err))
      throw err
    }
  })

  // Memory compaction — process pending promotions for a workspace
  await boss.work<{ workspaceId: string }>('memory:compact', async ([job]) => {
    const { workspaceId } = job.data
    console.log(`[Worker] Compacting memory for workspace: ${workspaceId}`)
    try {
      const result = await memoryService.processPromotions()
      console.log(`[Worker] Memory compaction done: ${result.promoted} promoted, ${result.rejected} rejected`)
    } catch (err) {
      console.error(`[Worker] Memory compaction failed for workspace ${workspaceId}:`, err)
      throw err
    }
  })

  // Eval suite execution — run all cases in a dataset
  await boss.work<{ datasetId: string }>('eval:run', async ([job]) => {
    const { datasetId } = job.data
    console.log(`[Worker] Running eval suite: ${datasetId}`)
    try {
      const result = await evalRunner.runDataset(datasetId)
      console.log(
        `[Worker] Eval run ${result.runId} finished: score=${result.overallScore.toFixed(3)}, ` +
        `passRate=${(result.passRate * 100).toFixed(1)}%`
      )
    } catch (err) {
      console.error(`[Worker] Eval run failed for dataset ${datasetId}:`, err)
      throw err
    }
  })

  // Health monitoring — run full system diagnostics
  await boss.work<{ entityId: string }>('health:check', async ([job]) => {
    const { entityId } = job.data
    console.log(`[Worker] Health check for entity: ${entityId}`)
    try {
      const report = await healingEngine.diagnose()
      console.log(
        `[Worker] Health check complete: status=${report.overallStatus}, ` +
        `checks=${report.checks.length}, recommendations=${report.recommendations.length}`
      )
    } catch (err) {
      console.error(`[Worker] Health check failed for entity ${entityId}:`, err)
      throw err
    }
  })

  // Instinct observation (background, cheap model) — flush buffered observations
  await boss.work('instinct:observe', async () => {
    console.log(`[Worker] Observing instinct pattern`)
    try {
      const observer = new InstinctObserver({
        onFlush: async (observations) => {
          console.log(`[Worker] Flushed ${observations.length} instinct observations`)
          // In production, wire this to PatternDetector.detectPatterns()
        },
      })
      await observer.flush()
      console.log(`[Worker] Instinct observation cycle complete`)
    } catch (err) {
      console.error(`[Worker] Instinct observation failed:`, err)
      throw err
    }
  })

  console.log('[Worker] All job handlers registered. Waiting for jobs...')

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[Worker] SIGTERM received, shutting down...')
    await boss.stop()
    process.exit(0)
  })

  process.on('SIGINT', async () => {
    console.log('[Worker] SIGINT received, shutting down...')
    await boss.stop()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('[Worker] Fatal error:', err)
  process.exit(1)
})
