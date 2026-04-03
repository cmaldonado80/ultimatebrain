/**
 * SSE (Server-Sent Events) endpoint for real-time Nerve Center updates.
 *
 * Streams cortex status, predictive metrics, and sandbox events to the
 * Nerve Center UI without polling. Falls back gracefully if cortex isn't
 * initialized.
 *
 * Protocol: text/event-stream (SSE)
 * Events: cortex_status, metric_update, sandbox_event, heartbeat
 */

export const dynamic = 'force-dynamic'

import { createDb, waitForSchema } from '@solarc/db'

import { getOrCreateCortex } from '../../../../server/services/healing/index'
import { getSandboxOrchestrator } from '../../../../server/services/sandbox/index'

const STREAM_INTERVAL_MS = 3000 // Push updates every 3s
const HEARTBEAT_INTERVAL_MS = 15000 // Keep-alive every 15s

export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false

      const send = (event: string, data: unknown) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          closed = true
        }
      }

      // Initialize DB + Cortex
      let cortex: ReturnType<typeof getOrCreateCortex> | null = null
      try {
        const url = process.env.DATABASE_URL
        if (url) {
          const db = createDb(url)
          await waitForSchema()
          cortex = getOrCreateCortex(db)
        }
      } catch {
        // DB not available — stream sandbox-only data
      }

      const orchestrator = getSandboxOrchestrator()

      // Initial push
      send('connected', { timestamp: new Date().toISOString() })

      // Metric collection loop
      const metricInterval = setInterval(async () => {
        if (closed) return

        try {
          // Cortex status
          if (cortex) {
            const status = cortex.getStatus()
            send('cortex_status', {
              systemHealth: status.systemHealth,
              isRunning: status.isRunning,
              cycleCount: status.cycleCount,
              totalHealingActions: status.totalHealingActions,
              totalRecoveries: status.totalRecoveries,
              totalDegradations: status.totalDegradations,
            })

            // Predictive metrics (lighter than full report)
            const snapshot = cortex.predictor.getMetricSnapshot()
            const metrics: Record<string, number[]> = {}
            for (const [key, samples] of Object.entries(snapshot)) {
              metrics[key] = (samples as Array<{ value: number }>).map((s) => s.value)
            }
            if (Object.keys(metrics).length > 0) {
              send('metric_update', { metrics })
            }

            // Degradation summary
            const profiles = cortex.degradation.getAllProfiles()
            if (profiles.length > 0) {
              send('degradation_summary', {
                total: profiles.length,
                full: profiles.filter((p) => p.level === 'full').length,
                reduced: profiles.filter((p) => p.level === 'reduced').length,
                minimal: profiles.filter((p) => p.level === 'minimal').length,
                suspended: profiles.filter((p) => p.level === 'suspended').length,
              })
            }
          }

          // Sandbox stats
          const sandboxStatus = orchestrator.getStatus()
          send('sandbox_event', {
            totalExecutions: sandboxStatus.executor.totalExecutions,
            blockedByPolicy: sandboxStatus.executor.blockedByPolicy,
            timeouts: sandboxStatus.executor.timeouts,
            poolSize: sandboxStatus.poolStats.total,
            successRate: sandboxStatus.audit.successRate,
          })
        } catch {
          // Non-critical — skip this tick
        }
      }, STREAM_INTERVAL_MS)

      // Heartbeat to keep connection alive
      const heartbeatInterval = setInterval(() => {
        if (closed) return
        send('heartbeat', { timestamp: new Date().toISOString() })
      }, HEARTBEAT_INTERVAL_MS)

      // Cleanup on close
      const cleanup = () => {
        closed = true
        clearInterval(metricInterval)
        clearInterval(heartbeatInterval)
      }

      // Auto-cleanup after 5 minutes (client should reconnect)
      setTimeout(
        () => {
          cleanup()
          try {
            controller.close()
          } catch {
            // Already closed
          }
        },
        5 * 60 * 1000,
      )
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
