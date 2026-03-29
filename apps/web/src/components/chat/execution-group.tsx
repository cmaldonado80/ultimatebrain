'use client'

/**
 * Execution Group — collapsible wrapper that groups related thread items
 * by agent execution. Derives groups from the flat thread item array.
 *
 * User messages stay ungrouped. Agent work (tool calls, responses) gets
 * grouped under the agent that produced them.
 */

import { useState } from 'react'

import type { InspectorSelection } from './inspector-panel'
import type { ThreadItemData } from './thread-item'
import { ThreadItem } from './thread-item'

// ── Types ──────────────────────────────────────────────────────────────

export interface ExecutionGroupData {
  kind: 'group'
  id: string
  agentName: string
  agentId: string
  items: ThreadItemData[]
  isActive: boolean
  prevAgentName?: string // For delegation chain display
}

type GroupedItem = ThreadItemData | ExecutionGroupData

// ── Agent Colors (same as thread-item) ─────────────────────────────────

const AVATAR_COLORS = ['#00d4ff', '#8b5cf6', '#00ff88', '#ffd200', '#ff3a5c', '#f472b6', '#38bdf8']

function agentColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// ── Group Builder (pure function) ──────────────────────────────────────

/**
 * Takes the flat allItems array and returns a mix of ungrouped items
 * (user messages, system notices) and grouped execution blocks.
 */
export function buildExecutionGroups(items: ThreadItemData[]): GroupedItem[] {
  const result: GroupedItem[] = []
  let currentGroup: ExecutionGroupData | null = null
  let prevAgentName: string | undefined

  for (const item of items) {
    // User messages and system notices stay ungrouped
    if (item.type === 'user' || item.type === 'system') {
      if (currentGroup) {
        result.push(currentGroup)
        currentGroup = null
      }
      result.push(item)
      continue
    }

    // Final answer stays outside groups (prominent)
    if (item.type === 'final_answer') {
      if (currentGroup) {
        result.push(currentGroup)
        currentGroup = null
      }
      result.push(item)
      continue
    }

    // agent_start → begin new group
    if (item.type === 'agent_start') {
      if (currentGroup) {
        prevAgentName = currentGroup.agentName
        result.push(currentGroup)
      }
      currentGroup = {
        kind: 'group',
        id: `group-${item.agentId}-${Date.now()}`,
        agentName: item.agentName,
        agentId: item.agentId,
        items: [],
        isActive: false,
        prevAgentName,
      }
      continue
    }

    // Error items outside a group stay ungrouped
    if (item.type === 'error' && !currentGroup) {
      result.push(item)
      continue
    }

    // Everything else goes into current group
    if (currentGroup) {
      currentGroup.items.push(item)
      // Mark active if streaming
      if (item.type === 'streaming') currentGroup.isActive = true
    } else {
      // No group yet — render standalone (for items before first agent_start)
      result.push(item)
    }
  }

  // Push last group
  if (currentGroup) result.push(currentGroup)

  return result
}

// ── Execution Group Component ──────────────────────────────────────────

interface ExecutionGroupProps {
  group: ExecutionGroupData
  onInspect?: (selection: InspectorSelection) => void
  onRetryGroup?: (groupId: string) => void
  onRetryStep?: (stepId: string) => void
}

export function ExecutionGroup({
  group,
  onInspect,
  onRetryGroup,
  onRetryStep,
}: ExecutionGroupProps) {
  const [collapsed, setCollapsed] = useState(!group.isActive)
  const color = agentColor(group.agentName)
  const stepCount = group.items.filter(
    (i) => i.type === 'tool_use' || i.type === 'tool_result' || i.type === 'agent',
  ).length

  // Get agent response text for copy
  const agentResponse = group.items.find((i) => i.type === 'agent' || i.type === 'streaming')
  const responseText =
    agentResponse && 'text' in agentResponse ? (agentResponse as { text: string }).text : ''

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (responseText) navigator.clipboard.writeText(responseText)
  }

  return (
    <div className="mb-3 group/exec">
      {/* Group header */}
      <div
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-left transition-colors hover:bg-bg-elevated/50 cursor-pointer"
        style={{ borderLeft: `2px solid ${color}` }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="text-[10px] text-slate-600">{collapsed ? '▸' : '▾'}</span>
        <span
          className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-bold text-white"
          style={{ background: color }}
        >
          {group.agentName.slice(0, 2).toUpperCase()}
        </span>
        {group.prevAgentName && (
          <>
            <span className="text-[10px] text-slate-600">{group.prevAgentName}</span>
            <span className="text-[10px] text-slate-600">→</span>
          </>
        )}
        <span className="text-xs font-medium text-slate-300">{group.agentName}</span>
        {group.isActive && <span className="neon-dot neon-dot-blue animate-pulse" />}
        {stepCount > 0 && (
          <span className="text-[10px] text-slate-600 ml-auto">{stepCount} steps</span>
        )}
        {/* Hover controls — appear on group hover */}
        <div className="flex items-center gap-1 opacity-0 group-hover/exec:opacity-100 transition-opacity ml-2">
          {responseText && (
            <button
              className="text-[9px] text-slate-600 hover:text-slate-300 px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors"
              onClick={handleCopy}
              title="Copy response"
            >
              Copy
            </button>
          )}
          <button
            className="text-[9px] text-slate-600 hover:text-neon-blue px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              onInspect?.({ type: 'agent', id: group.agentId, name: group.agentName })
            }}
            title="Inspect agent"
          >
            Inspect
          </button>
          {!group.isActive && group.items.length > 0 && (
            <>
              <button
                className="text-[9px] text-slate-600 hover:text-neon-green px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  const steps = group.items
                    .filter((i) => i.type === 'tool_use' || i.type === 'agent')
                    .map((i) => ({
                      type: i.type === 'tool_use' ? 'tool' : 'agent',
                      name: 'name' in i ? (i as { name: string }).name : group.agentName,
                    }))
                  navigator.clipboard.writeText(
                    JSON.stringify({ agent: group.agentName, steps }, null, 2),
                  )
                  const btn = e.currentTarget
                  btn.textContent = 'Saved!'
                  setTimeout(() => {
                    btn.textContent = 'Save'
                  }, 2000)
                }}
                title="Save execution pattern"
              >
                Save
              </button>
              {onRetryGroup && (
                <button
                  className="text-[9px] text-slate-600 hover:text-neon-yellow px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRetryGroup(group.id)
                  }}
                  title="Retry this group"
                >
                  Retry
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Group body */}
      {!collapsed && (
        <div className="pl-4 border-l-2 border-border-dim ml-[11px]">
          {group.items.map((item, i) => (
            <ThreadItem key={i} item={item} onInspect={onInspect} onRetryStep={onRetryStep} />
          ))}
        </div>
      )}
    </div>
  )
}
