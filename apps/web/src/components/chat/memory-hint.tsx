'use client'

/**
 * Memory Hint — subtle inline indicator when memories were recalled during chat.
 * Shows how many memories informed the agent's response.
 */

interface MemoryHintProps {
  count: number
  sources?: string[]
  onInspect?: () => void
}

export function MemoryHint({ count, sources, onInspect }: MemoryHintProps) {
  if (count === 0) return null

  const sourceLabel = sources?.length ? ` (${sources.join(', ')})` : ''

  return (
    <button
      className="flex items-center gap-1.5 mx-auto my-1.5 px-3 py-1 rounded-full bg-neon-purple/5 border border-neon-purple/15 text-[10px] text-neon-purple hover:bg-neon-purple/10 transition-colors"
      onClick={onInspect}
    >
      <span>💡</span>
      <span>
        Based on {count} {count === 1 ? 'memory' : 'memories'}
        {sourceLabel}
      </span>
    </button>
  )
}
