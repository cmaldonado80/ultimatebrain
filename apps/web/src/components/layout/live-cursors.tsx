'use client'

/**
 * Live Cursors
 *
 * Shows other users' cursor positions on shared views (projects, tickets, ops).
 * Agents show as moving highlights on tickets they're working on.
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react'

import { trpc } from '../../lib/trpc'
import type { CursorPosition, PresenceEntry } from '../../server/services/presence/types'
import { PRESENCE_CONFIG } from '../../server/services/presence/types'

// ── Types ─────────────────────────────────────────────────────────────────

interface RemoteCursor {
  id: string
  name: string
  type: 'user' | 'agent'
  color: string
  position: CursorPosition
  isExecuting?: boolean
  /** Smoothed position for animation */
  displayX: number
  displayY: number
}

interface LiveCursorsProps {
  /** Current view — only show cursors from entities on the same view */
  currentLocation: string
  /** All presence entries */
  entries?: PresenceEntry[]
  /** Current user ID (to exclude own cursor) */
  currentUserId?: string
  /** Called when local cursor moves (to broadcast via presence manager) */
  onCursorMove?: (position: CursorPosition) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────

const CURSOR_COLORS: Record<string, string> = {}
const COLOR_PALETTE = [
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
  '#14b8a6',
  '#eab308',
  '#ef4444',
  '#06b6d4',
]

function getCursorColor(id: string): string {
  if (!CURSOR_COLORS[id]) {
    let hash = 0
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
    CURSOR_COLORS[id] = COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length]
  }
  return CURSOR_COLORS[id]
}

// getInitials removed (unused)

// ── Mock data ─────────────────────────────────────────────────────────────

const MOCK_ENTRIES: PresenceEntry[] = [
  {
    id: 'u2',
    type: 'user',
    name: 'Bob Kim',
    location: '/projects',
    cursor: { x: 420, y: 310, target: 'project-card' },
    lastSeen: new Date(),
    connectedAt: new Date(),
  },
  {
    id: 'a1',
    type: 'agent',
    name: 'Code Reviewer',
    location: '/projects',
    cursor: { x: 680, y: 180, target: 'ticket-T-139' },
    isExecuting: true,
    ticketId: 'T-139',
    lastSeen: new Date(),
    connectedAt: new Date(),
  },
]

// ── Cursor SVG ────────────────────────────────────────────────────────────

const CursorIcon = memo(function CursorIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="20" viewBox="0 0 16 20" fill="none" style={{ display: 'block' }}>
      <path
        d="M1 1L6 18L8.5 10.5L15 8.5L1 1Z"
        fill={color}
        stroke="#000"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
})

// ── Agent Highlight ───────────────────────────────────────────────────────

const AgentHighlight = memo(function AgentHighlight({
  cursor,
  isExecuting,
}: {
  cursor: RemoteCursor
  isExecuting: boolean
}) {
  return (
    <div
      style={{
        ...styles.agentHighlight,
        left: cursor.displayX - 20,
        top: cursor.displayY - 20,
        borderColor: cursor.color,
        boxShadow: isExecuting ? `0 0 12px ${cursor.color}40` : 'none',
        animation: isExecuting ? 'agent-cursor-pulse 2s ease-in-out infinite' : 'none',
      }}
    >
      <span style={{ ...styles.agentLabel, background: cursor.color }}>{cursor.name}</span>
    </div>
  )
})

// ── Remote Cursor ─────────────────────────────────────────────────────────

const RemoteCursorView = memo(function RemoteCursorView({ cursor }: { cursor: RemoteCursor }) {
  if (cursor.type === 'agent') {
    return <AgentHighlight cursor={cursor} isExecuting={cursor.isExecuting ?? false} />
  }

  return (
    <div
      style={{
        ...styles.cursorContainer,
        left: cursor.displayX,
        top: cursor.displayY,
        transition: 'left 0.1s linear, top 0.1s linear',
      }}
    >
      <CursorIcon color={cursor.color} />
      <span style={{ ...styles.cursorLabel, background: cursor.color }}>{cursor.name}</span>
    </div>
  )
})

// ── Main Component ────────────────────────────────────────────────────────

export default function LiveCursors({
  currentLocation,
  entries: entriesProp,
  currentUserId,
  onCursorMove,
}: LiveCursorsProps) {
  const { data: liveEntries } = trpc.presence.getActive.useQuery(undefined, {
    refetchInterval: 2000,
    retry: false,
  })
  const entries = entriesProp ?? (liveEntries as PresenceEntry[] | undefined) ?? MOCK_ENTRIES
  const isDemo = entries === MOCK_ENTRIES
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const throttleRef = useRef<number>(0)

  // Build remote cursors from presence entries on the same location
  useEffect(() => {
    const filtered = entries.filter(
      (e) => e.location === currentLocation && e.id !== currentUserId && e.cursor,
    )

    setRemoteCursors(
      filtered.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        color: getCursorColor(e.id),
        position: e.cursor!,
        isExecuting: e.isExecuting,
        displayX: e.cursor!.x,
        displayY: e.cursor!.y,
      })),
    )
  }, [entries, currentLocation, currentUserId])

  // Track local cursor and broadcast
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!onCursorMove) return

      const now = Date.now()
      if (now - throttleRef.current < PRESENCE_CONFIG.cursorThrottleMs) return
      throttleRef.current = now

      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      onCursorMove({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        target: (e.target as HTMLElement)?.dataset?.presenceTarget,
      })
    },
    [onCursorMove],
  )

  return (
    <div ref={containerRef} style={styles.overlay} onMouseMove={handleMouseMove}>
      {isDemo && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            fontSize: 9,
            color: 'var(--color-neon-purple)',
            opacity: 0.7,
          }}
        >
          (demo cursors)
        </div>
      )}
      {remoteCursors.map((cursor) => (
        <RemoteCursorView key={cursor.id} cursor={cursor} />
      ))}

      {/* agent-cursor-pulse keyframe defined in globals.css */}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    pointerEvents: 'none' as const,
    zIndex: 150,
    overflow: 'hidden',
  },
  cursorContainer: {
    position: 'absolute' as const,
    pointerEvents: 'none' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
  },
  cursorLabel: {
    display: 'inline-block',
    marginTop: 2,
    marginLeft: 12,
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    color: '#fff',
    whiteSpace: 'nowrap' as const,
    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
  },
  agentHighlight: {
    position: 'absolute' as const,
    pointerEvents: 'none' as const,
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: '2px dashed',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentLabel: {
    position: 'absolute' as const,
    top: -18,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    color: '#fff',
    whiteSpace: 'nowrap' as const,
    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
  },
}
