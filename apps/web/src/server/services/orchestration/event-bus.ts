/**
 * In-Process Event Bus
 *
 * Simple event emitter for coordinating system-wide events such as ticket
 * lifecycle changes, agent errors, and health degradation signals.
 *
 * Wired to the Self-Healing Cortex: agent outcomes and errors feed into
 * predictive analysis, adaptive tuning, instinct execution, and degradation.
 */

import { logger } from '../../../lib/logger'

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
})

eventBus.on('ticket.completed', async (payload) => {
  console.warn(`[EventBus] ticket.completed: ${payload.ticketId}`)

  // Feed success outcome to Cortex for adaptive tuning + degradation tracking
  try {
    const { getCortex } = await import('../healing/index')
    const cortex = getCortex()
    if (cortex && payload.agentId && payload.agentName) {
      cortex.recordAgentOutcome(
        payload.agentId as string,
        payload.agentName as string,
        true,
        (payload.durationMs as number) ?? 0,
        (payload.tokensUsed as number) ?? 0,
      )
    }
  } catch {
    // Non-critical
  }
})

eventBus.on('ticket.failed', async (payload) => {
  console.warn(
    `[EventBus] ticket.failed: ${payload.ticketId} — reason: ${payload.reason ?? 'unknown'}`,
  )

  // Feed failure outcome to Cortex
  try {
    const { getCortex } = await import('../healing/index')
    const cortex = getCortex()
    if (cortex && payload.agentId && payload.agentName) {
      cortex.recordAgentOutcome(
        payload.agentId as string,
        payload.agentName as string,
        false,
        (payload.durationMs as number) ?? 0,
        (payload.tokensUsed as number) ?? 0,
      )
    }

    // Also feed through instinct executor for pattern-based auto-remediation
    if (cortex) {
      cortex.instinctExecutor
        .processEvent({
          eventType: 'ticket.failed',
          domain: (payload.domain as string) ?? 'unknown',
          payload: payload as Record<string, unknown>,
          entityId: payload.agentId as string | undefined,
        })
        .catch((err) =>
          logger.warn({ err, event: 'ticket.failed' }, 'eventbus: instinct processEvent failed'),
        )
    }
  } catch {
    // Non-critical
  }
})

eventBus.on('agent.error', async (payload) => {
  console.warn(
    `[EventBus] agent.error: agent ${payload.agentId} — ${payload.error ?? 'unknown error'}`,
  )

  // Feed to Cortex instinct executor for pattern-based remediation
  try {
    const { getCortex } = await import('../healing/index')
    const cortex = getCortex()
    if (cortex) {
      cortex.instinctExecutor
        .processEvent({
          eventType: 'agent.error',
          domain: (payload.domain as string) ?? 'agent',
          payload: payload as Record<string, unknown>,
          entityId: payload.agentId as string | undefined,
        })
        .catch((err) =>
          logger.warn({ err, event: 'agent.error' }, 'eventbus: instinct processEvent failed'),
        )

      // Record as failure for degradation tracking
      if (payload.agentId && payload.agentName) {
        cortex.recordAgentOutcome(
          payload.agentId as string,
          payload.agentName as string,
          false,
          0,
          0,
        )
      }
    }
  } catch {
    // Non-critical
  }
})

eventBus.on('health.degraded', async (payload) => {
  console.warn(
    `[EventBus] health.degraded: status=${payload.status} issues=${payload.issueCount ?? 'unknown'}`,
  )

  // Trigger Cortex OODA cycle on health degradation
  try {
    const { getCortex } = await import('../healing/index')
    const cortex = getCortex()
    if (cortex && !cortex.getStatus().isRunning) {
      const result = await cortex.runCycle()
      const totalActions =
        result.phases.act.healingActions.length +
        result.phases.act.recoveryExecutions.length +
        result.phases.act.tuningActions.length +
        result.phases.act.degradationEvents.length
      if (totalActions > 0) {
        console.warn(
          `[EventBus] Cortex OODA cycle completed: ${totalActions} action(s), risk=${result.phases.orient.riskLevel}`,
        )
      }
    } else {
      // Fallback: run base healing engine directly
      const { createDb } = await import('@solarc/db')
      const { HealingEngine } = await import('../healing/healing-engine')
      const url = process.env.DATABASE_URL
      if (!url) return
      const db = createDb(url)
      const healer = new HealingEngine(db)
      await healer.autoHeal()
    }
  } catch {
    // Auto-heal may fail in test environments — non-critical
  }
})

eventBus.on('brain.seeded', async (payload) => {
  console.warn(`[EventBus] brain.seeded: workspace ${payload.workspaceId}`)
})
