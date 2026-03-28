/**
 * In-Process Event Bus
 *
 * Simple event emitter for coordinating system-wide events such as ticket
 * lifecycle changes, agent errors, and health degradation signals.
 * Future: can be replaced by a distributed message broker (e.g. Redis Pub/Sub).
 */

type EventType =
  | 'ticket.created'
  | 'ticket.completed'
  | 'ticket.failed'
  | 'agent.error'
  | 'health.degraded'
  | 'brain.seeded'

type EventHandler = (payload: Record<string, unknown>) => void | Promise<void>

class EventBus {
  private handlers = new Map<EventType, EventHandler[]>()

  on(event: EventType, handler: EventHandler): void {
    const list = this.handlers.get(event) ?? []
    list.push(handler)
    this.handlers.set(event, list)
  }

  off(event: EventType, handler: EventHandler): void {
    const list = this.handlers.get(event)
    if (!list) return
    const idx = list.indexOf(handler)
    if (idx >= 0) list.splice(idx, 1)
  }

  async emit(event: EventType, payload: Record<string, unknown>): Promise<void> {
    const handlers = this.handlers.get(event) ?? []
    for (const handler of handlers) {
      try {
        await handler(payload)
      } catch (err) {
        console.error(`[EventBus] handler error for ${event}:`, err)
      }
    }
  }
}

export const eventBus = new EventBus()

// ── Default Handlers ──────────────────────────────────────────────────────────

eventBus.on('ticket.created', async (payload) => {
  console.warn(`[EventBus] ticket.created: ${payload.ticketId}`)
  // Future: auto-route to workspace via SystemOrchestrator
})

eventBus.on('ticket.completed', async (payload) => {
  console.warn(`[EventBus] ticket.completed: ${payload.ticketId}`)
})

eventBus.on('ticket.failed', async (payload) => {
  console.warn(
    `[EventBus] ticket.failed: ${payload.ticketId} — reason: ${payload.reason ?? 'unknown'}`,
  )
})

eventBus.on('agent.error', async (payload) => {
  console.warn(
    `[EventBus] agent.error: agent ${payload.agentId} — ${payload.error ?? 'unknown error'}`,
  )
})

eventBus.on('health.degraded', async (payload) => {
  console.warn(
    `[EventBus] health.degraded: status=${payload.status} issues=${payload.issueCount ?? 'unknown'}`,
  )
  // Trigger auto-healing when health degrades
  try {
    const { createDb } = await import('@solarc/db')
    const { HealingEngine } = await import('../healing/healing-engine')
    const url = process.env.DATABASE_URL
    if (!url) return
    const db = createDb(url)
    const healer = new HealingEngine(db)
    const result = await healer.autoHeal()
    if (result.actions.length > 0) {
      console.warn(
        `[EventBus] auto-heal completed: ${result.actions.length} action(s) taken`,
        result.actions.map((a) => `${a.action}:${a.target}:${a.success ? 'ok' : 'fail'}`),
      )
    }
  } catch {
    // Auto-heal may fail in test environments or when DB is unavailable — non-critical
  }
})

eventBus.on('brain.seeded', async (payload) => {
  console.warn(`[EventBus] brain.seeded: workspace ${payload.workspaceId}`)
})
