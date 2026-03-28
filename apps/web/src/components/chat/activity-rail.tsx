'use client'

/**
 * Activity Rail — compact strip showing real-time agent execution states.
 * Derives activity from StreamEvent[] without backend changes.
 * Shows above the thread during streaming.
 */

import { useMemo } from 'react'

// ── Types ──────────────────────────────────────────────────────────────

type AgentState = 'running' | 'waiting' | 'completed' | 'failed'

interface ActivityItem {
  id: string
  label: string
  state: AgentState
  detail?: string
}

type StreamEvent =
  | { type: 'agent_start'; agentName: string; agentId: string }
  | { type: 'text'; content: string; agentId?: string; agentName?: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'error'; message: string }

// ── State Derivation ───────────────────────────────────────────────────

function deriveActivity(events: StreamEvent[]): ActivityItem[] {
  const items: ActivityItem[] = []
  const agentStates = new Map<string, ActivityItem>()
  let lastAgentName = 'Assistant'
  let activeToolName: string | null = null

  for (const event of events) {
    switch (event.type) {
      case 'agent_start':
        lastAgentName = event.agentName
        // Mark previous agent as completed if it was running
        for (const [, item] of agentStates) {
          if (item.state === 'running') item.state = 'completed'
        }
        agentStates.set(event.agentId, {
          id: `agent-${event.agentId}`,
          label: event.agentName,
          state: 'running',
        })
        break

      case 'tool_use':
        activeToolName = event.name
        agentStates.set(`tool-${event.name}`, {
          id: `tool-${event.name}`,
          label: event.name,
          state: 'running',
          detail: 'Tool',
        })
        break

      case 'tool_result':
        if (activeToolName) {
          agentStates.set(`tool-${event.name}`, {
            id: `tool-${event.name}`,
            label: event.name,
            state: 'completed',
            detail: 'Tool',
          })
          activeToolName = null
        }
        break

      case 'text':
        // Agent is actively generating — mark as running
        if (event.agentName || event.agentId) {
          const key = event.agentId ?? event.agentName ?? lastAgentName
          const existing = agentStates.get(key)
          if (existing) existing.state = 'running'
        }
        break

      case 'error':
        agentStates.set('error', {
          id: 'error',
          label: 'Error',
          state: 'failed',
          detail: event.message.slice(0, 50),
        })
        break
    }
  }

  // Build ordered list: running first, then completed, then failed
  const running: ActivityItem[] = []
  const completed: ActivityItem[] = []
  const failed: ActivityItem[] = []

  for (const item of agentStates.values()) {
    if (item.state === 'running') running.push(item)
    else if (item.state === 'completed') completed.push(item)
    else if (item.state === 'failed') failed.push(item)
  }

  items.push(...running, ...completed, ...failed)
  return items
}

// ── Visual Constants ───────────────────────────────────────────────────

const STATE_STYLES: Record<AgentState, { dot: string; text: string }> = {
  running: { dot: 'neon-dot-blue animate-pulse', text: 'text-neon-blue' },
  waiting: { dot: 'neon-dot-yellow', text: 'text-neon-yellow' },
  completed: { dot: 'neon-dot-green', text: 'text-slate-400' },
  failed: { dot: 'neon-dot-red', text: 'text-neon-red' },
}

const STATE_LABELS: Record<AgentState, string> = {
  running: 'Running',
  waiting: 'Waiting',
  completed: 'Done',
  failed: 'Failed',
}

// ── Component ──────────────────────────────────────────────────────────

interface ActivityRailProps {
  events: StreamEvent[]
  onInspect?: (agentName: string) => void
}

export function ActivityRail({ events, onInspect }: ActivityRailProps) {
  const items = useMemo(() => deriveActivity(events), [events])

  if (items.length === 0) return null

  const MAX_VISIBLE = 4
  const visible = items.slice(0, MAX_VISIBLE)
  const overflow = items.length - MAX_VISIBLE

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border-dim bg-bg-surface/80 backdrop-blur-sm">
      <span className="text-[9px] text-slate-600 uppercase tracking-wider font-mono mr-1">
        Activity
      </span>
      {visible.map((item) => {
        const style = STATE_STYLES[item.state]
        return (
          <button
            key={item.id}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-bg-elevated border border-border-dim text-[11px] hover:bg-white/5 transition-colors"
            onClick={() => onInspect?.(item.label)}
          >
            <span className={`neon-dot ${style.dot}`} />
            <span className="text-slate-300 font-medium">
              {item.detail ? `${item.detail}: ` : ''}
              {item.label}
            </span>
            <span className={`${style.text} text-[10px]`}>{STATE_LABELS[item.state]}</span>
          </button>
        )
      })}
      {overflow > 0 && <span className="text-[10px] text-slate-600">+{overflow} more</span>}
    </div>
  )
}
