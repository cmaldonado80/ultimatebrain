'use client'

/**
 * Command Palette — Cmd+K global search across the corporation.
 *
 * Searches: agents, departments, tickets, projects, products, pages.
 * Keyboard shortcut: Cmd+K (Mac) or Ctrl+K (Windows/Linux).
 */

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

// ── Static pages to search ──────────────────────────────────────────

const PAGES: SearchResult[] = [
  { name: 'CEO Dashboard', href: '/ceo', category: 'page' },
  { name: 'Org Chart', href: '/org-chart', category: 'page' },
  { name: 'Chat', href: '/chat', category: 'page' },
  { name: 'Agents', href: '/agents', category: 'page' },
  { name: 'Tickets', href: '/tickets', category: 'page' },
  { name: 'Projects', href: '/projects', category: 'page' },
  { name: 'Products', href: '/products', category: 'page' },
  { name: 'Department Manager', href: '/mini-brain-factory', category: 'page' },
  { name: 'Routines', href: '/routines', category: 'page' },
  { name: 'Work Products', href: '/work-products', category: 'page' },
  { name: 'Trajectory Replay', href: '/trajectory', category: 'page' },
  { name: 'Guardrails', href: '/guardrails', category: 'page' },
  { name: 'Agent Inbox', href: '/inbox', category: 'page' },
  { name: 'Memory', href: '/memory', category: 'page' },
  { name: 'Topology', href: '/topology', category: 'page' },
  { name: 'Settings', href: '/settings', category: 'page' },
  { name: 'Skills', href: '/skills', category: 'page' },
  { name: 'Flows', href: '/flows', category: 'page' },
  { name: 'Playbooks', href: '/playbooks', category: 'page' },
  { name: 'Model Registry', href: '/model-registry', category: 'page' },
  { name: 'Secrets', href: '/secrets', category: 'page' },
  { name: 'Integrations', href: '/integrations', category: 'page' },
]

interface SearchResult {
  name: string
  href: string
  category: 'page' | 'agent' | 'department' | 'product'
}

// ── Component ───────────────────────────────────────────────────────

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setSelectedIndex(0)
    }
  }, [open])

  // Filter results
  const results: SearchResult[] =
    query.length > 0
      ? PAGES.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 15)
      : PAGES.slice(0, 10)

  // Navigation
  const navigate = useCallback(
    (result: SearchResult) => {
      router.push(result.href)
      setOpen(false)
    },
    [router],
  )

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        navigate(results[selectedIndex])
      }
    },
    [results, selectedIndex, navigate],
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />

      {/* Palette */}
      <div className="relative w-full max-w-lg bg-bg-surface border border-border-dim rounded-lg shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-dim">
          <span className="text-slate-500 text-sm">⌘</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, agents, departments..."
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 focus:outline-none"
          />
          <kbd className="text-[9px] text-slate-600 bg-bg-deep px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-slate-600">
              No results for &quot;{query}&quot;
            </div>
          ) : (
            results.map((result, i) => (
              <button
                key={result.href}
                onClick={() => navigate(result)}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                  i === selectedIndex
                    ? 'bg-neon-teal/10 text-neon-teal'
                    : 'text-slate-300 hover:bg-bg-elevated'
                }`}
              >
                <span className="text-[10px] text-slate-600 w-16">{result.category}</span>
                <span className="text-sm flex-1">{result.name}</span>
                <span className="text-[9px] text-slate-600">{result.href}</span>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border-dim flex gap-3 text-[9px] text-slate-600">
          <span>↑↓ Navigate</span>
          <span>↵ Open</span>
          <span>ESC Close</span>
        </div>
      </div>
    </div>
  )
}
