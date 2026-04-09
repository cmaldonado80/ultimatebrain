/**
 * SSE endpoint for the Corporation Command Center.
 *
 * Multiplexes real-time data from multiple subsystems into a unified
 * event stream: active agents, tickets, swarms, healing, costs,
 * knowledge mesh, and cron activity.
 *
 * Protocol: text/event-stream (SSE)
 */

export const dynamic = 'force-dynamic'

import {
  agents,
  createDb,
  cronJobs,
  ephemeralSwarms,
  gatewayMetrics,
  healingLogs,
  swarmAgents,
  tickets,
  waitForSchema,
} from '@solarc/db'
import { and, desc, eq, gte, sql } from 'drizzle-orm'

const STREAM_INTERVAL_MS = 5000
const HEARTBEAT_INTERVAL_MS = 15000

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

      let db: ReturnType<typeof createDb> | null = null
      try {
        const url = process.env.DATABASE_URL
        if (url) {
          db = createDb(url)
          await waitForSchema()
        }
      } catch {
        // DB not available
      }

      send('connected', { timestamp: new Date().toISOString() })

      const tick = async () => {
        if (closed || !db) return

        try {
          // Agent overview
          const agentRows = await db
            .select({
              total: sql<number>`count(*)`,
              active: sql<number>`count(*) filter (where ${agents.status} IN ('planning', 'executing', 'reviewing'))`,
              idle: sql<number>`count(*) filter (where ${agents.status} = 'idle')`,
              error: sql<number>`count(*) filter (where ${agents.status} = 'error')`,
              offline: sql<number>`count(*) filter (where ${agents.status} = 'offline')`,
            })
            .from(agents)
          send('agents', agentRows[0])

          // Ticket overview (last 24h)
          const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
          const ticketRows = await db
            .select({
              open: sql<number>`count(*) filter (where ${tickets.status} IN ('open', 'in_progress', 'queued'))`,
              done: sql<number>`count(*) filter (where ${tickets.status} = 'done' AND ${tickets.updatedAt} >= ${since24h})`,
              failed: sql<number>`count(*) filter (where ${tickets.status} = 'failed' AND ${tickets.updatedAt} >= ${since24h})`,
            })
            .from(tickets)
          send('tickets', ticketRows[0])

          // Active swarms
          const swarms = await db
            .select({
              id: ephemeralSwarms.id,
              task: ephemeralSwarms.task,
              status: ephemeralSwarms.status,
              createdAt: ephemeralSwarms.createdAt,
            })
            .from(ephemeralSwarms)
            .where(eq(ephemeralSwarms.status, 'active'))
            .limit(5)

          // Count members per swarm
          const swarmIds = swarms.map((s) => s.id)
          let swarmMemberCounts: Record<string, number> = {}
          if (swarmIds.length > 0) {
            const memberRows = await db
              .select({
                swarmId: swarmAgents.swarmId,
                count: sql<number>`count(*)`,
              })
              .from(swarmAgents)
              .where(
                sql`${swarmAgents.swarmId} IN (${sql.join(
                  swarmIds.map((id) => sql`${id}`),
                  sql`, `,
                )})`,
              )
              .groupBy(swarmAgents.swarmId)
            swarmMemberCounts = Object.fromEntries(
              memberRows.map((r) => [r.swarmId, Number(r.count)]),
            )
          }

          send('swarms', {
            active: swarms.length,
            swarms: swarms.map((s) => ({
              id: s.id,
              task: s.task,
              members: swarmMemberCounts[s.id] ?? 0,
              createdAt: s.createdAt,
            })),
          })

          // Cost snapshot (last 1h)
          const since1h = new Date(Date.now() - 60 * 60 * 1000)
          const [costRow] = await db
            .select({
              costUsd: sql<number>`coalesce(sum(${gatewayMetrics.costUsd}), 0)`,
              calls: sql<number>`count(*)`,
            })
            .from(gatewayMetrics)
            .where(gte(gatewayMetrics.createdAt, since1h))
          send('costs', {
            lastHourUsd: Number(costRow?.costUsd ?? 0),
            lastHourCalls: Number(costRow?.calls ?? 0),
          })

          // Healing (last 1h)
          const [healingRow] = await db
            .select({ count: sql<number>`count(*)` })
            .from(healingLogs)
            .where(gte(healingLogs.createdAt, since1h))
          send('healing', { lastHourActions: Number(healingRow?.count ?? 0) })

          // Recent cron activity
          const recentCron = await db
            .select({
              name: cronJobs.name,
              status: cronJobs.status,
              lastRun: cronJobs.lastRun,
              lastResult: cronJobs.lastResult,
            })
            .from(cronJobs)
            .where(and(gte(cronJobs.lastRun, since1h)))
            .orderBy(desc(cronJobs.lastRun))
            .limit(5)
          send('cron', {
            recentRuns: recentCron.map((c) => ({
              name: c.name,
              status: c.status,
              lastRun: c.lastRun,
              failed: c.lastResult?.startsWith('FAILED') ?? false,
            })),
          })

          // Recent activity feed (last 10 ticket updates)
          const recentTickets = await db
            .select({
              id: tickets.id,
              title: tickets.title,
              status: tickets.status,
              updatedAt: tickets.updatedAt,
            })
            .from(tickets)
            .orderBy(desc(tickets.updatedAt))
            .limit(8)
          send('activity', {
            items: recentTickets.map((t) => ({
              type: 'ticket',
              id: t.id,
              title: t.title,
              status: t.status,
              timestamp: t.updatedAt,
            })),
          })
        } catch {
          // Non-critical — skip this tick
        }
      }

      // Initial push
      await tick()

      const metricInterval = setInterval(tick, STREAM_INTERVAL_MS)

      const heartbeatInterval = setInterval(() => {
        if (closed) return
        send('heartbeat', { timestamp: new Date().toISOString() })
      }, HEARTBEAT_INTERVAL_MS)

      const cleanup = () => {
        closed = true
        clearInterval(metricInterval)
        clearInterval(heartbeatInterval)
      }

      // Auto-cleanup after 5 minutes
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
