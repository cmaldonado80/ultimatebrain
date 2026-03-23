'use client'

/**
 * Presence Avatars
 *
 * Top-right row of avatar circles for connected users + active agents.
 * - Hover: name, current location (tab/ticket/workspace)
 * - Agent avatars pulse when executing
 */

import { useState } from 'react'
import type { PresenceEntry } from '../../server/services/presence/manager'

// ── Mock data ─────────────────────────────────────────────────────────────

const MOCK_ENTRIES: PresenceEntry[] = [
  {
    id: 'u1',
    type: 'user',
    name: 'Alice Chen',
    location: '/projects',
    lastSeen: new Date(),
    connectedAt: new Date(Date.now() - 1800_000),
  },
  {
    id: 'u2',
    type: 'user',
    name: 'Bob Kim',
    location: '/tickets/T-142',
    lastSeen: new Date(),
    connectedAt: new Date(Date.now() - 600_000),
  },
  {
    id: 'a1',
    type: 'agent',
    name: 'Code Reviewer',
    location: '/tickets/T-139',
    isExecuting: true,
    ticketId: 'T-139',
    workspaceId: 'ws-main',
    lastSeen: new Date(),
    connectedAt: new Date(Date.now() - 300_000),
  },
  {
    id: 'a2',
    type: 'agent',
    name: 'Deploy Bot',
    location: '/ops',
    isExecuting: false,
    workspaceId: 'ws-main',
    lastSeen: new Date(),
    connectedAt: new Date(Date.now() - 7200_000),
  },
  {
    id: 'u3',
    type: 'user',
    name: 'Carol Davis',
    location: '/ops',
    lastSeen: new Date(),
    connectedAt: new Date(Date.now() - 120_000),
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#eab308']

function getColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return COLORS[Math.abs(hash) % COLORS.length]
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function formatLocation(loc: string): string {
  if (loc.startsWith('/tickets/')) return `Ticket ${loc.split('/').pop()}`
  if (loc === '/projects') return 'Projects'
  if (loc === '/ops') return 'Ops Center'
  if (loc === '/playbooks') return 'Playbooks'
  return loc
}

// ── Sub-components ────────────────────────────────────────────────────────

function Avatar({
  entry,
  onHover,
  onLeave,
  isHovered,
}: {
  entry: PresenceEntry
  onHover: () => void
  onLeave: () => void
  isHovered: boolean
}) {
  const bg = getColor(entry.id)
  const isAgent = entry.type === 'agent'
  const isPulsing = isAgent && entry.isExecuting

  return (
    <div
      style={{
        ...styles.avatarWrapper,
        zIndex: isHovered ? 10 : 1,
      }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <div
        style={{
          ...styles.avatar,
          background: bg,
          border: isAgent ? '2px solid #a855f7' : '2px solid #1f2937',
          animation: isPulsing ? 'pulse 1.5s ease-in-out infinite' : 'none',
          boxShadow: isPulsing ? `0 0 8px ${bg}` : 'none',
        }}
      >
        {entry.avatarUrl ? (
          <img src={entry.avatarUrl} alt={entry.name} style={styles.avatarImg} />
        ) : (
          <span style={styles.initials}>{getInitials(entry.name)}</span>
        )}
      </div>

      {/* Online indicator */}
      <span
        style={{
          ...styles.statusDot,
          background: isPulsing ? '#f97316' : '#22c55e',
          boxShadow: isPulsing ? '0 0 4px #f97316' : '0 0 4px #22c55e',
        }}
      />

      {/* Tooltip */}
      {isHovered && (
        <div style={styles.tooltip}>
          <div style={styles.tooltipName}>{entry.name}</div>
          <div style={styles.tooltipType}>{isAgent ? 'Agent' : 'User'}</div>
          <div style={styles.tooltipLocation}>{formatLocation(entry.location)}</div>
          {entry.ticketId && (
            <div style={styles.tooltipMeta}>Working on {entry.ticketId}</div>
          )}
          {isPulsing && (
            <div style={styles.tooltipExecuting}>Executing...</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────

interface PresenceAvatarsProps {
  entries?: PresenceEntry[]
  /** Max avatars to show before +N overflow */
  maxVisible?: number
}

export default function PresenceAvatars({
  entries = MOCK_ENTRIES,
  maxVisible = 5,
}: PresenceAvatarsProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const visible = entries.slice(0, maxVisible)
  const overflow = entries.length - maxVisible

  const users = entries.filter((e) => e.type === 'user').length
  const agents = entries.filter((e) => e.type === 'agent').length

  return (
    <div style={styles.container}>
      {/* Avatar stack */}
      <div style={styles.stack}>
        {visible.map((entry) => (
          <Avatar
            key={entry.id}
            entry={entry}
            isHovered={hoveredId === entry.id}
            onHover={() => setHoveredId(entry.id)}
            onLeave={() => setHoveredId(null)}
          />
        ))}
        {overflow > 0 && (
          <div style={styles.overflow}>+{overflow}</div>
        )}
      </div>

      {/* Summary */}
      <div style={styles.summary}>
        <span style={styles.summaryCount}>{users} user{users !== 1 ? 's' : ''}</span>
        <span style={styles.summarySep}>·</span>
        <span style={styles.summaryCount}>{agents} agent{agents !== 1 ? 's' : ''}</span>
      </div>

      {/* Inline keyframes for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }
      `}</style>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = {
  container: { display: 'flex', alignItems: 'center', gap: 10 },
  stack: { display: 'flex', flexDirection: 'row-reverse' as const },
  avatarWrapper: {
    position: 'relative' as const,
    marginLeft: -8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 700,
    color: '#fff',
    cursor: 'pointer',
    transition: 'transform 0.15s',
  },
  avatarImg: { width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' as const },
  initials: { fontSize: 11, fontWeight: 700, letterSpacing: 0.5 },
  statusDot: {
    position: 'absolute' as const,
    bottom: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: '50%',
    border: '2px solid #111827',
  },
  overflow: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: '#374151',
    border: '2px solid #1f2937',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 600,
    color: '#9ca3af',
    marginLeft: -8,
  },
  // Tooltip
  tooltip: {
    position: 'absolute' as const,
    top: 40,
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#1f2937',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '8px 12px',
    whiteSpace: 'nowrap' as const,
    zIndex: 100,
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  },
  tooltipName: { fontSize: 12, fontWeight: 700, color: '#f9fafb', marginBottom: 2 },
  tooltipType: { fontSize: 10, color: '#6b7280', marginBottom: 4 },
  tooltipLocation: { fontSize: 11, color: '#9ca3af' },
  tooltipMeta: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  tooltipExecuting: { fontSize: 10, color: '#f97316', fontWeight: 600, marginTop: 2 },
  // Summary
  summary: { display: 'flex', alignItems: 'center', gap: 4 },
  summaryCount: { fontSize: 11, color: '#6b7280' },
  summarySep: { fontSize: 11, color: '#374151' },
}
