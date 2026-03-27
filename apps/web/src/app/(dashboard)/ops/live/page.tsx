'use client'

/**
 * Live Execution Viewer — watch agent execution traces in real-time.
 * Polls traces by ticket ID every 2 seconds.
 */

import { useState, useEffect } from 'react'
import { trpc } from '../../../../utils/trpc'

interface Span {
  spanId: string
  traceId: string
  parentSpanId: string | null
  operation: string
  service: string | null
  agentId: string | null
  ticketId: string | null
  durationMs: number | null
  status: string | null
  attributes: unknown
  createdAt: Date
}

interface Ticket {
  id: string
  title: string
  status: string
}

export default function LiveViewerPage() {
  const [selectedTicket, setSelectedTicket] = useState('')
  const [isLive, setIsLive] = useState(false)

  const ticketsQuery = trpc.tickets.list.useQuery()
  const tickets = ((ticketsQuery.data ?? []) as Ticket[]).slice(0, 20)

  const tracesQuery = trpc.traces.byTicket.useQuery(
    { ticketId: selectedTicket, limit: 50 },
    {
      enabled: !!selectedTicket,
      refetchInterval: isLive ? 2000 : false,
    },
  )
  const spans = (tracesQuery.data ?? []) as Span[]

  // Auto-enable live mode when a ticket is selected
  useEffect(() => {
    if (selectedTicket) setIsLive(true)
  }, [selectedTicket])

  // Build span tree
  const rootSpans = spans.filter((s) => !s.parentSpanId)
  const childMap = new Map<string, Span[]>()
  for (const span of spans) {
    if (span.parentSpanId) {
      const children = childMap.get(span.parentSpanId) ?? []
      children.push(span)
      childMap.set(span.parentSpanId, children)
    }
  }

  function renderSpan(span: Span, depth: number): React.ReactNode {
    const children = childMap.get(span.spanId) ?? []
    const isRunning = !span.durationMs && span.status !== 'error'
    const statusColor =
      span.status === 'ok'
        ? '#22c55e'
        : span.status === 'error'
          ? '#ef4444'
          : isRunning
            ? '#eab308'
            : '#6b7280'

    return (
      <div key={span.spanId}>
        <div
          className={`flex items-center gap-2 py-1.5 px-3 border-b border-gray-700 text-xs ${
            depth % 2 === 0 ? 'bg-gray-800' : 'bg-gray-900'
          }`}
          style={{ paddingLeft: 12 + depth * 20 }}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{
              background: statusColor,
              animation: isRunning ? 'pulse 1.5s infinite' : 'none',
            }}
          />
          <span className="flex-1 font-mono font-semibold">{span.operation}</span>
          {span.service && (
            <span className="text-[10px] text-gray-600 bg-indigo-950 py-px px-1.5 rounded-sm">
              {span.service}
            </span>
          )}
          {span.durationMs != null ? (
            <span className="text-[10px] text-gray-500 font-mono">{span.durationMs}ms</span>
          ) : isRunning ? (
            <span className="text-[10px] text-yellow-500">running...</span>
          ) : null}
          <span
            className="text-[10px]"
            style={{
              color:
                span.status === 'ok' ? '#22c55e' : span.status === 'error' ? '#ef4444' : '#6b7280',
            }}
          >
            {span.status ?? '—'}
          </span>
        </div>
        {children.map((child) => renderSpan(child, depth + 1))}
      </div>
    )
  }

  return (
    <div className="p-6 font-sans text-gray-50">
      <div className="mb-5">
        <h2 className="m-0 text-[22px] font-bold font-orbitron">Live Execution Viewer</h2>
        <p className="mt-1 mb-0 text-[13px] text-gray-500">
          Watch agent execution traces in real-time. Select a ticket to monitor.
        </p>
      </div>

      <div className="flex gap-2 mb-4 items-center">
        <select
          className="cyber-select flex-1"
          value={selectedTicket}
          onChange={(e) => setSelectedTicket(e.target.value)}
        >
          <option value="">Select a ticket...</option>
          {tickets.map((t) => (
            <option key={t.id} value={t.id}>
              [{t.status}] {t.title}
            </option>
          ))}
        </select>
        <button
          className="text-white border-none rounded-md py-2 px-4 text-xs font-semibold cursor-pointer"
          style={{ background: isLive ? '#ef4444' : '#22c55e' }}
          onClick={() => setIsLive(!isLive)}
          disabled={!selectedTicket}
        >
          {isLive ? 'Stop' : 'Live'}
        </button>
        {isLive && (
          <span className="text-[11px] text-green-500 flex items-center gap-1">
            <span
              className="w-1.5 h-1.5 rounded-full bg-green-500"
              style={{ animation: 'pulse 1.5s infinite' }}
            />
            Polling every 2s
          </span>
        )}
        <span className="text-[11px] text-gray-500 ml-auto">{spans.length} spans</span>
      </div>

      {!selectedTicket ? (
        <div className="text-center text-gray-500 p-10 text-sm cyber-card">
          Select a ticket to view its execution traces.
        </div>
      ) : spans.length === 0 ? (
        <div className="text-center text-gray-500 p-10 text-sm cyber-card">
          No traces found for this ticket. {isLive && 'Waiting for execution...'}
        </div>
      ) : (
        <div className="cyber-card overflow-hidden !p-0">
          {rootSpans.map((span) => renderSpan(span, 0))}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
