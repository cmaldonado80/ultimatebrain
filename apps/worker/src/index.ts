import PgBoss from 'pg-boss'
import { createDb } from '@solarc/db'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:dev@localhost:5432/solarc'

async function main() {
  console.log('[Worker] Starting pg-boss worker...')

  const db = createDb(DATABASE_URL)
  const boss = new PgBoss(DATABASE_URL)

  boss.on('error', (err) => console.error('[Worker] pg-boss error:', err))

  await boss.start()
  console.log('[Worker] pg-boss started.')

  // === Job Handlers ===

  // Ticket execution (autonomous mode)
  await boss.work('ticket:execute', async (job) => {
    console.log(`[Worker] Executing ticket: ${job.data.ticketId}`)
    // TODO: Phase 1+ — route through AI Gateway, apply guardrails, execute with LLM
  })

  // Cron job execution
  await boss.work('cron:execute', async (job) => {
    console.log(`[Worker] Executing cron job: ${job.data.cronJobId}`)
    // TODO: Phase 6 — implement cron execution through orchestration engine
  })

  // Memory compaction
  await boss.work('memory:compact', async (job) => {
    console.log(`[Worker] Compacting memory for workspace: ${job.data.workspaceId}`)
    // TODO: Phase 4 — summarize old recall into archival, prune duplicates
  })

  // Eval suite execution
  await boss.work('eval:run', async (job) => {
    console.log(`[Worker] Running eval suite: ${job.data.datasetId}`)
    // TODO: Phase 7 — replay eval cases, compare scores
  })

  // Health monitoring
  await boss.work('health:check', async (job) => {
    console.log(`[Worker] Health check for entity: ${job.data.entityId}`)
    // TODO: Phase 17C — healing engine health checks
  })

  // Instinct observation (background, cheap model)
  await boss.work('instinct:observe', async (job) => {
    console.log(`[Worker] Observing instinct pattern`)
    // TODO: ECC instinct system — Haiku analyzes tool call patterns
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
