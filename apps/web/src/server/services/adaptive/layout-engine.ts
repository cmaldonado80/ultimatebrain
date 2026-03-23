/**
 * Adaptive Dashboard Layout Engine
 *
 * Ranks dashboard panels by relevance using four signals:
 * 1. Behavior: which panels the user opens, time spent, interaction frequency
 * 2. Role: admin → security+approvals, operator → health+DLQ, dev → tickets+agents
 * 3. Time of day: morning → standup summary, work hours → ticket board, evening → metrics
 * 4. Context: active incidents boost ops, open PRs boost code review, etc.
 *
 * Stores learned weights in user profile. Supports pinning and reset.
 */

export type UserRole = 'admin' | 'operator' | 'developer' | 'viewer'

export type TimeOfDay = 'morning' | 'working' | 'evening' | 'night'

export type PanelId =
  | 'standup_summary'
  | 'ticket_board'
  | 'agent_status'
  | 'ops_health'
  | 'approvals'
  | 'security'
  | 'metrics'
  | 'dlq'
  | 'active_flows'
  | 'playbooks'
  | 'memory_graph'
  | 'recent_activity'
  | 'browser_sessions'
  | 'presence'

export interface PanelDefinition {
  id: PanelId
  label: string
  description: string
  /** Base weight before any signals */
  baseWeight: number
}

export interface BehaviorSignal {
  panelId: PanelId
  /** Number of times opened */
  openCount: number
  /** Total seconds spent viewing */
  totalSeconds: number
  /** Number of interactions (clicks, edits, etc.) */
  interactionCount: number
  /** Last opened timestamp */
  lastOpened?: Date
}

export interface ContextSignal {
  /** Active incident count */
  activeIncidents: number
  /** Open approval requests */
  pendingApprovals: number
  /** Running agents */
  activeAgents: number
  /** DLQ messages waiting */
  dlqCount: number
  /** Active browser sessions */
  activeBrowserSessions: number
}

export interface UserPreferences {
  role: UserRole
  /** Panels the user has pinned (always visible, position locked) */
  pinnedPanels: PanelId[]
  /** Panels explicitly hidden */
  hiddenPanels: PanelId[]
  /** Learned behavior weights per panel */
  behaviorWeights: Record<string, number>
}

export interface RankedPanel {
  id: PanelId
  label: string
  description: string
  score: number
  isPinned: boolean
  isVisible: boolean
  /** Score breakdown for debugging/transparency */
  breakdown: {
    behavior: number
    role: number
    timeOfDay: number
    context: number
    pin: number
  }
}

// ── Panel Registry ──────────────────────────────────────────────────────

const PANELS: PanelDefinition[] = [
  { id: 'standup_summary', label: 'Standup Summary', description: 'Daily overview of what happened and what\'s next', baseWeight: 5 },
  { id: 'ticket_board', label: 'Ticket Board', description: 'Active tickets and their status', baseWeight: 8 },
  { id: 'agent_status', label: 'Agent Status', description: 'Running agents and their current tasks', baseWeight: 7 },
  { id: 'ops_health', label: 'Ops Health', description: 'System health, uptime, and alerts', baseWeight: 6 },
  { id: 'approvals', label: 'Approvals', description: 'Pending approval requests from agents', baseWeight: 5 },
  { id: 'security', label: 'Security', description: 'Guardrail violations and security events', baseWeight: 4 },
  { id: 'metrics', label: 'Metrics', description: 'Key performance metrics and trends', baseWeight: 5 },
  { id: 'dlq', label: 'Dead Letter Queue', description: 'Failed messages awaiting review', baseWeight: 3 },
  { id: 'active_flows', label: 'Active Flows', description: 'Currently running orchestration flows', baseWeight: 4 },
  { id: 'playbooks', label: 'Playbooks', description: 'Saved automation playbooks', baseWeight: 3 },
  { id: 'memory_graph', label: 'Memory Graph', description: 'Entity relationships and knowledge base', baseWeight: 3 },
  { id: 'recent_activity', label: 'Recent Activity', description: 'Latest actions across the platform', baseWeight: 6 },
  { id: 'browser_sessions', label: 'Browser Sessions', description: 'Live agent browser automation sessions', baseWeight: 2 },
  { id: 'presence', label: 'Who\'s Online', description: 'Connected users and active agents', baseWeight: 2 },
]

// ── Role Weights ────────────────────────────────────────────────────────

const ROLE_WEIGHTS: Record<UserRole, Partial<Record<PanelId, number>>> = {
  admin: {
    security: 10,
    approvals: 9,
    ops_health: 8,
    metrics: 7,
    agent_status: 6,
  },
  operator: {
    ops_health: 10,
    dlq: 9,
    agent_status: 8,
    active_flows: 7,
    browser_sessions: 6,
  },
  developer: {
    ticket_board: 10,
    agent_status: 8,
    recent_activity: 7,
    active_flows: 6,
    playbooks: 5,
  },
  viewer: {
    metrics: 8,
    recent_activity: 7,
    standup_summary: 6,
    presence: 5,
  },
}

// ── Time-of-Day Weights ─────────────────────────────────────────────────

const TIME_WEIGHTS: Record<TimeOfDay, Partial<Record<PanelId, number>>> = {
  morning: {
    standup_summary: 10,
    ticket_board: 7,
    recent_activity: 6,
    approvals: 5,
  },
  working: {
    ticket_board: 10,
    agent_status: 8,
    active_flows: 7,
    approvals: 6,
    browser_sessions: 5,
  },
  evening: {
    metrics: 10,
    ops_health: 7,
    recent_activity: 6,
    standup_summary: 5,
  },
  night: {
    ops_health: 8,
    agent_status: 6,
    dlq: 5,
    security: 5,
  },
}

// ── Engine ───────────────────────────────────────────────────────────────

const DEFAULT_VISIBLE_COUNT = 4

export class LayoutEngine {
  /**
   * Rank all panels by relevance score.
   * Returns ordered list with top `visibleCount` marked visible.
   */
  rank(
    preferences: UserPreferences,
    behaviors: BehaviorSignal[],
    context: ContextSignal,
    options: { visibleCount?: number; timeOverride?: TimeOfDay } = {}
  ): RankedPanel[] {
    const { visibleCount = DEFAULT_VISIBLE_COUNT } = options
    const timeOfDay = options.timeOverride ?? this.getCurrentTimeOfDay()
    const behaviorMap = new Map(behaviors.map((b) => [b.panelId, b]))

    const scored = PANELS.filter(
      (p) => !preferences.hiddenPanels.includes(p.id)
    ).map((panel) => {
      const beh = behaviorMap.get(panel.id)
      const isPinned = preferences.pinnedPanels.includes(panel.id)

      const behaviorScore = this.computeBehaviorScore(beh, preferences.behaviorWeights[panel.id])
      const roleScore = ROLE_WEIGHTS[preferences.role]?.[panel.id] ?? 0
      const timeScore = TIME_WEIGHTS[timeOfDay]?.[panel.id] ?? 0
      const contextScore = this.computeContextScore(panel.id, context)
      const pinBonus = isPinned ? 100 : 0

      const totalScore =
        panel.baseWeight +
        behaviorScore * 2 +
        roleScore * 1.5 +
        timeScore * 1.0 +
        contextScore * 1.8 +
        pinBonus

      return {
        id: panel.id,
        label: panel.label,
        description: panel.description,
        score: Math.round(totalScore * 100) / 100,
        isPinned,
        isVisible: false, // set below
        breakdown: {
          behavior: behaviorScore,
          role: roleScore,
          timeOfDay: timeScore,
          context: contextScore,
          pin: pinBonus,
        },
      }
    })

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score)

    // Mark top N as visible (pinned always visible)
    let visibleSlots = visibleCount
    for (const panel of scored) {
      if (panel.isPinned) {
        panel.isVisible = true
      } else if (visibleSlots > 0) {
        panel.isVisible = true
        visibleSlots--
      }
    }

    return scored
  }

  // ── Behavior Tracking ─────────────────────────────────────────────────

  /**
   * Record a panel interaction and return updated behavior signal.
   */
  recordInteraction(
    existing: BehaviorSignal | null,
    panelId: PanelId,
    durationSeconds: number
  ): BehaviorSignal {
    const base = existing ?? {
      panelId,
      openCount: 0,
      totalSeconds: 0,
      interactionCount: 0,
    }

    return {
      ...base,
      openCount: base.openCount + 1,
      totalSeconds: base.totalSeconds + durationSeconds,
      interactionCount: base.interactionCount + 1,
      lastOpened: new Date(),
    }
  }

  /**
   * Compute updated learned weights from behavior signals.
   * Returns new behaviorWeights object to store in user profile.
   */
  updateLearnedWeights(
    behaviors: BehaviorSignal[]
  ): Record<string, number> {
    const weights: Record<string, number> = {}

    if (behaviors.length === 0) return weights

    // Normalize across all panels
    const maxOpen = Math.max(...behaviors.map((b) => b.openCount), 1)
    const maxTime = Math.max(...behaviors.map((b) => b.totalSeconds), 1)
    const maxInteract = Math.max(...behaviors.map((b) => b.interactionCount), 1)

    for (const b of behaviors) {
      const openNorm = b.openCount / maxOpen
      const timeNorm = b.totalSeconds / maxTime
      const interactNorm = b.interactionCount / maxInteract

      // Recency bonus: panels opened in last 24h get a boost
      const recencyBonus =
        b.lastOpened && Date.now() - b.lastOpened.getTime() < 86_400_000 ? 2 : 0

      weights[b.panelId] =
        Math.round((openNorm * 3 + timeNorm * 4 + interactNorm * 3 + recencyBonus) * 100) / 100
    }

    return weights
  }

  /**
   * Reset all learned preferences for a user.
   */
  resetPreferences(current: UserPreferences): UserPreferences {
    return {
      ...current,
      pinnedPanels: [],
      hiddenPanels: [],
      behaviorWeights: {},
    }
  }

  /**
   * Toggle a panel's pinned state.
   */
  togglePin(current: UserPreferences, panelId: PanelId): UserPreferences {
    const isPinned = current.pinnedPanels.includes(panelId)
    return {
      ...current,
      pinnedPanels: isPinned
        ? current.pinnedPanels.filter((p) => p !== panelId)
        : [...current.pinnedPanels, panelId],
    }
  }

  /**
   * Toggle a panel's hidden state.
   */
  toggleHidden(current: UserPreferences, panelId: PanelId): UserPreferences {
    const isHidden = current.hiddenPanels.includes(panelId)
    return {
      ...current,
      hiddenPanels: isHidden
        ? current.hiddenPanels.filter((p) => p !== panelId)
        : [...current.hiddenPanels, panelId],
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  getCurrentTimeOfDay(): TimeOfDay {
    const hour = new Date().getHours()
    if (hour >= 6 && hour < 10) return 'morning'
    if (hour >= 10 && hour < 18) return 'working'
    if (hour >= 18 && hour < 22) return 'evening'
    return 'night'
  }

  getPanelDefinitions(): PanelDefinition[] {
    return [...PANELS]
  }

  private computeBehaviorScore(
    behavior: BehaviorSignal | undefined,
    learnedWeight: number | undefined
  ): number {
    if (!behavior) return learnedWeight ?? 0
    // Simple scoring: more opens + more time = higher score, capped at 10
    const raw =
      Math.min(behavior.openCount, 50) * 0.1 +
      Math.min(behavior.totalSeconds, 3600) * 0.002 +
      Math.min(behavior.interactionCount, 100) * 0.05
    return Math.min(raw + (learnedWeight ?? 0), 10)
  }

  private computeContextScore(panelId: PanelId, ctx: ContextSignal): number {
    switch (panelId) {
      case 'ops_health':
        return ctx.activeIncidents > 0 ? Math.min(ctx.activeIncidents * 3, 10) : 0
      case 'approvals':
        return ctx.pendingApprovals > 0 ? Math.min(ctx.pendingApprovals * 2, 10) : 0
      case 'agent_status':
        return ctx.activeAgents > 0 ? Math.min(ctx.activeAgents * 1.5, 8) : 0
      case 'dlq':
        return ctx.dlqCount > 0 ? Math.min(ctx.dlqCount * 2, 10) : 0
      case 'browser_sessions':
        return ctx.activeBrowserSessions > 0 ? Math.min(ctx.activeBrowserSessions * 3, 8) : 0
      case 'security':
        return ctx.activeIncidents > 2 ? 8 : 0 // escalate if multiple incidents
      default:
        return 0
    }
  }
}
