'use client'

/**
 * Topbar — 64px bar with breadcrumb, health badge, presence avatars, and user menu
 */

import PresenceAvatars from './presence-avatars'

// ── Health Badge ────────────────────────────────────────────────────────

function HealthBadge() {
  // In real impl: computed from traces + gateway metrics
  const score = 97
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

function Breadcrumb() {
  // In real impl: derived from router pathname
  return (
    <div style={styles.breadcrumb}>
      <span style={styles.breadcrumbItem}>Brain</span>
      <span style={styles.breadcrumbSep}>/</span>
      <span style={styles.breadcrumbCurrent}>Dashboard</span>
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
  userName: {
    fontSize: 12,
    color: '#9ca3af',
    maxWidth: 120,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
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
