'use client'

/**
 * Topbar — 64px bar with breadcrumb, org switcher, health badge, presence avatars, and user menu
 */

import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { useActiveOrg } from '../../hooks/use-active-org'
import { trpc } from '../../utils/trpc'
import PresenceAvatars from './presence-avatars'

// ── Org Switcher ───────────────────────────────────────────────────────

function OrgSwitcher() {
  const [open, setOpen] = useState(false)
  const { activeOrg, allOrgs, switchOrg } = useActiveOrg()

  if (!activeOrg) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neon-teal/5 border border-neon-teal/20 text-xs text-neon-teal hover:bg-neon-teal/10 transition-colors cursor-pointer"
      >
        <span className="font-medium truncate max-w-[120px]">{activeOrg.name}</span>
        <span className="text-neon-teal/50 text-[9px]">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-1 w-56 bg-bg-surface border border-border rounded-lg shadow-lg z-50 overflow-hidden">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide px-3 pt-2 pb-1">
              Organizations
            </div>
            {allOrgs.map((org) => (
              <button
                key={org.id}
                className={`w-full text-left px-3 py-2 text-[12px] flex items-center gap-2 transition-colors cursor-pointer border-none ${
                  org.isActive
                    ? 'bg-neon-teal/10 text-neon-teal'
                    : 'text-slate-300 hover:bg-white/5'
                }`}
                onClick={() => {
                  if (!org.isActive) switchOrg(org.id)
                  setOpen(false)
                }}
              >
                <span className="flex-1 truncate">{org.name}</span>
                <span className="text-[9px] text-slate-600">{String(org.role)}</span>
                {org.isActive && <span className="text-[9px] text-neon-green">active</span>}
              </button>
            ))}
            <a
              href="/org"
              className="block px-3 py-2 text-[11px] text-slate-500 hover:text-slate-300 hover:bg-white/5 border-t border-border no-underline transition-colors"
              onClick={() => setOpen(false)}
            >
              Manage organizations
            </a>
          </div>
        </>
      )}
    </div>
  )
}

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

  const dotClass =
    score >= 90 ? 'neon-dot-green neon-dot-pulse' : score >= 70 ? 'neon-dot-yellow' : 'neon-dot-red'
  const labelClass =
    score >= 90 ? 'text-neon-green' : score >= 70 ? 'text-neon-yellow' : 'text-neon-red'
  const label = score >= 90 ? 'Healthy' : score >= 70 ? 'Degraded' : 'Unhealthy'

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-elevated border border-border text-xs">
      <span
        className={`neon-dot ${dotClass}`}
        role="status"
        aria-label={`System health: ${label}`}
      />
      <span className={`font-medium ${labelClass}`}>{label}</span>
      <span className="font-mono text-slate-500">{score}%</span>
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
  admin: 'Admin',
  orgs: 'Organizations',
  users: 'Users',
  domain: 'Domain',
  developments: 'Developments',
  astrology: 'Astrology',
  insights: 'Insights',
  relationships: 'Relationships',
  reports: 'Reports',
  charts: 'Charts',
}

function OrgBreadcrumbLabel() {
  const { activeOrg, isLoading } = useActiveOrg()
  if (isLoading) return <span className="text-slate-500">Brain</span>
  if (!activeOrg) return <span className="text-slate-500">Brain</span>
  return <span className="text-neon-teal/70">{activeOrg.name}</span>
}

function Breadcrumb() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  if (segments.length === 0) {
    return (
      <div className="flex items-center gap-1.5 font-mono text-sm">
        <OrgBreadcrumbLabel />
        <span className="text-white/20">/</span>
        <span className="text-slate-200 font-medium">Dashboard</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 font-mono text-sm">
      <OrgBreadcrumbLabel />
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1
        const label = SEGMENT_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1)
        return (
          <span key={i} className="flex items-center gap-1.5">
            <span className="text-white/20">/</span>
            <span className={isLast ? 'text-slate-200 font-medium' : 'text-slate-500'}>
              {label}
            </span>
          </span>
        )
      })}
    </div>
  )
}

// ── User Menu ────────────────────────────────────────────────────────────

function UserMenu() {
  const handleSignOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' })
    window.location.href = '/auth/signin'
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-[11px] text-slate-600 hover:text-slate-400 bg-transparent border border-white/10 hover:border-white/20 rounded px-2 py-1 cursor-pointer transition-colors font-mono"
    >
      Sign out
    </button>
  )
}

// ── Main ────────────────────────────────────────────────────────────────

export default function Topbar() {
  return (
    <header className="h-16 min-h-16 flex items-center justify-between px-6 border-b border-border bg-bg-surface/80 backdrop-blur-xl z-10">
      <Breadcrumb />
      <div className="flex items-center gap-3">
        <OrgSwitcher />
        <div className="w-px h-5 bg-white/10" />
        <HealthBadge />
        <div className="w-px h-5 bg-white/10" />
        <PresenceAvatars maxVisible={4} />
        <div className="w-px h-5 bg-white/10" />
        <UserMenu />
      </div>
    </header>
  )
}
