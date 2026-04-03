/**
 * Agent Initiative Engine
 *
 * Transforms agents from passive workers to proactive problem-solvers.
 * Agents observe their environment, detect opportunities/problems,
 * and create tickets to address them — without human intervention.
 *
 * The loop:
 *   SENSE  → scan metrics, events, patterns for actionable signals
 *   JUDGE  → evaluate signal importance, filter noise, check thresholds
 *   ACT    → create ticket, assign priority, route to best department
 *   LEARN  → track initiative outcomes to improve future signal detection
 *
 * Signals that trigger initiative:
 *   - Healing cortex detects degradation trends
 *   - Sandbox audit shows repeated policy violations
 *   - Agent degradation events (peer needs help)
 *   - Instinct patterns with no existing remediation
 *   - Department goals at risk (from goal cascade)
 */

import type { Database } from '@solarc/db'
import { tickets } from '@solarc/db'

// ── Types ────────────────────────────────────────────────────────────────

export interface Signal {
  id: string
  source: 'cortex' | 'sandbox' | 'degradation' | 'instinct' | 'goal' | 'observation'
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  suggestedAction: string
  departmentDomain?: string
  agentId?: string
  data: Record<string, unknown>
  detectedAt: number
}

export interface Initiative {
  signal: Signal
  ticketId: string
  ticketTitle: string
  priority: string
  createdAt: number
  outcome?: 'resolved' | 'dismissed' | 'escalated'
}

export interface InitiativeStats {
  totalSignalsDetected: number
  totalInitiativesCreated: number
  resolutionRate: number
  topSignalSources: Array<{ source: string; count: number }>
}

// ── Configuration ────────────────────────────────────────────────────────

const SIGNAL_COOLDOWN_MS = 10 * 60 * 1000 // Don't re-signal same issue within 10min
const MAX_INITIATIVES_PER_HOUR = 10 // Prevent runaway initiative creation
const MAX_SIGNAL_HISTORY = 200

// ── Initiative Engine ────────────────────────────────────────────────────

export class AgentInitiativeEngine {
  private signalHistory: Signal[] = []
  private initiatives: Initiative[] = []
  private hourlyCount = 0
  private hourlyReset = Date.now()
  private signalCooldowns = new Map<string, number>()

  constructor(private db: Database) {}

  /**
   * Scan system state and generate signals.
   * Called by the cortex OODA cycle or cron.
   */
  async scan(context: {
    cortexRiskLevel?: string
    degradedAgents?: Array<{ agentId: string; agentName: string; level: string }>
    predictiveInterventions?: Array<{ metric: string; urgency: string; reason: string }>
    sandboxViolations?: Array<{ agentId: string; toolName: string; type: string }>
    atRiskGoals?: Array<{ department: string; goal: string; progress: number }>
  }): Promise<Signal[]> {
    const signals: Signal[] = []
    const now = Date.now()

    // Signal: System risk escalation
    if (context.cortexRiskLevel === 'high' || context.cortexRiskLevel === 'critical') {
      signals.push({
        id: `risk_${context.cortexRiskLevel}`,
        source: 'cortex',
        severity: context.cortexRiskLevel === 'critical' ? 'critical' : 'high',
        title: `System risk level: ${context.cortexRiskLevel}`,
        description:
          'The self-healing cortex has detected elevated system risk. Proactive action needed.',
        suggestedAction: 'Run diagnostic sweep and address root causes',
        data: { riskLevel: context.cortexRiskLevel },
        detectedAt: now,
      })
    }

    // Signal: Agents in degraded state
    for (const agent of context.degradedAgents ?? []) {
      if (agent.level === 'minimal' || agent.level === 'suspended') {
        signals.push({
          id: `degrade_${agent.agentId}`,
          source: 'degradation',
          severity: agent.level === 'suspended' ? 'critical' : 'high',
          title: `Agent ${agent.agentName} is ${agent.level}`,
          description: `Agent capability severely reduced. May need investigation or replacement.`,
          suggestedAction:
            agent.level === 'suspended'
              ? 'Investigate and reactivate or replace agent'
              : 'Review agent workload and error patterns',
          agentId: agent.agentId,
          data: { level: agent.level },
          detectedAt: now,
        })
      }
    }

    // Signal: Predicted threshold breaches
    for (const intervention of context.predictiveInterventions ?? []) {
      if (intervention.urgency === 'immediate') {
        signals.push({
          id: `predict_${intervention.metric}`,
          source: 'cortex',
          severity: 'high',
          title: `Predicted breach: ${intervention.metric}`,
          description: intervention.reason,
          suggestedAction: 'Preemptive action to prevent threshold breach',
          data: { metric: intervention.metric },
          detectedAt: now,
        })
      }
    }

    // Signal: Repeated sandbox violations (pattern)
    const violationGroups = new Map<string, number>()
    for (const v of context.sandboxViolations ?? []) {
      const key = `${v.agentId}_${v.toolName}`
      violationGroups.set(key, (violationGroups.get(key) ?? 0) + 1)
    }
    for (const [key, count] of violationGroups) {
      if (count >= 3) {
        const delimIdx = key.indexOf('_')
        const agentId = delimIdx >= 0 ? key.slice(0, delimIdx) : key
        const toolName = delimIdx >= 0 ? key.slice(delimIdx + 1) : 'unknown'
        signals.push({
          id: `violation_${key}`,
          source: 'sandbox',
          severity: 'medium',
          title: `Repeated policy violations: ${toolName}`,
          description: `Agent has triggered ${count} sandbox violations for tool ${toolName}. May need permission review or training.`,
          suggestedAction: 'Review agent permissions and tool access',
          agentId,
          data: { toolName, count },
          detectedAt: now,
        })
      }
    }

    // Signal: At-risk department goals
    for (const goal of context.atRiskGoals ?? []) {
      if (goal.progress < 0.3) {
        signals.push({
          id: `goal_${goal.department}`,
          source: 'goal',
          severity: 'medium',
          title: `Department goal at risk: ${goal.department}`,
          description: `"${goal.goal}" is at ${(goal.progress * 100).toFixed(0)}% — below expected trajectory.`,
          suggestedAction: 'Allocate more agents or adjust department priorities',
          departmentDomain: goal.department,
          data: { progress: goal.progress },
          detectedAt: now,
        })
      }
    }

    // Filter: cooldown + dedup
    const filtered = signals.filter((s) => {
      const lastSeen = this.signalCooldowns.get(s.id) ?? 0
      if (now - lastSeen < SIGNAL_COOLDOWN_MS) return false
      this.signalCooldowns.set(s.id, now)
      return true
    })

    this.signalHistory.push(...filtered)
    while (this.signalHistory.length > MAX_SIGNAL_HISTORY) this.signalHistory.shift()

    return filtered
  }

  /**
   * Create tickets from signals (the ACT step).
   */
  async createInitiatives(signals: Signal[], workspaceId: string): Promise<Initiative[]> {
    // Rate limit
    const now = Date.now()
    if (now - this.hourlyReset > 60 * 60 * 1000) {
      this.hourlyCount = 0
      this.hourlyReset = now
    }

    const created: Initiative[] = []

    for (const signal of signals) {
      if (this.hourlyCount >= MAX_INITIATIVES_PER_HOUR) break
      if (signal.severity === 'low') continue // only act on medium+

      const priority =
        signal.severity === 'critical' ? 'critical' : signal.severity === 'high' ? 'high' : 'medium'

      try {
        const [ticket] = await this.db
          .insert(tickets)
          .values({
            title: `[Initiative] ${signal.title}`,
            description: `${signal.description}\n\nSuggested action: ${signal.suggestedAction}\n\nSource: ${signal.source}\nDetected: ${new Date(signal.detectedAt).toISOString()}`,
            status: 'queued',
            priority,
            workspaceId,
          })
          .returning({ id: tickets.id })

        if (ticket) {
          const initiative: Initiative = {
            signal,
            ticketId: ticket.id,
            ticketTitle: `[Initiative] ${signal.title}`,
            priority,
            createdAt: now,
          }
          created.push(initiative)
          this.initiatives.push(initiative)
          this.hourlyCount++
        }
      } catch {
        // Non-critical — skip this signal
      }
    }

    return created
  }

  /**
   * Get initiative statistics.
   */
  getStats(): InitiativeStats {
    const resolved = this.initiatives.filter((i) => i.outcome === 'resolved').length
    const sourceCounts = new Map<string, number>()
    for (const s of this.signalHistory) {
      sourceCounts.set(s.source, (sourceCounts.get(s.source) ?? 0) + 1)
    }

    return {
      totalSignalsDetected: this.signalHistory.length,
      totalInitiativesCreated: this.initiatives.length,
      resolutionRate: this.initiatives.length > 0 ? resolved / this.initiatives.length : 0,
      topSignalSources: Array.from(sourceCounts.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count),
    }
  }

  getRecentSignals(limit = 20): Signal[] {
    return this.signalHistory.slice(-limit)
  }

  getRecentInitiatives(limit = 20): Initiative[] {
    return this.initiatives.slice(-limit)
  }
}
