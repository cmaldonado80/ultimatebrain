'use client'

/**
 * Sidebar — 260px navigation with 24 tabs + Cmd+K spotlight search
 */

import { useState, useEffect, memo } from 'react'

// ── Navigation Structure ────────────────────────────────────────────────

interface NavItem {
  label: string
  href: string
  icon: string
}

interface NavSection {
  title?: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: 'Dashboard', href: '/', icon: '⊞' },
      { label: 'Workspaces', href: '/workspaces', icon: '▦' },
      { label: 'Agents', href: '/agents', icon: '⬡' },
      { label: 'Tickets', href: '/tickets', icon: '▤' },
      { label: 'Projects', href: '/projects', icon: '◈' },
      { label: 'Chat', href: '/chat', icon: '◉' },
      { label: 'Feature Flags', href: '/canvas', icon: '◧' },
    ],
  },
  {
    title: 'Ops Center',
    items: [
      { label: 'Overview', href: '/ops', icon: '◎' },
      { label: 'Traces', href: '/ops/traces', icon: '⋯' },
      { label: 'Evals', href: '/ops/evals', icon: '✓' },
      { label: 'Approvals', href: '/ops/approvals', icon: '⊘' },
      { label: 'Gateway', href: '/ops/gateway', icon: '⇄' },
      { label: 'DLQ', href: '/ops/dlq', icon: '⚠' },
      { label: 'Guardrails', href: '/ops/guardrails', icon: '⛊' },
      { label: 'Checkpoints', href: '/ops/checkpoints', icon: '⟲' },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { label: 'Memory Graph', href: '/memory', icon: '◇' },
      { label: 'Flows', href: '/flows', icon: '⤳' },
      { label: 'Playbooks', href: '/playbooks', icon: '▶' },
      { label: 'QA Recordings', href: '/qa', icon: '⏺' },
    ],
  },
  {
    title: 'Platform',
    items: [
      { label: 'Connected Apps', href: '/apps', icon: '⬢' },
      { label: 'Engines', href: '/engines', icon: '⚙' },
      { label: 'Skills', href: '/skills', icon: '★' },
      { label: 'Integrations', href: '/integrations', icon: '⊕' },
      { label: 'Settings', href: '/settings', icon: '⚿' },
    ],
  },
]

// ── Spotlight Search ────────────────────────────────────────────────────

const SpotlightSearch = memo(function SpotlightSearch({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [query, setQuery] = useState('')

  const allItems = NAV_SECTIONS.flatMap((s) => s.items)
  const filtered = query
    ? allItems.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    : allItems.slice(0, 8)

  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  if (!open) return null

  return (
    <div style={styles.spotlightOverlay} onClick={onClose}>
      <div style={styles.spotlightModal} onClick={(e) => e.stopPropagation()}>
        <input
          style={styles.spotlightInput}
          placeholder="Search pages, agents, tickets..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div style={styles.spotlightResults}>
          {filtered.map((item) => (
            <a key={item.href} href={item.href} style={styles.spotlightItem} onClick={onClose}>
              <span style={styles.spotlightIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </a>
          ))}
          {filtered.length === 0 && (
            <div style={styles.spotlightEmpty}>No results for "{query}"</div>
          )}
        </div>
      </div>
    </div>
  )
})

// ── Sidebar Component ───────────────────────────────────────────────────

export default function Sidebar() {
  const [spotlightOpen, setSpotlightOpen] = useState(false)

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

  return (
    <>
      <aside style={styles.sidebar}>
        {/* Logo */}
        <div style={styles.logo}>
          <span style={styles.logoIcon}>◆</span>
          <span style={styles.logoText}>Solarc Brain</span>
        </div>

        {/* Search trigger */}
        <button style={styles.searchTrigger} onClick={() => setSpotlightOpen(true)}>
          <span style={styles.searchIcon}>⌕</span>
          <span style={styles.searchLabel}>Search</span>
          <span style={styles.searchKbd}>⌘K</span>
        </button>

        {/* Navigation */}
        <nav style={styles.nav}>
          {NAV_SECTIONS.map((section, si) => (
            <div key={si}>
              {section.title && <div style={styles.sectionTitle}>{section.title}</div>}
              {section.items.map((item) => (
                <a key={item.href} href={item.href} style={styles.navItem}>
                  <span style={styles.navIcon}>{item.icon}</span>
                  <span>{item.label}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div style={styles.footer}>
          <a
            href="/api/auth/signout"
            style={{
              fontSize: 12,
              color: '#6b7280',
              textDecoration: 'none',
              cursor: 'pointer',
              display: 'block',
              padding: '6px 0',
            }}
          >
            Sign out
          </a>
          <div style={styles.footerVersion}>v0.1.0 · Phase 18</div>
        </div>
      </aside>

      <SpotlightSearch open={spotlightOpen} onClose={() => setSpotlightOpen(false)} />
    </>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = {
  sidebar: {
    width: 260,
    minHeight: '100vh',
    background: '#0a0f1a',
    borderRight: '1px solid #1f2937',
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '16px 12px',
    fontFamily: 'sans-serif',
    flexShrink: 0,
  },
  logo: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '0 8px' },
  logoIcon: { fontSize: 18, color: '#818cf8' },
  logoText: { fontSize: 15, fontWeight: 700, color: '#f9fafb', letterSpacing: -0.3 },
  searchTrigger: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '7px 10px',
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: 6,
    color: '#6b7280',
    fontSize: 13,
    cursor: 'pointer',
    marginBottom: 16,
  },
  searchIcon: { fontSize: 14 },
  searchLabel: { flex: 1, textAlign: 'left' as const },
  searchKbd: {
    fontSize: 10,
    background: '#1f2937',
    padding: '1px 5px',
    borderRadius: 3,
    color: '#4b5563',
  },
  nav: { flex: 1, overflowY: 'auto' as const },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: '#4b5563',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    padding: '12px 8px 4px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 4,
    fontSize: 13,
    color: '#9ca3af',
    textDecoration: 'none',
    transition: 'background 0.1s',
  },
  navIcon: { width: 18, textAlign: 'center' as const, fontSize: 13, opacity: 0.7 },
  footer: { padding: '12px 8px 0', borderTop: '1px solid #1f2937' },
  footerVersion: { fontSize: 10, color: '#374151' },
  // Spotlight
  spotlightOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    justifyContent: 'center',
    paddingTop: 120,
    zIndex: 300,
  },
  spotlightModal: {
    width: 520,
    maxHeight: 400,
    background: '#1f2937',
    border: '1px solid #374151',
    borderRadius: 10,
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  spotlightInput: {
    width: '100%',
    padding: '14px 16px',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid #374151',
    color: '#f9fafb',
    fontSize: 15,
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  spotlightResults: { overflowY: 'auto' as const, maxHeight: 320, padding: '4px 0' },
  spotlightItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 16px',
    color: '#d1d5db',
    fontSize: 14,
    textDecoration: 'none',
    cursor: 'pointer',
  },
  spotlightIcon: { width: 20, textAlign: 'center' as const, opacity: 0.6 },
  spotlightEmpty: { padding: 16, textAlign: 'center' as const, color: '#6b7280', fontSize: 13 },
}
