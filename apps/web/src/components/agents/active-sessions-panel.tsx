'use client'

/**
 * Active Sessions Panel — Ops Center Integration
 *
 * Displays all running browser agent sessions in a grid.
 * Click any session to expand to full-screen LiveViewport.
 */

import { useState } from 'react'
import LiveViewport from './live-viewport'
import type { StreamEvent } from '../../server/services/browser-agent/stream'

// ── Types ─────────────────────────────────────────────────────────────────

interface SessionSummary {
  id: string
  agentId: string
  agentName: string
  startedAt: Date
  status: 'running' | 'paused' | 'stopped'
  currentUrl: string
  eventCount: number
  latestScreenshot?: string
  events: StreamEvent[]
}

interface ActiveSessionsPanelProps {
  sessions?: SessionSummary[]
  onPause?: (sessionId: string) => void
  onResume?: (sessionId: string) => void
  onTakeover?: (sessionId: string) => void
  onStop?: (sessionId: string) => void
}

// ── Mock data ─────────────────────────────────────────────────────────────

const MOCK_SESSIONS: SessionSummary[] = [
  {
    id: 'sess-001',
    agentId: 'agent-web-scraper',
    agentName: 'Web Scraper',
    startedAt: new Date(Date.now() - 300_000),
    status: 'running',
    currentUrl: 'https://example.com/products?page=3',
    eventCount: 42,
    events: [
      {
        type: 'navigation',
        sessionId: 'sess-001',
        timestamp: new Date(Date.now() - 60000),
        data: { from: '/products?page=2', to: '/products?page=3', statusCode: 200 },
      },
      {
        type: 'action',
        sessionId: 'sess-001',
        timestamp: new Date(Date.now() - 30000),
        data: {
          action: 'click',
          description: 'Clicked "Next Page" button',
          selector: '.pagination-next',
        },
      },
      {
        type: 'screenshot',
        sessionId: 'sess-001',
        timestamp: new Date(Date.now() - 2000),
        data: { imageUrl: '', width: 1280, height: 720, sequence: 21 },
      },
    ],
  },
  {
    id: 'sess-002',
    agentId: 'agent-form-filler',
    agentName: 'Form Filler',
    startedAt: new Date(Date.now() - 120_000),
    status: 'paused',
    currentUrl: 'https://app.example.com/settings/profile',
    eventCount: 15,
    events: [
      {
        type: 'action',
        sessionId: 'sess-002',
        timestamp: new Date(Date.now() - 90000),
        data: {
          action: 'type',
          description: 'Filled email field',
          selector: '#email',
          value: 'user@example.com',
        },
      },
      {
        type: 'status',
        sessionId: 'sess-002',
        timestamp: new Date(Date.now() - 10000),
        data: { status: 'paused', reason: 'Awaiting human approval' },
      },
    ],
  },
  {
    id: 'sess-003',
    agentId: 'agent-monitor',
    agentName: 'Site Monitor',
    startedAt: new Date(Date.now() - 600_000),
    status: 'running',
    currentUrl: 'https://status.example.com/dashboard',
    eventCount: 78,
    events: [
      {
        type: 'navigation',
        sessionId: 'sess-003',
        timestamp: new Date(Date.now() - 5000),
        data: { from: '/dashboard', to: '/dashboard', statusCode: 200 },
      },
      {
        type: 'screenshot',
        sessionId: 'sess-003',
        timestamp: new Date(Date.now() - 2000),
        data: { imageUrl: '', width: 1280, height: 720, sequence: 39 },
      },
    ],
  },
]

// ── Sub-components ────────────────────────────────────────────────────────

function SessionCard({ session, onClick }: { session: SessionSummary; onClick: () => void }) {
  const elapsed = Math.round((Date.now() - session.startedAt.getTime()) / 60_000)
  const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
    running: { bg: '#052e16', text: '#4ade80', dot: '#22c55e' },
    paused: { bg: '#422006', text: '#fb923c', dot: '#f97316' },
    stopped: { bg: '#1c1917', text: '#78716c', dot: '#57534e' },
  }
  const sc = statusColors[session.status] ?? statusColors.stopped

  return (
    <div style={styles.card} onClick={onClick}>
      {/* Thumbnail */}
      <div style={styles.thumbnail}>
        <div style={styles.thumbPlaceholder}>🌐</div>
      </div>

      {/* Info */}
      <div style={styles.cardInfo}>
        <div style={styles.cardHeader}>
          <span style={styles.cardAgent}>{session.agentName}</span>
          <span style={{ ...styles.cardStatus, background: sc.bg, color: sc.text }}>
            <span style={{ ...styles.statusDot, background: sc.dot }} />
            {session.status}
          </span>
        </div>
        <div style={styles.cardUrl}>{session.currentUrl}</div>
        <div style={styles.cardMeta}>
          <span>{elapsed}m elapsed</span>
          <span>{session.eventCount} events</span>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────

export default function ActiveSessionsPanel({
  sessions = MOCK_SESSIONS,
  onPause,
  onResume,
  onTakeover,
  onStop,
}: ActiveSessionsPanelProps) {
  const isDemo = sessions === MOCK_SESSIONS
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const expandedSession = sessions.find((s) => s.id === expandedId)

  const runningSessions = sessions.filter((s) => s.status === 'running')
  const pausedSessions = sessions.filter((s) => s.status === 'paused')

  // Full-screen viewport for expanded session
  if (expandedSession) {
    return (
      <div style={styles.fullWrapper}>
        <button style={styles.closeBtn} onClick={() => setExpandedId(null)}>
          ← Back to sessions
        </button>
        <LiveViewport
          sessionId={expandedSession.id}
          agentName={expandedSession.agentName}
          events={expandedSession.events}
          currentUrl={expandedSession.currentUrl}
          latestScreenshot={expandedSession.latestScreenshot}
          status={expandedSession.status}
          onPause={onPause ? () => onPause(expandedSession.id) : undefined}
          onResume={onResume ? () => onResume(expandedSession.id) : undefined}
          onTakeover={onTakeover ? () => onTakeover(expandedSession.id) : undefined}
          onStop={onStop ? () => onStop(expandedSession.id) : undefined}
          fullScreen
        />
      </div>
    )
  }

  return (
    <div style={styles.panel}>
      {isDemo && (
        <div
          style={{
            background: '#1e1b4b',
            color: '#818cf8',
            fontSize: 11,
            fontWeight: 600,
            padding: '4px 12px',
            borderRadius: 4,
            marginBottom: 8,
            display: 'inline-block',
          }}
        >
          Demo Sessions — connect browser agent service for real data
        </div>
      )}
      <div style={styles.panelHeader}>
        <h3 style={styles.panelTitle}>Active Browser Sessions</h3>
        <div style={styles.panelStats}>
          <span style={styles.statRunning}>{runningSessions.length} running</span>
          {pausedSessions.length > 0 && (
            <span style={styles.statPaused}>{pausedSessions.length} paused</span>
          )}
        </div>
      </div>

      {sessions.length === 0 ? (
        <div style={styles.empty}>No active browser sessions</div>
      ) : (
        <div style={styles.grid}>
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onClick={() => setExpandedId(session.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = {
  panel: {
    background: '#111827',
    borderRadius: 8,
    border: '1px solid #1f2937',
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #1f2937',
  },
  panelTitle: { margin: 0, fontSize: 14, fontWeight: 700, color: '#f9fafb' },
  panelStats: { display: 'flex', gap: 8 },
  statRunning: { fontSize: 11, color: '#4ade80' },
  statPaused: { fontSize: 11, color: '#fb923c' },
  empty: { padding: 24, textAlign: 'center' as const, fontSize: 13, color: '#6b7280' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320, 1fr))',
    gap: 1,
    background: '#1f2937',
  },
  // Card
  card: {
    display: 'flex',
    gap: 12,
    padding: '12px 16px',
    background: '#111827',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  thumbnail: {
    width: 80,
    height: 50,
    background: '#000',
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    border: '1px solid #1f2937',
  },
  thumbPlaceholder: { fontSize: 20, opacity: 0.3 },
  cardInfo: { flex: 1, minWidth: 0 },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardAgent: { fontSize: 13, fontWeight: 600, color: '#f9fafb' },
  cardStatus: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: 8,
  },
  statusDot: { width: 5, height: 5, borderRadius: '50%', display: 'inline-block' },
  cardUrl: {
    fontSize: 11,
    color: '#6b7280',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    marginBottom: 4,
  },
  cardMeta: { display: 'flex', gap: 12, fontSize: 11, color: '#4b5563' },
  // Full-screen wrapper
  fullWrapper: { position: 'fixed' as const, inset: 0, zIndex: 200, background: '#0f172a' },
  closeBtn: {
    position: 'absolute' as const,
    top: 8,
    left: 8,
    zIndex: 201,
    background: 'rgba(0,0,0,0.6)',
    border: '1px solid #374151',
    color: '#9ca3af',
    padding: '5px 12px',
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
  },
}
