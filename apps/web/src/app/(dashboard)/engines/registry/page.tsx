'use client'

/**
 * Engine Registry — browse, register, and manage brain engines.
 * System engines (core), Domain engines (from templates), Custom engines (user-defined).
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../../components/db-error-banner'
import { OrgBadge } from '../../../../components/ui/org-badge'
import { trpc } from '../../../../utils/trpc'

interface Engine {
  id: string
  name: string
  description: string
  status: string
  category: string
  domain?: string
  connectedApps: string[]
  totalRequests: number
  avgResponseMs: number
  errorRate: number
}

const CATEGORY_COLORS: Record<string, string> = {
  system: '#818cf8',
  domain: '#22c55e',
  custom: '#eab308',
}

const STATUS_COLORS: Record<string, string> = {
  healthy: '#22c55e',
  degraded: '#f97316',
  down: '#ef4444',
  unknown: '#6b7280',
}

export default function EngineRegistryPage() {
  const [filter, setFilter] = useState<string>('all')
  const [showRegister, setShowRegister] = useState(false)
  const [newId, setNewId] = useState('')
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newDomain, setNewDomain] = useState('')

  const enginesQuery = trpc.engineRegistry.list.useQuery()
  const utils = trpc.useUtils()
  const registerMut = trpc.engineRegistry.registerEngine.useMutation({
    onSuccess: () => {
      utils.engineRegistry.list.invalidate()
      setShowRegister(false)
      setNewId('')
      setNewName('')
      setNewDesc('')
      setNewDomain('')
    },
  })

  const error = enginesQuery.error
  if (error) {
    return (
      <div className="p-6 font-sans text-neon-text">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (enginesQuery.isLoading) {
    return (
      <div className="p-6 font-sans text-neon-text flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-500">Loading engines...</div>
      </div>
    )
  }

  const allEngines = (enginesQuery.data ?? []) as Engine[]
  const engines = filter === 'all' ? allEngines : allEngines.filter((e) => e.category === filter)

  const systemCount = allEngines.filter((e) => e.category === 'system').length
  const domainCount = allEngines.filter((e) => e.category === 'domain').length
  const customCount = allEngines.filter((e) => e.category === 'custom').length

  // Group domain engines by domain
  const domainGroups = new Map<string, Engine[]>()
  for (const e of engines.filter((e) => e.category === 'domain')) {
    const d = e.domain ?? 'Other'
    ;(
      domainGroups.get(d) ??
      (() => {
        const a: Engine[] = []
        domainGroups.set(d, a)
        return a
      })()
    ).push(e)
  }

  return (
    <div className="p-6 font-sans text-neon-text">
      <div className="mb-5">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="m-0 text-[22px] font-bold font-orbitron">Engine Registry</h2>
            <OrgBadge />
          </div>
          <button className="cyber-btn-primary" onClick={() => setShowRegister(!showRegister)}>
            {showRegister ? 'Cancel' : '+ Register Engine'}
          </button>
        </div>
        <p className="mt-1 mb-0 text-[13px] text-slate-500">
          Browse and manage brain engines — system, domain, and custom.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2.5 mb-4">
        <div
          className={`cyber-card text-center cursor-pointer ${filter === 'all' ? 'border-2 border-indigo-400' : 'border border-border-dim'}`}
          onClick={() => setFilter('all')}
        >
          <div className="text-xl font-bold">{allEngines.length}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">All Engines</div>
        </div>
        <div
          className={`cyber-card text-center cursor-pointer ${filter === 'system' ? 'border-2 border-indigo-400' : 'border border-border-dim'}`}
          onClick={() => setFilter('system')}
        >
          <div className="text-xl font-bold text-neon-indigo">{systemCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">System</div>
        </div>
        <div
          className={`cyber-card text-center cursor-pointer ${filter === 'domain' ? 'border-2 border-green-500' : 'border border-border-dim'}`}
          onClick={() => setFilter('domain')}
        >
          <div className="text-xl font-bold text-neon-green">{domainCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Domain</div>
        </div>
        <div
          className={`cyber-card text-center cursor-pointer ${filter === 'custom' ? 'border-2 border-yellow-500' : 'border border-border-dim'}`}
          onClick={() => setFilter('custom')}
        >
          <div className="text-xl font-bold text-neon-yellow">{customCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Custom</div>
        </div>
      </div>

      {/* Register Form */}
      {showRegister && (
        <div className="cyber-card border border-border-dim mb-4 p-4">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                className="cyber-input flex-1"
                placeholder="Engine ID (e.g., my-engine)..."
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
              <input
                className="cyber-input flex-1"
                placeholder="Display name..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <input
                className="cyber-input flex-[2]"
                placeholder="Description..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
              <input
                className="cyber-input flex-1"
                placeholder="Domain (optional)..."
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
              />
            </div>
            <button
              className="cyber-btn-primary bg-green-500 hover:bg-green-600"
              onClick={() =>
                newId.trim() &&
                newName.trim() &&
                registerMut.mutate({
                  id: newId.trim(),
                  name: newName.trim(),
                  description: newDesc.trim(),
                  domain: newDomain.trim() || undefined,
                })
              }
              disabled={registerMut.isPending || !newId.trim() || !newName.trim()}
            >
              {registerMut.isPending ? 'Registering...' : 'Register Engine'}
            </button>
            {registerMut.error && (
              <div className="text-red-300 text-[11px]">{registerMut.error.message}</div>
            )}
          </div>
        </div>
      )}

      {/* Engine Grid */}
      <div className="cyber-grid">
        {engines.map((engine) => {
          const catColor = CATEGORY_COLORS[engine.category] ?? '#6b7280'
          const statusColor = STATUS_COLORS[engine.status] ?? '#6b7280'
          return (
            <a
              key={engine.id}
              href={`/engines/registry/${engine.id}`}
              className="cyber-card border border-border-dim no-underline block cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: statusColor }}
                />
                <span className="font-bold text-[13px] flex-1">{engine.name}</span>
                <span
                  className="cyber-badge text-[9px] font-semibold"
                  style={{ background: catColor + '20', color: catColor }}
                >
                  {engine.category}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mb-1.5 leading-snug">
                {engine.description}
              </div>
              <div className="flex gap-3 text-[10px] text-slate-600">
                {engine.domain && <span>Domain: {engine.domain}</span>}
                <span>Status: {engine.status}</span>
                {engine.totalRequests > 0 && <span>{engine.totalRequests} reqs</span>}
                {engine.avgResponseMs > 0 && <span>{Math.round(engine.avgResponseMs)}ms avg</span>}
              </div>
              {engine.connectedApps.length > 0 && (
                <div className="text-[10px] text-slate-500 mt-1">
                  Connected: {engine.connectedApps.length} apps
                </div>
              )}
            </a>
          )
        })}
      </div>

      {engines.length === 0 && (
        <div className="text-center text-slate-500 p-10 text-sm">
          No engines found for this filter.
        </div>
      )}
    </div>
  )
}
