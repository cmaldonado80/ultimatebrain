'use client'

/**
 * Sidebar — 260px navigation with Cmd+K spotlight search.
 * Admin section shown only to platform_owner.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { memo, useEffect, useState } from 'react'

import { useActiveOrg } from '../../hooks/use-active-org'
import { trpc } from '../../utils/trpc'

// ── Navigation Structure ────────────────────────────────────────────────

interface NavItem {
  label: string
  href: string
  icon: string
  external?: boolean
}

interface NavSection {
  title?: string
  items: NavItem[]
}

const BASE_NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: 'Mission Control', href: '/', icon: '⊞' },
      { label: 'Nerve Center', href: '/nerve-center', icon: '◎' },
      { label: 'CEO Dashboard', href: '/ceo', icon: '⬡' },
      { label: 'Chat', href: '/chat', icon: '◉' },
    ],
  },
  {
    title: 'Corporation',
    items: [
      { label: 'Org Chart', href: '/org-chart', icon: '◈' },
      { label: 'Agents', href: '/agents', icon: '⬡' },
      { label: 'Tickets', href: '/tickets', icon: '▤' },
      { label: 'Project Board', href: '/board', icon: '▦' },
      { label: 'Projects', href: '/projects', icon: '◈' },
      { label: 'Products', href: '/products', icon: '▣' },
      { label: 'Routines', href: '/routines', icon: '⟳' },
    ],
  },
  {
    title: 'Departments',
    items: [
      { label: 'Workspaces', href: '/workspaces', icon: '▦' },
      { label: 'Mini Brain Factory', href: '/mini-brain-factory', icon: '🏭' },
      { label: 'Topology', href: '/topology', icon: '⊡' },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { label: 'Memory Graph', href: '/memory', icon: '◇' },
      { label: 'Instincts', href: '/ops/instincts', icon: '⚡' },
      { label: 'Guardrails', href: '/guardrails', icon: '⛨' },
      { label: 'Skills', href: '/skills', icon: '★' },
      { label: 'Flows', href: '/flows', icon: '⤳' },
      { label: 'Playbooks', href: '/playbooks', icon: '▶' },
    ],
  },
  {
    title: 'Nerve Center',
    items: [
      { label: 'System Pulse', href: '/nerve-center', icon: '◎' },
      { label: 'Tool Catalog', href: '/nerve-center/tools', icon: '⚙' },
      { label: 'Agent Forensics', href: '/nerve-center/agent', icon: '⬡' },
      { label: 'Healing', href: '/ops/healing', icon: '♥' },
      { label: 'Incidents', href: '/ops/incidents', icon: '⚡' },
      { label: 'Alerting', href: '/alerting', icon: '⚠' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Runtime Status', href: '/ops/status', icon: '●' },
      { label: 'Gateway', href: '/ops/gateway', icon: '⇄' },
      { label: 'Traces', href: '/ops/traces', icon: '⋯' },
      { label: 'Evals', href: '/ops/evals', icon: '✓' },
      { label: 'Cron Jobs', href: '/ops/cron', icon: '⏱' },
      { label: 'Approvals', href: '/ops/approvals', icon: '⊘' },
      { label: 'Checkpoints', href: '/ops/checkpoints', icon: '⟲' },
    ],
  },
  {
    title: 'Platform',
    items: [
      { label: 'Engines', href: '/engines', icon: '⚙' },
      { label: 'Runtimes', href: '/runtimes', icon: '◎' },
      { label: 'Model Registry', href: '/model-registry', icon: '⊙' },
      { label: 'Integrations', href: '/integrations', icon: '⊕' },
      { label: 'Secrets', href: '/secrets', icon: '🔑' },
      { label: 'ClawHub', href: '/clawhub', icon: '🦞' },
      { label: 'Settings', href: '/settings', icon: '⚿' },
    ],
  },
  {
    title: 'Organization',
    items: [
      { label: 'Org Settings', href: '/org', icon: '⊞' },
      { label: 'Members', href: '/org/members', icon: '◉' },
      { label: 'Finance', href: '/finance', icon: '$' },
      { label: 'Notifications', href: '/notifications', icon: '⊙' },
      { label: 'Audit Log', href: '/audit', icon: '📋' },
    ],
  },
]

// Domain Apps section is built dynamically from brainEntities (see Sidebar component)

const ADMIN_SECTION: NavSection = {
  title: 'Admin',
  items: [
    { label: 'All Organizations', href: '/admin/orgs', icon: '⊞' },
    { label: 'All Users', href: '/admin/users', icon: '◉' },
  ],
}

// ── Spotlight Search ────────────────────────────────────────────────────

const SpotlightSearch = memo(function SpotlightSearch({
  open,
  onClose,
  sections,
}: {
  open: boolean
  onClose: () => void
  sections: NavSection[]
}) {
  const [query, setQuery] = useState('')

  const allItems = sections.flatMap((s) => s.items)
  const filtered = query
    ? allItems.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    : allItems.slice(0, 8)

  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center pt-28 z-50"
      onClick={onClose}
    >
      <div
        className="cyber-card w-[520px] max-h-96 overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          className="w-full px-4 py-3.5 bg-transparent border-0 border-b border-border text-slate-100 text-[15px] placeholder:text-slate-500 focus:outline-none"
          placeholder="Search pages, agents, tickets..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="overflow-y-auto max-h-72 py-1">
          {filtered.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 no-underline transition-colors"
              onClick={onClose}
            >
              <span className="w-5 text-center text-xs opacity-60">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
          {filtered.length === 0 && (
            <div className="py-4 text-center text-sm text-slate-500">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

// ── Org Name ──────────────────────────────────────────────────────────────

function OrgNameLabel() {
  const { activeOrg } = useActiveOrg()
  if (!activeOrg) return null
  return <div className="text-[10px] text-neon-teal/50 mt-1 truncate ml-7">{activeOrg.name}</div>
}

// ── Sidebar Component ───────────────────────────────────────────────────

export default function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname()
  const [spotlightOpen, setSpotlightOpen] = useState(false)
  const { isPlatformOwner } = useActiveOrg()

  // Build dynamic Domain Apps section from DB
  const topologyQuery = trpc.entities.topology.useQuery(undefined, { staleTime: 60_000 })
  const miniBrains = (topologyQuery.data?.miniBrains ?? []) as Array<{
    id: string
    name: string
    domain: string | null
    status: string
  }>

  const DOMAIN_ICONS: Record<string, string> = {
    astrology: '☉',
    hospitality: '🏨',
    healthcare: '🏥',
    marketing: '📣',
    'soc-ops': '🛡',
    research: '🔬',
    intelligence: '🧠',
    infrastructure: '☁',
    security: '🛡',
    'product-management': '📦',
    engineering: '⚙',
  }

  const domainSection: NavSection | null =
    miniBrains.length > 0
      ? {
          title: 'Domain Apps',
          items: miniBrains.map((mb) => ({
            label: mb.name,
            href: `/domain/${mb.domain ?? mb.id}`,
            icon: DOMAIN_ICONS[mb.domain ?? ''] ?? '◆',
          })),
        }
      : null

  const sections = [...BASE_NAV_SECTIONS]
  if (domainSection) sections.push(domainSection)
  if (isPlatformOwner) sections.push(ADMIN_SECTION)
  const navSections = sections

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSpotlightOpen((prev) => !prev)
      }
      if (e.key === 'Escape') setSpotlightOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const isActive = (href: string) =>
    href === '/' || href === '/ops'
      ? pathname === href
      : pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      <aside className="w-64 h-full flex-shrink-0 bg-bg-surface border-r border-border flex flex-col px-3 py-4 z-20 overflow-hidden">
        {/* Logo + Org */}
        <div className="px-2 mb-5">
          <div className="flex items-center gap-2.5">
            <span className="text-neon-blue text-lg">◆</span>
            <span className="font-orbitron text-[14px] font-bold text-white tracking-widest">
              SOLARC<span className="text-neon-blue">.</span>BRAIN
            </span>
          </div>
          <OrgNameLabel />
        </div>

        {/* Search trigger */}
        <button
          className="flex items-center gap-2 w-full px-3 py-2 mb-4 bg-bg-elevated border border-border rounded-lg text-sm text-slate-500 hover:text-slate-300 hover:border-white/15 transition-colors cursor-pointer"
          onClick={() => setSpotlightOpen(true)}
        >
          <span className="text-base leading-none">⌕</span>
          <span className="flex-1 text-left">Search</span>
          <span className="text-[10px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded font-mono text-slate-600">
            ⌘K
          </span>
        </button>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto space-y-0.5">
          {navSections.map((section, si) => (
            <div key={si}>
              {section.title && (
                <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/20 px-2 pt-4 pb-1.5">
                  {section.title}
                </div>
              )}
              {section.items.map((item) =>
                item.external ? (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="nav-item"
                    onClick={onNavigate}
                  >
                    <span className="w-[18px] text-center text-xs opacity-70 flex-shrink-0">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                    <span className="ml-auto text-[9px] text-slate-600">↗</span>
                  </a>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item ${isActive(item.href) ? 'nav-item-active' : ''}`}
                    onClick={onNavigate}
                  >
                    <span className="w-[18px] text-center text-xs opacity-70 flex-shrink-0">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                ),
              )}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-border pt-3 px-2 mt-2">
          <button
            onClick={() =>
              fetch('/api/auth/signout', { method: 'POST' }).then(() => {
                window.location.href = '/auth/signin'
              })
            }
            className="text-[11px] text-slate-600 hover:text-slate-400 bg-transparent border-none cursor-pointer transition-colors py-1 block w-full text-left"
          >
            Sign out
          </button>
          <div className="text-[10px] font-mono text-white/10 mt-1">v0.1.0 · Phase 19</div>
        </div>
      </aside>

      <SpotlightSearch
        open={spotlightOpen}
        onClose={() => setSpotlightOpen(false)}
        sections={navSections}
      />
    </>
  )
}
