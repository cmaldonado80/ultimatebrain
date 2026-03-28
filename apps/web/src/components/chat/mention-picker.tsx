'use client'

/**
 * Mention Picker — @agent picker for the chat composer.
 * Appears when user types "@" in the input.
 */

import { useCallback, useEffect, useState } from 'react'

interface Agent {
  id: string
  name: string
  type: string | null
  model: string | null
}

interface MentionPickerProps {
  query: string // Text after "@"
  agents: Agent[]
  onSelect: (agent: Agent) => void
  onClose: () => void
}

export function MentionPicker({ query, agents, onSelect, onClose }: MentionPickerProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  const filtered = agents
    .filter((a) => a.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 10)

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && filtered.length > 0) {
        e.preventDefault()
        onSelect(filtered[activeIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [filtered, activeIndex, onSelect, onClose],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (filtered.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 mb-2 w-72 cyber-card overflow-hidden shadow-[0_-8px_30px_rgba(0,0,0,0.4)] z-30">
      <div className="px-3 py-2 border-b border-border-dim">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">
          Agents
        </span>
      </div>
      <div className="max-h-48 overflow-y-auto py-1">
        {filtered.map((agent, i) => (
          <button
            key={agent.id}
            className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
              i === activeIndex
                ? 'bg-neon-blue/10 text-slate-200'
                : 'text-slate-400 hover:bg-white/5'
            }`}
            onClick={() => onSelect(agent)}
            onMouseEnter={() => setActiveIndex(i)}
          >
            <span className="text-xs font-medium">{agent.name}</span>
            {agent.type && (
              <span className="text-[9px] text-slate-600 font-mono">{agent.type}</span>
            )}
            {agent.model && (
              <span className="text-[9px] text-slate-600 ml-auto font-mono truncate max-w-[100px]">
                {agent.model}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
