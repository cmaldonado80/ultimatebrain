// Vercel Cron Route — runs scheduled tasks like health sweeps.
// Configure in vercel.json: crons: [{ path: "/api/cron", schedule: "every 5 minutes" }]

export const dynamic = 'force-dynamic'

import { createDb, waitForSchema } from '@solarc/db'
import { SystemOrchestrator } from '../../../server/services/orchestration'
import { HealingEngine } from '../../../server/services/healing/healing-engine'

export async function GET() {
  try {
    const url = process.env.DATABASE_URL
    if (!url) return Response.json({ error: 'DATABASE_URL not set' }, { status: 503 })

    const db = createDb(url)
    await waitForSchema()

    const orchestrator = new SystemOrchestrator(db)
    const healer = new HealingEngine(db)

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
    })
  } catch (err) {
    return Response.json(
      { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
