'use client'

/**
 * Thread Item — renders a single item in the chat thread.
 * Handles: user messages, agent messages, tool calls, handoffs, errors.
 */

import type { InspectorSelection } from './inspector-panel'
import { MarkdownMessage } from './markdown-message'
import { ToolCallCard } from './tool-call-card'

export type ThreadItemData =
  | { type: 'user'; id: string; text: string; createdAt: Date }
  | {
      type: 'agent'
      id: string
      text: string
      agentName: string
      agentId?: string
      model?: string
      createdAt: Date
    }
  | {
      type: 'final_answer'
      id: string
      text: string
      agentName: string
      agentId?: string
      model?: string
      createdAt: Date
    }
  | { type: 'agent_start'; agentName: string; agentId: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'streaming'; text: string; agentName?: string }
  | { type: 'error'; message: string; onRetry?: () => void }
  | { type: 'system'; text: string }

const AVATAR_COLORS = ['#00d4ff', '#8b5cf6', '#00ff88', '#ffd200', '#ff3a5c', '#f472b6', '#38bdf8']

function agentColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

interface ThreadItemProps {
  item: ThreadItemData
  onInspect?: (selection: InspectorSelection) => void
}

export function ThreadItem({ item, onInspect }: ThreadItemProps) {
  switch (item.type) {
    case 'user':
      return (
        <div className="flex justify-end mb-3">
          <div
            className="chat-bubble-user cursor-pointer"
            onClick={() =>
              onInspect?.({
                type: 'message',
                id: item.id,
                role: 'user',
                text: item.text,
                timestamp: item.createdAt,
              })
            }
          >
            <MarkdownMessage content={item.text} />
          </div>
        </div>
      )

    case 'agent':
      return (
        <div className="flex gap-2.5 mb-3 items-start">
          <button
            className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white border-none cursor-pointer"
            style={{ background: agentColor(item.agentName) }}
            onClick={() =>
              onInspect?.({
                type: 'agent',
                id: item.agentId ?? '',
                name: item.agentName,
                model: item.model,
              })
            }
          >
            {item.agentName.slice(0, 2).toUpperCase()}
          </button>
          <div className="flex-1 min-w-0">
            <div className="chat-agent-label" style={{ color: agentColor(item.agentName) }}>
              {item.agentName}
            </div>
            <div
              className="chat-bubble-agent cursor-pointer"
              onClick={() =>
                onInspect?.({
                  type: 'message',
                  id: item.id,
                  role: 'assistant',
                  text: item.text,
                  agentName: item.agentName,
                  model: item.model,
                  timestamp: item.createdAt,
                })
              }
            >
              <MarkdownMessage content={item.text} />
            </div>
          </div>
        </div>
      )

    case 'final_answer':
      return (
        <div className="flex gap-2.5 mb-4 items-start">
          <button
            className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white border-none cursor-pointer"
            style={{ background: agentColor(item.agentName) }}
            onClick={() =>
              onInspect?.({
                type: 'agent',
                id: item.agentId ?? '',
                name: item.agentName,
                model: item.model,
              })
            }
          >
            {item.agentName.slice(0, 2).toUpperCase()}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="chat-agent-label" style={{ color: agentColor(item.agentName) }}>
                {item.agentName}
              </div>
              <span className="cyber-badge text-[9px] bg-neon-teal/10 text-neon-teal border-neon-teal/20">
                Final Answer
              </span>
            </div>
            <div
              className="chat-bubble-agent cursor-pointer border-neon-teal/20 shadow-[0_0_12px_rgba(0,212,255,0.05)]"
              onClick={() =>
                onInspect?.({
                  type: 'message',
                  id: item.id,
                  role: 'assistant',
                  text: item.text,
                  agentName: item.agentName,
                  model: item.model,
                  timestamp: item.createdAt,
                })
              }
            >
              <MarkdownMessage content={item.text} />
            </div>
          </div>
        </div>
      )

    case 'agent_start':
      return (
        <div className="flex items-center gap-2 my-2 px-2">
          <div className="h-px flex-1 bg-border-dim" />
          <span className="text-[10px] text-slate-500 font-mono">→ {item.agentName}</span>
          <div className="h-px flex-1 bg-border-dim" />
        </div>
      )

    case 'tool_use':
      return (
        <div className="ml-9 mb-1">
          <ToolCallCard
            toolName={item.name}
            input={item.input}
            status="running"
            onInspect={() =>
              onInspect?.({ type: 'tool', name: item.name, input: item.input, status: 'running' })
            }
          />
        </div>
      )

    case 'tool_result':
      return (
        <div className="ml-9 mb-1">
          <ToolCallCard
            toolName={item.name}
            result={item.result}
            status="done"
            onInspect={() =>
              onInspect?.({
                type: 'tool',
                name: item.name,
                input: {},
                result: item.result,
                status: 'done',
              })
            }
          />
        </div>
      )

    case 'streaming': {
      const agentName = item.agentName ?? 'Assistant'
      return (
        <div className="flex gap-2.5 mb-3 items-start">
          <div
            className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
            style={{ background: agentColor(agentName) }}
          >
            {agentName.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="chat-agent-label" style={{ color: agentColor(agentName) }}>
              {agentName}
            </div>
            <div className="chat-bubble-agent">
              {item.text ? (
                <>
                  <MarkdownMessage content={item.text} />
                  <span className="chat-cursor" />
                </>
              ) : (
                <div className="flex gap-1 py-1">
                  <div className="chat-thinking-dot" />
                  <div className="chat-thinking-dot" style={{ animationDelay: '150ms' }} />
                  <div className="chat-thinking-dot" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }

    case 'error':
      return (
        <div className="cyber-card border-neon-red/30 bg-neon-red/5 p-2.5 my-2 text-xs text-neon-red flex items-center justify-between">
          <span>{item.message}</span>
          {item.onRetry && (
            <button
              className="cyber-btn-danger cyber-btn-xs ml-2 flex-shrink-0"
              onClick={item.onRetry}
            >
              Retry
            </button>
          )}
        </div>
      )

    case 'system':
      return <div className="text-center text-[10px] text-slate-600 my-2">{item.text}</div>
  }
}
