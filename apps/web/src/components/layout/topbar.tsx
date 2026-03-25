'use client'

/**
 * Topbar — 64px bar with breadcrumb, health badge, presence avatars, and user menu
 */

import { usePathname } from 'next/navigation'
import { trpc } from '../../utils/trpc'
import PresenceAvatars from './presence-avatars'

// ── Health Badge ────────────────────────────────────────────────────────

function HealthBadge() {
  const { data } = trpc.healing.healthCheck.useQuery(undefined, {
    refetchInterval: 30_000,
    retry: false,
  })

  const checks = data?.checks ?? []
  const okCount = checks.filter(
    (c: { status: string }) => c.status === 'pass' || c.status === 'ok',
  ).length
  const score = checks.length > 0 ? Math.round((okCount / checks.length) * 100) : 100
  const color = score >= 90 ? '#22c55e' : score >= 70 ? '#f97316' : '#ef4444'
  const label = score >= 90 ? 'Healthy' : score >= 70 ? 'Degraded' : 'Unhealthy'

  return (
    <div style={styles.healthBadge}>
      <span style={{ ...styles.healthDot, background: color, boxShadow: `0 0 6px ${color}` }} />
      <span style={{ ...styles.healthLabel, color }}>{label}</span>
      <span style={styles.healthScore}>{score}%</span>
    </div>
  )
}

// ── Breadcrumb ──────────────────────────────────────────────────────────

const SEGMENT_LABELS: Record<string, string> = {
  '': 'Dashboard',
  agents: 'Agents',
  tickets: 'Tickets',
  workspaces: 'Workspaces',
  projects: 'Projects',
  chat: 'Chat',
  canvas: 'Feature Flags',
  memory: 'Memory',
  flows: 'Flows',
  playbooks: 'Playbooks',
  skills: 'Skills',
  settings: 'Settings',
  engines: 'Engines',
  apps: 'Apps',
  integrations: 'Integrations',
  qa: 'QA',
  ops: 'Ops Center',
  approvals: 'Approvals',
  checkpoints: 'Checkpoints',
  dlq: 'DLQ',
  evals: 'Evals',
  gateway: 'Gateway',
  guardrails: 'Guardrails',
  traces: 'Traces',
}

function Breadcrumb() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  if (segments.length === 0) {
    return (
      <div style={styles.breadcrumb}>
        <span style={styles.breadcrumbItem}>Brain</span>
        <span style={styles.breadcrumbSep}>/</span>
        <span style={styles.breadcrumbCurrent}>Dashboard</span>
      </div>
    )
  }

  return (
    <div style={styles.breadcrumb}>
      <span style={styles.breadcrumbItem}>Brain</span>
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1
        const label = SEGMENT_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1)
        return (
          <span key={i}>
            <span style={styles.breadcrumbSep}>/</span>
            <span style={isLast ? styles.breadcrumbCurrent : styles.breadcrumbItem}>{label}</span>
          </span>
        )
      })}
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────

function UserMenu() {
  const handleSignOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' })
    window.location.href = '/auth/signin'
  }

  return (
    <div style={styles.userMenu}>
      <button onClick={handleSignOut} style={styles.signOutBtn}>
        Sign out
      </button>
    </div>
  )
}

export default function Topbar() {
  return (
    <header style={styles.topbar}>
      <Breadcrumb />
      <div style={styles.rightSection}>
        <HealthBadge />
        <div style={styles.divider} />
        <PresenceAvatars maxVisible={4} />
        <div style={styles.divider} />
        <UserMenu />
      </div>
    </header>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = {
  topbar: {
    height: 64,
    minHeight: 64,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    borderBottom: '1px solid #1f2937',
    background: '#0f172a',
    fontFamily: 'sans-serif',
  },
  breadcrumb: { display: 'flex', alignItems: 'center', gap: 6 },
  breadcrumbItem: { fontSize: 13, color: '#6b7280' },
  breadcrumbSep: { fontSize: 13, color: '#374151' },
  breadcrumbCurrent: { fontSize: 13, color: '#f9fafb', fontWeight: 600 },
  rightSection: { display: 'flex', alignItems: 'center', gap: 12 },
  healthBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: 6,
    padding: '4px 10px',
  },
  healthDot: { width: 7, height: 7, borderRadius: '50%' },
  healthLabel: { fontSize: 12, fontWeight: 600 },
  healthScore: { fontSize: 11, color: '#6b7280', fontFamily: 'monospace' },
  divider: { width: 1, height: 24, background: '#1f2937' },
  userMenu: { display: 'flex', alignItems: 'center', gap: 8 },
  signOutBtn: {
    fontSize: 11,
    color: '#6b7280',
    background: 'none',
    border: '1px solid #374151',
    borderRadius: 4,
    padding: '2px 8px',
    cursor: 'pointer',
  },
}
