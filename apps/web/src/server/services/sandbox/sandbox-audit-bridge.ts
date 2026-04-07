/**
 * Sandbox Audit Bridge
 *
 * Bridges sandbox execution events into the healing cortex, instinct
 * pipeline, and adaptive tuner. Every sandbox action generates signals
 * that feed the OS's autonomous nervous system.
 *
 * Event flow:
 *   Sandbox execution → Audit Bridge
 *     → Healing Cortex (outcome tracking for adaptive tuning + degradation)
 *     → Instinct Observer (pattern detection for auto-remediation)
 *     → Event Bus (system-wide notification)
 */

import { logger } from '../../../lib/logger'
import type { SandboxViolation } from './sandbox-manager'
import type { PolicyCheckResult } from './sandbox-policy'

// ── Types ────────────────────────────────────────────────────────────────

export interface SandboxAuditEntry {
  timestamp: number
  sandboxId: string
  agentId: string
  agentName: string
  toolName: string
  durationMs: number
  success: boolean
  policyVerdict: 'pass' | 'warn' | 'block'
  violations: SandboxViolation[]
  policyChecks: PolicyCheckResult[]
  outputSizeBytes: number
}

export interface AuditSummary {
  totalEntries: number
  successRate: number
  policyBlocks: number
  policyWarns: number
  resourceViolations: number
  timeouts: number
  crashes: number
  avgDurationMs: number
  topBlockedTools: Array<{ tool: string; count: number }>
  topViolatingAgents: Array<{ agentId: string; agentName: string; count: number }>
}

// ── Audit Bridge ─────────────────────────────────────────────────────────

const MAX_AUDIT_ENTRIES = 1000

export class SandboxAuditBridge {
  private entries: SandboxAuditEntry[] = []

  /**
   * Record a sandbox execution event.
   */
  record(entry: SandboxAuditEntry) {
    this.entries.push(entry)
    while (this.entries.length > MAX_AUDIT_ENTRIES) this.entries.shift()

    // Feed to healing cortex (async, non-blocking)
    this.feedCortex(entry).catch((err) => logger.warn({ err }, 'sandbox audit: feedCortex failed'))

    // Feed to instinct observer (async, non-blocking)
    this.feedInstincts(entry).catch((err) =>
      logger.warn({ err }, 'sandbox audit: feedInstincts failed'),
    )

    // Feed to event bus (async, non-blocking)
    this.feedEventBus(entry).catch((err) =>
      logger.warn({ err }, 'sandbox audit: feedEventBus failed'),
    )
  }

  /**
   * Get audit summary.
   */
  getSummary(): AuditSummary {
    const entries = this.entries
    const total = entries.length
    if (total === 0) {
      return {
        totalEntries: 0,
        successRate: 1,
        policyBlocks: 0,
        policyWarns: 0,
        resourceViolations: 0,
        timeouts: 0,
        crashes: 0,
        avgDurationMs: 0,
        topBlockedTools: [],
        topViolatingAgents: [],
      }
    }

    const successes = entries.filter((e) => e.success).length
    const blocks = entries.filter((e) => e.policyVerdict === 'block').length
    const warns = entries.filter((e) => e.policyVerdict === 'warn').length
    const resourceViolations = entries.filter((e) =>
      e.violations.some((v) => v.type === 'resource_limit'),
    ).length
    const timeouts = entries.filter((e) => e.violations.some((v) => v.type === 'timeout')).length
    const crashes = entries.filter((e) => e.violations.some((v) => v.type === 'crash')).length
    const avgDuration = entries.reduce((a, e) => a + e.durationMs, 0) / total

    // Top blocked tools
    const toolBlocks = new Map<string, number>()
    for (const e of entries.filter((e) => e.policyVerdict === 'block')) {
      toolBlocks.set(e.toolName, (toolBlocks.get(e.toolName) ?? 0) + 1)
    }
    const topBlockedTools = Array.from(toolBlocks.entries())
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Top violating agents
    const agentViolations = new Map<string, { name: string; count: number }>()
    for (const e of entries.filter((e) => e.violations.length > 0)) {
      const existing = agentViolations.get(e.agentId) ?? { name: e.agentName, count: 0 }
      existing.count += e.violations.length
      agentViolations.set(e.agentId, existing)
    }
    const topViolatingAgents = Array.from(agentViolations.entries())
      .map(([agentId, { name, count }]) => ({ agentId, agentName: name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      totalEntries: total,
      successRate: successes / total,
      policyBlocks: blocks,
      policyWarns: warns,
      resourceViolations,
      timeouts,
      crashes,
      avgDurationMs: avgDuration,
      topBlockedTools,
      topViolatingAgents,
    }
  }

  /**
   * Get recent audit entries.
   */
  getRecentEntries(limit = 50): SandboxAuditEntry[] {
    return this.entries.slice(-limit)
  }

  /**
   * Get entries for a specific agent.
   */
  getAgentEntries(agentId: string, limit = 50): SandboxAuditEntry[] {
    return this.entries.filter((e) => e.agentId === agentId).slice(-limit)
  }

  private async feedCortex(entry: SandboxAuditEntry) {
    try {
      const { getCortex } = await import('../healing/index')
      const cortex = getCortex()
      if (!cortex) return

      // Feed outcome for adaptive tuning + degradation
      cortex.recordAgentOutcome(entry.agentId, entry.agentName, entry.success, entry.durationMs, 0)

      // Feed provider outcome if it was a network tool
      if (entry.toolName.includes('web_') || entry.toolName.includes('api_')) {
        cortex.recordProviderOutcome('sandbox_network', entry.success, entry.durationMs)
      }
    } catch (err) {
      // Non-critical — log but don't propagate
      if (process.env.NODE_ENV !== 'production')
        logger.warn(
          { err: err instanceof Error ? err : undefined },
          '[AuditBridge] feedCortex failed',
        )
    }
  }

  private async feedInstincts(entry: SandboxAuditEntry) {
    if (entry.violations.length === 0 && entry.success) return // nothing interesting

    try {
      const { getCortex } = await import('../healing/index')
      const cortex = getCortex()
      if (!cortex) return

      // Feed violations and failures as instinct observations
      for (const violation of entry.violations) {
        await cortex.instinctExecutor.processEvent({
          eventType: `sandbox.${violation.type}`,
          domain: 'sandbox',
          payload: {
            agentId: entry.agentId,
            agentName: entry.agentName,
            toolName: entry.toolName,
            violationType: violation.type,
            severity: violation.severity,
            detail: violation.detail,
          },
          entityId: entry.agentId,
        })
      }

      // Feed policy blocks as instinct observations
      if (entry.policyVerdict === 'block') {
        await cortex.instinctExecutor.processEvent({
          eventType: 'sandbox.policy_block',
          domain: 'sandbox',
          payload: {
            agentId: entry.agentId,
            toolName: entry.toolName,
            reasons: entry.policyChecks.filter((c) => !c.allowed).map((c) => c.reason),
          },
          entityId: entry.agentId,
        })
      }
    } catch (err) {
      // Non-critical — log but don't propagate
      if (process.env.NODE_ENV !== 'production')
        logger.warn(
          { err: err instanceof Error ? err : undefined },
          '[AuditBridge] feedInstincts failed',
        )
    }
  }

  private async feedEventBus(entry: SandboxAuditEntry) {
    if (entry.success && entry.violations.length === 0) return // quiet success

    try {
      const { eventBus } = await import('../orchestration/event-bus')

      if (!entry.success || entry.violations.some((v) => v.severity === 'critical')) {
        await eventBus.emit('agent.error', {
          agentId: entry.agentId,
          agentName: entry.agentName,
          error: `Sandbox: ${entry.violations.map((v) => v.detail).join('; ') || 'execution failed'}`,
          domain: 'sandbox',
          toolName: entry.toolName,
        })
      }
    } catch (err) {
      // Non-critical — log but don't propagate
      if (process.env.NODE_ENV !== 'production')
        logger.warn(
          { err: err instanceof Error ? err : undefined },
          '[AuditBridge] feedEventBus failed',
        )
    }
  }
}
