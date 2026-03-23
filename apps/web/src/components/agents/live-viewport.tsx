'use client'

/**
 * Live Agent Viewport
 *
 * Real-time view of an agent's active browser session:
 * - Screenshot stream displayed as a live feed
 * - Narration sidebar: timestamped log of agent actions
 * - Controls: pause, resume, take over (human takes control)
 */

import { useEffect, useRef } from 'react'
import type { StreamEvent } from '../../server/services/browser-agent/stream'

// ── Types ─────────────────────────────────────────────────────────────────

interface LiveViewportProps {
  sessionId: string
  agentName: string
  /** Stream of events — in real impl, consumed via SSE */
  events?: StreamEvent[]
  currentUrl?: string
  latestScreenshot?: string
  status?: 'running' | 'paused' | 'stopped'
  onPause?: () => void
  onResume?: () => void
  onTakeover?: () => void
  onStop?: () => void
  /** Expand to full screen */
  fullScreen?: boolean
}

interface NarrationEntry {
  timestamp: Date
  type: string
  message: string
  isError?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────

function eventToNarration(event: StreamEvent): NarrationEntry {
  const base = { timestamp: event.timestamp, type: event.type }
  switch (event.type) {
    case 'action': {
      const d = event.data as { action: string; description: string }
      return { ...base, message: `${d.action}: ${d.description}` }
    }
    case 'navigation': {
      const d = event.data as { to: string; statusCode?: number }
      return { ...base, message: `Navigated to ${d.to}${d.statusCode ? ` (${d.statusCode})` : ''}` }
    }
    case 'screenshot': {
      const d = event.data as { sequence: number }
      return { ...base, message: `Screenshot #${d.sequence} captured` }
    }
    case 'error': {
      const d = event.data as { message: string; recoverable: boolean }
      return { ...base, message: d.message, isError: true }
    }
    case 'status': {
      const d = event.data as { status: string; reason?: string }
      return { ...base, message: `Session ${d.status}${d.reason ? `: ${d.reason}` : ''}` }
    }
    default:
      return { ...base, message: JSON.stringify(event.data) }
  }
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string; dot: string }> = {
    running: { bg: '#052e16', text: '#4ade80', dot: '#22c55e' },
    paused: { bg: '#422006', text: '#fb923c', dot: '#f97316' },
    stopped: { bg: '#1c1917', text: '#78716c', dot: '#57534e' },
  }
  const c = colors[status] ?? colors.stopped
  return (
    <span style={{ ...styles.badge, background: c.bg, color: c.text }}>
      <span style={{ ...styles.dot, background: c.dot, boxShadow: status === 'running' ? `0 0 6px ${c.dot}` : 'none' }} />
      {status}
    </span>
  )
}

function ControlBar({
  status,
  onPause,
  onResume,
  onTakeover,
  onStop,
}: {
  status: string
  onPause?: () => void
  onResume?: () => void
  onTakeover?: () => void
  onStop?: () => void
}) {
  return (
    <div style={styles.controls}>
      {status === 'running' && onPause && (
        <button style={styles.ctrlBtn} onClick={onPause} title="Pause agent">⏸ Pause</button>
      )}
      {status === 'paused' && onResume && (
        <button style={{ ...styles.ctrlBtn, ...styles.ctrlBtnGreen }} onClick={onResume} title="Resume agent">▶ Resume</button>
      )}
      {status !== 'stopped' && onTakeover && (
        <button style={{ ...styles.ctrlBtn, ...styles.ctrlBtnOrange }} onClick={onTakeover} title="Take control of browser">🖐 Take Over</button>
      )}
      {status !== 'stopped' && onStop && (
        <button style={{ ...styles.ctrlBtn, ...styles.ctrlBtnRed }} onClick={onStop} title="Stop session">⏹ Stop</button>
      )}
    </div>
  )
}

function NarrationSidebar({ entries }: { entries: NarrationEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries.length])

  return (
    <div style={styles.sidebar}>
      <div style={styles.sidebarHeader}>Narration</div>
      <div style={styles.sidebarScroll}>
        {entries.length === 0 && (
          <div style={styles.emptyNarration}>Waiting for events...</div>
        )}
        {entries.map((entry) => (
          <div key={`${entry.timestamp.getTime()}-${entry.type}-${entry.message}`} style={{ ...styles.narrationEntry, ...(entry.isError ? styles.narrationError : {}) }}>
            <span style={styles.narrationTime}>{formatTime(entry.timestamp)}</span>
            <span style={styles.narrationBadge}>{entry.type}</span>
            <span style={styles.narrationMsg}>{entry.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────

export default function LiveViewport({
  sessionId,
  agentName,
  events = [],
  currentUrl = 'about:blank',
  latestScreenshot,
  status = 'running',
  onPause,
  onResume,
  onTakeover,
  onStop,
  fullScreen = false,
}: LiveViewportProps) {
  const narration = events.map(eventToNarration)

  return (
    <div style={{ ...styles.container, ...(fullScreen ? styles.fullScreen : {}) }}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.agentName}>{agentName}</span>
          <StatusBadge status={status} />
          <span style={styles.sessionId}>#{sessionId.slice(0, 8)}</span>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.urlBar}>{currentUrl}</span>
        </div>
      </div>

      {/* Body: viewport + sidebar */}
      <div style={styles.body}>
        {/* Screenshot / Browser view */}
        <div style={styles.viewport}>
          {latestScreenshot ? (
            <img
              src={latestScreenshot}
              alt="Agent browser view"
              style={styles.screenshotImg}
            />
          ) : (
            <div style={styles.placeholder}>
              <div style={styles.placeholderIcon}>🌐</div>
              <div style={styles.placeholderText}>
                {status === 'stopped'
                  ? 'Session ended'
                  : 'Waiting for browser session...'}
              </div>
            </div>
          )}

          {/* Overlay status when paused */}
          {status === 'paused' && (
            <div style={styles.pausedOverlay}>
              <span style={styles.pausedLabel}>PAUSED</span>
            </div>
          )}
        </div>

        {/* Narration sidebar */}
        <NarrationSidebar entries={narration} />
      </div>

      {/* Controls */}
      <ControlBar
        status={status}
        onPause={onPause}
        onResume={onResume}
        onTakeover={onTakeover}
        onStop={onStop}
      />
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = {
  container: {
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: 8,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
    height: 520,
  },
  fullScreen: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 200,
    borderRadius: 0,
    height: '100vh',
  },
  // Header
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: '#0f172a',
    borderBottom: '1px solid #1f2937',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 8 },
  agentName: { fontSize: 13, fontWeight: 700, color: '#f9fafb' },
  sessionId: { fontSize: 11, color: '#6b7280', fontFamily: 'monospace' },
  urlBar: {
    fontSize: 11,
    color: '#9ca3af',
    background: '#1f2937',
    padding: '3px 10px',
    borderRadius: 4,
    fontFamily: 'monospace',
    maxWidth: 300,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 10,
  },
  dot: { width: 6, height: 6, borderRadius: '50%', display: 'inline-block' },
  // Body
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  viewport: {
    flex: 1,
    position: 'relative' as const,
    background: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  screenshotImg: { width: '100%', height: '100%', objectFit: 'contain' as const },
  placeholder: { textAlign: 'center' as const, color: '#6b7280' },
  placeholderIcon: { fontSize: 40, marginBottom: 8, opacity: 0.4 },
  placeholderText: { fontSize: 13 },
  pausedOverlay: {
    position: 'absolute' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pausedLabel: {
    background: '#f97316',
    color: '#fff',
    padding: '6px 20px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 2,
  },
  // Sidebar
  sidebar: {
    width: 280,
    borderLeft: '1px solid #1f2937',
    display: 'flex',
    flexDirection: 'column' as const,
    background: '#0f172a',
  },
  sidebarHeader: {
    padding: '8px 12px',
    fontSize: 11,
    fontWeight: 700,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    borderBottom: '1px solid #1f2937',
  },
  sidebarScroll: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '6px 0',
  },
  emptyNarration: { padding: 12, fontSize: 12, color: '#4b5563', textAlign: 'center' as const },
  narrationEntry: {
    padding: '4px 12px',
    fontSize: 11,
    lineHeight: '1.5',
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
    alignItems: 'baseline',
    borderBottom: '1px solid #111827',
  },
  narrationError: { background: '#1c0a0a', borderLeft: '2px solid #ef4444' },
  narrationTime: { color: '#4b5563', fontFamily: 'monospace', fontSize: 10, flexShrink: 0 },
  narrationBadge: {
    background: '#1f2937',
    color: '#9ca3af',
    padding: '0 4px',
    borderRadius: 3,
    fontSize: 10,
    fontFamily: 'monospace',
    flexShrink: 0,
  },
  narrationMsg: { color: '#d1d5db', wordBreak: 'break-word' as const },
  // Controls
  controls: {
    display: 'flex',
    gap: 6,
    padding: '8px 12px',
    background: '#0f172a',
    borderTop: '1px solid #1f2937',
  },
  ctrlBtn: {
    border: '1px solid #374151',
    background: '#1f2937',
    color: '#d1d5db',
    padding: '5px 14px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  ctrlBtnGreen: { borderColor: '#166534', color: '#4ade80' },
  ctrlBtnOrange: { borderColor: '#9a3412', color: '#fb923c' },
  ctrlBtnRed: { borderColor: '#7f1d1d', color: '#f87171' },
}
