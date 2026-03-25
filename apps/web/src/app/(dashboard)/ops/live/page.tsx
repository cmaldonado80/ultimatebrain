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

    return (
      <div key={span.spanId}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            paddingLeft: 12 + depth * 20,
            background: depth % 2 === 0 ? '#1f2937' : '#111827',
            borderBottom: '1px solid #374151',
            fontSize: 12,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              flexShrink: 0,
              background:
                span.status === 'ok'
                  ? '#22c55e'
                  : span.status === 'error'
                    ? '#ef4444'
                    : isRunning
                      ? '#eab308'
                      : '#6b7280',
              animation: isRunning ? 'pulse 1.5s infinite' : 'none',
            }}
          />
          <span style={{ flex: 1, fontFamily: 'monospace', fontWeight: 600 }}>
            {span.operation}
          </span>
          {span.service && (
            <span
              style={{
                fontSize: 10,
                color: '#4b5563',
                background: '#1e1b4b',
                padding: '1px 6px',
                borderRadius: 3,
              }}
            >
              {span.service}
            </span>
          )}
          {span.durationMs != null ? (
            <span style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>
              {span.durationMs}ms
            </span>
          ) : isRunning ? (
            <span style={{ fontSize: 10, color: '#eab308' }}>running...</span>
          ) : null}
          <span
            style={{
              fontSize: 10,
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
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Live Execution Viewer</h2>
        <p style={styles.subtitle}>
          Watch agent execution traces in real-time. Select a ticket to monitor.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <select
          style={styles.select}
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
          style={{
            ...styles.btn,
            background: isLive ? '#ef4444' : '#22c55e',
          }}
          onClick={() => setIsLive(!isLive)}
          disabled={!selectedTicket}
        >
          {isLive ? 'Stop' : 'Live'}
        </button>
        {isLive && (
          <span
            style={{
              fontSize: 11,
              color: '#22c55e',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#22c55e',
                animation: 'pulse 1.5s infinite',
              }}
            />
            Polling every 2s
          </span>
        )}
        <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 'auto' }}>
          {spans.length} spans
        </span>
      </div>

      {!selectedTicket ? (
        <div style={styles.empty}>Select a ticket to view its execution traces.</div>
      ) : spans.length === 0 ? (
        <div style={styles.empty}>
          No traces found for this ticket. {isLive && 'Waiting for execution...'}
        </div>
      ) : (
        <div style={styles.traceContainer}>{rootSpans.map((span) => renderSpan(span, 0))}</div>
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

const styles = {
  page: { padding: 24, fontFamily: 'sans-serif', color: '#f9fafb' },
  header: { marginBottom: 20 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  select: {
    background: '#1f2937',
    color: '#f9fafb',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 13,
    flex: 1,
  },
  btn: {
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  empty: {
    textAlign: 'center' as const,
    color: '#6b7280',
    padding: 40,
    fontSize: 14,
    background: '#1f2937',
    borderRadius: 8,
    border: '1px solid #374151',
  },
  traceContainer: {
    background: '#1f2937',
    borderRadius: 8,
    border: '1px solid #374151',
    overflow: 'hidden',
  },
}
