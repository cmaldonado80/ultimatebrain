'use client'

/**
 * Tool Call Card — inline display of tool invocations in chat thread.
 * Shows status, expandable result preview, error state, and duration.
 */

import { useState } from 'react'

interface ToolCallCardProps {
  toolName: string
  input?: unknown
  result?: string
  status: 'running' | 'done' | 'error'
  error?: string
  durationMs?: number
  onInspect?: () => void
  onRetryStep?: () => void
}

export function ToolCallCard({
  toolName,
  input,
  result,
  status,
  error,
  durationMs,
  onInspect,
  onRetryStep,
}: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)

  const dotClass =
    status === 'running'
      ? 'neon-dot-blue animate-pulse'
      : status === 'done'
        ? 'neon-dot-green'
        : 'neon-dot-red'

  const statusLabel =
    status === 'running'
      ? 'Running...'
      : status === 'done'
        ? durationMs
          ? `${durationMs}ms`
          : 'Done'
        : 'Failed'

  const inputPreview =
    input && typeof input === 'object'
      ? JSON.stringify(input).slice(0, 80)
      : String(input ?? '').slice(0, 80)

  const resultPreview = result ? result.slice(0, 300) : null
  const hasMoreResult = result && result.length > 300

  return (
    <div className="my-1.5">
      {/* Header row */}
      <div
        className={`cyber-card p-2.5 flex items-center gap-2 text-xs cursor-pointer hover:border-neon-blue/30 transition-colors ${
          status === 'error' ? 'border-neon-red/30 bg-neon-red/5' : ''
        }`}
        onClick={() => (result || error ? setExpanded(!expanded) : onInspect?.())}
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
        {(result || error) && (
          <span className="text-[10px] text-slate-600">{expanded ? '▾' : '▸'}</span>
        )}
        {onInspect && (
          <button
            className="text-[10px] text-neon-blue hover:text-neon-blue/80 ml-1"
            onClick={(e) => {
              e.stopPropagation()
              onInspect()
            }}
          >
            Inspect
          </button>
        )}
        {onRetryStep && status !== 'running' && (
          <button
            className="text-[9px] text-slate-600 hover:text-neon-yellow ml-1 transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              onRetryStep()
            }}
            title="Retry this step"
          >
            ↻ Retry
          </button>
        )}
      </div>

      {/* Expanded result/error */}
      {expanded && (
        <div className="mt-1 ml-4 mr-1">
          {error && (
            <div className="cyber-card border-neon-red/20 bg-neon-red/5 p-2.5 text-xs text-neon-red font-mono">
              {error}
            </div>
          )}
          {resultPreview && (
            <pre className="cyber-card p-2.5 text-[11px] font-mono text-slate-400 overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
              {expanded && hasMoreResult ? result : resultPreview}
              {hasMoreResult && !expanded && (
                <button
                  className="text-neon-blue text-[10px] ml-1"
                  onClick={() => setExpanded(true)}
                >
                  Show full ({result!.length} chars)
                </button>
              )}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
