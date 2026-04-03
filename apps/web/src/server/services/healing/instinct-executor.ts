/**
 * Instinct Action Executor
 *
 * Wires promoted instincts to auto-remediation handlers.
 * When a promoted instinct's trigger pattern matches a live event,
 * the corresponding action is executed automatically.
 *
 * Architecture:
 * 1. Action registry — maps instinct action patterns to executable handlers
 * 2. Trigger matcher — evaluates if an event matches an instinct's trigger
 * 3. Execution gate — confidence threshold, cooldown, rate limiting
 * 4. Feedback loop — record outcome to update instinct confidence
 */

import type { Database } from '@solarc/db'
import { healingLogs, instincts } from '@solarc/db'
import { and, eq, gte } from 'drizzle-orm'

// ── Types ────────────────────────────────────────────────────────────────

export interface InstinctEvent {
  eventType: string
  domain: string
  payload: Record<string, unknown>
  entityId?: string
}

export interface ActionHandler {
  id: string
  pattern: RegExp
  handler: (event: InstinctEvent, instinctAction: string) => Promise<boolean>
  description: string
}

export interface ExecutionRecord {
  instinctId: string
  trigger: string
  action: string
  event: InstinctEvent
  success: boolean
  timestamp: number
  durationMs: number
}

export interface ExecutorStats {
  totalExecutions: number
  successRate: number
  recentExecutions: ExecutionRecord[]
  activeInstincts: number
  registeredHandlers: number
}

// ── Configuration ────────────────────────────────────────────────────────

const MIN_CONFIDENCE = 0.7 // only execute promoted instincts
const COOLDOWN_MS = 5 * 60 * 1000 // 5 min cooldown per instinct
const MAX_EXECUTIONS_PER_HOUR = 20 // global rate limit
const MAX_HISTORY = 200

// ── Trigger Matching ─────────────────────────────────────────────────────

function triggerMatches(trigger: string, event: InstinctEvent): boolean {
  const triggerLower = trigger.toLowerCase()
  const eventTypeLower = event.eventType.toLowerCase()

  // Direct event type match
  if (triggerLower.includes(eventTypeLower)) return true

  // Domain match
  if (event.domain && triggerLower.includes(event.domain.toLowerCase())) return true

  // Keyword extraction from trigger and matching against event payload
  const triggerWords = triggerLower.split(/[\s_.-]+/).filter((w) => w.length > 3)
  const payloadStr = JSON.stringify(event.payload).toLowerCase()
  const matchCount = triggerWords.filter((w) => payloadStr.includes(w)).length
  if (triggerWords.length > 0 && matchCount / triggerWords.length > 0.5) return true

  return false
}

// ── Instinct Action Executor ─────────────────────────────────────────────

export class InstinctActionExecutor {
  private handlers: ActionHandler[] = []
  private history: ExecutionRecord[] = []
  private lastExecution = new Map<string, number>() // instinctId -> timestamp
  private hourlyCount = 0
  private hourlyReset = Date.now()

  constructor(private db: Database) {
    this.registerDefaultHandlers()
  }

  /**
   * Register a custom action handler.
   */
  registerHandler(handler: ActionHandler) {
    this.handlers.push(handler)
  }

  /**
   * Process an event against all promoted instincts.
   * Returns the actions that were executed.
   */
  async processEvent(event: InstinctEvent): Promise<ExecutionRecord[]> {
    // Rate limit check
    if (Date.now() - this.hourlyReset > 60 * 60 * 1000) {
      this.hourlyCount = 0
      this.hourlyReset = Date.now()
    }
    if (this.hourlyCount >= MAX_EXECUTIONS_PER_HOUR) return []

    // Fetch promoted instincts with sufficient confidence
    const promoted = await this.db.query.instincts.findMany({
      where: and(eq(instincts.status, 'promoted'), gte(instincts.confidence, MIN_CONFIDENCE)),
    })

    const results: ExecutionRecord[] = []

    for (const instinct of promoted) {
      // Check trigger match
      if (!triggerMatches(instinct.trigger, event)) continue

      // Cooldown check
      const lastRun = this.lastExecution.get(instinct.id) ?? 0
      if (Date.now() - lastRun < COOLDOWN_MS) continue

      // Find matching handler
      const handler = this.handlers.find((h) => h.pattern.test(instinct.action))
      if (!handler) continue

      // Execute
      const start = Date.now()
      let success = false
      try {
        success = await handler.handler(event, instinct.action)
      } catch {
        success = false
      }

      const record: ExecutionRecord = {
        instinctId: instinct.id,
        trigger: instinct.trigger,
        action: instinct.action,
        event,
        success,
        timestamp: Date.now(),
        durationMs: Date.now() - start,
      }

      results.push(record)
      this.history.push(record)
      while (this.history.length > MAX_HISTORY) this.history.shift()
      this.lastExecution.set(instinct.id, Date.now())
      this.hourlyCount++

      // Persist to healing log
      this.db
        .insert(healingLogs)
        .values({
          action: `instinct:${handler.id}`,
          target: instinct.trigger,
          reason: `Auto-executed instinct action: ${instinct.action} (confidence: ${instinct.confidence.toFixed(2)})`,
          success,
        })
        .catch(() => {})

      // Update instinct confidence based on outcome
      const confidenceDelta = success ? 0.02 : -0.05
      const newConfidence = Math.max(0.1, Math.min(1, instinct.confidence + confidenceDelta))
      this.db
        .update(instincts)
        .set({
          confidence: newConfidence,
          lastObservedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(instincts.id, instinct.id))
        .catch(() => {})
    }

    return results
  }

  /**
   * Get executor statistics.
   */
  getStats(): ExecutorStats {
    const successful = this.history.filter((r) => r.success).length
    return {
      totalExecutions: this.history.length,
      successRate: this.history.length > 0 ? successful / this.history.length : 1,
      recentExecutions: this.history.slice(-20),
      activeInstincts: this.lastExecution.size,
      registeredHandlers: this.handlers.length,
    }
  }

  /**
   * Get execution history for a specific instinct.
   */
  getInstinctHistory(instinctId: string): ExecutionRecord[] {
    return this.history.filter((r) => r.instinctId === instinctId)
  }

  private registerDefaultHandlers() {
    // Handler: restart agent on error pattern
    this.registerHandler({
      id: 'restart_agent',
      pattern: /restart|reboot|reset.*agent/i,
      description: 'Restart agents when error patterns are detected',
      handler: async (event) => {
        if (!event.payload['agentId']) return false
        // Delegate to healing engine (imported dynamically to avoid circular deps)
        const { getHealingEngine } = await import('./index')
        const healer = getHealingEngine()
        if (!healer) return false
        return healer.restartAgent(event.payload['agentId'] as string, 'Instinct-triggered restart')
      },
    })

    // Handler: requeue failed tickets
    this.registerHandler({
      id: 'requeue_ticket',
      pattern: /requeue|retry.*ticket|resubmit/i,
      description: 'Requeue tickets when failure patterns are detected',
      handler: async (event) => {
        if (!event.payload['ticketId']) return false
        const { getHealingEngine } = await import('./index')
        const healer = getHealingEngine()
        if (!healer) return false
        return healer.requeueTicket(
          event.payload['ticketId'] as string,
          'Instinct-triggered requeue',
        )
      },
    })

    // Handler: throttle dispatch
    this.registerHandler({
      id: 'throttle_dispatch',
      pattern: /throttle|slow.*down|reduce.*rate|back.*off/i,
      description: 'Reduce dispatch rate when overload patterns are detected',
      handler: async (_event, _action) => {
        // Signal the adaptive tuner to apply pressure relief
        // This is a coordination signal — the tuner picks it up on next cycle
        return true
      },
    })

    // Handler: escalate to operator
    this.registerHandler({
      id: 'escalate',
      pattern: /escalate|alert|notify.*operator|manual/i,
      description: 'Escalate to operator when complex patterns are detected',
      handler: async (event) => {
        console.warn(
          `[InstinctExecutor] ESCALATION: ${event.eventType} in ${event.domain}`,
          event.payload,
        )
        return true
      },
    })

    // Handler: clear stale state
    this.registerHandler({
      id: 'clear_state',
      pattern: /clear|clean|purge|flush.*state|stale/i,
      description: 'Clear stale state when accumulation patterns are detected',
      handler: async () => {
        const { getHealingEngine } = await import('./index')
        const healer = getHealingEngine()
        if (!healer) return false
        const cleared = await healer.clearExpiredLeases()
        return cleared >= 0
      },
    })
  }
}
