'use client'

/**
 * Tool Call Card — compact inline display of tool invocations in chat thread.
 * Shows tool name + status. Click to open inspector with full details.
 */

interface ToolCallCardProps {
  toolName: string
  input?: unknown
  result?: string
  status: 'running' | 'done' | 'error'
  onInspect?: () => void
}

export function ToolCallCard({ toolName, input, result, status, onInspect }: ToolCallCardProps) {
  const dotClass =
    status === 'running'
      ? 'neon-dot-blue animate-pulse'
      : status === 'done'
        ? 'neon-dot-green'
        : 'neon-dot-red'

  const statusLabel = status === 'running' ? 'Running...' : status === 'done' ? 'Done' : 'Failed'

  const inputPreview =
    input && typeof input === 'object'
      ? JSON.stringify(input).slice(0, 80)
      : String(input ?? '').slice(0, 80)

  return (
    <div
      className="cyber-card p-2.5 my-1.5 flex items-center gap-2 text-xs cursor-pointer hover:border-neon-blue/30 transition-colors"
      onClick={onInspect}
    >
      <span className={`neon-dot ${dotClass}`} />
      <span className="font-mono font-medium text-slate-300">{toolName}</span>
      <span className="text-slate-600 truncate flex-1">{inputPreview}</span>
      <span
        className={`text-[10px] font-mono ${
          status === 'done'
            ? 'text-neon-green'
            : status === 'error'
              ? 'text-neon-red'
              : 'text-slate-500'
        }`}
      >
        {statusLabel}
      </span>
      {result && (
        <span className="text-[10px] text-neon-blue hover:text-neon-blue/80">Details →</span>
      )}
    </div>
  )
}
