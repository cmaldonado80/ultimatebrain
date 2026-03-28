'use client'

/**
 * Command Palette — slash command dropdown for the chat composer.
 * Appears when user types "/" at the start of input.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface SlashCommand {
  name: string
  description: string
  shortcut?: string
}

const COMMANDS: SlashCommand[] = [
  { name: 'agent', description: 'Select a specific agent to talk to' },
  { name: 'crew', description: 'Enable crew mode (all agents)' },
  { name: 'clear', description: 'Start a new conversation' },
  { name: 'retry', description: 'Retry the last message' },
  { name: 'stop', description: 'Stop current generation' },
  { name: 'export', description: 'Export conversation as JSON' },
  { name: 'help', description: 'Show available commands and shortcuts', shortcut: 'Cmd+/' },
]

interface CommandPaletteProps {
  query: string // Text after "/"
  onSelect: (command: string) => void
  onClose: () => void
}

export function CommandPalette({ query, onSelect, onClose }: CommandPaletteProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = COMMANDS.filter((cmd) => cmd.name.toLowerCase().includes(query.toLowerCase()))

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
        onSelect(filtered[activeIndex].name)
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
    <div
      ref={listRef}
      className="absolute bottom-full left-0 mb-2 w-72 cyber-card overflow-hidden shadow-[0_-8px_30px_rgba(0,0,0,0.4)] z-30"
    >
      <div className="px-3 py-2 border-b border-border-dim">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">
          Commands
        </span>
      </div>
      <div className="max-h-48 overflow-y-auto py-1">
        {filtered.map((cmd, i) => (
          <button
            key={cmd.name}
            className={`w-full text-left px-3 py-2 flex items-center justify-between transition-colors ${
              i === activeIndex
                ? 'bg-neon-blue/10 text-slate-200'
                : 'text-slate-400 hover:bg-white/5'
            }`}
            onClick={() => onSelect(cmd.name)}
            onMouseEnter={() => setActiveIndex(i)}
          >
            <div>
              <span className="text-xs font-mono text-neon-teal">/{cmd.name}</span>
              <span className="text-[10px] text-slate-500 ml-2">{cmd.description}</span>
            </div>
            {cmd.shortcut && (
              <span className="text-[9px] text-slate-600 font-mono">{cmd.shortcut}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
