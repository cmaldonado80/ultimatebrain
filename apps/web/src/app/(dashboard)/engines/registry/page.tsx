'use client'

/**
 * Engine Registry — browse, register, and manage brain engines.
 * System engines (core), Domain engines (from templates), Custom engines (user-defined).
 */

import { useState } from 'react'
import { trpc } from '../../../../utils/trpc'
import { DbErrorBanner } from '../../../../components/db-error-banner'

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
      <div style={styles.page}>
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (enginesQuery.isLoading) {
    return (
      <div
        style={{
          ...styles.page,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
        }}
      >
        <div style={{ textAlign: 'center', color: '#6b7280' }}>Loading engines...</div>
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
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={styles.title}>Engine Registry</h2>
          <button style={styles.btnPrimary} onClick={() => setShowRegister(!showRegister)}>
            {showRegister ? 'Cancel' : '+ Register Engine'}
          </button>
        </div>
        <p style={styles.subtitle}>Browse and manage brain engines — system, domain, and custom.</p>
      </div>

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            ...styles.statCard,
            cursor: 'pointer',
            border: filter === 'all' ? '2px solid #818cf8' : '1px solid #374151',
          }}
          onClick={() => setFilter('all')}
        >
          <div style={styles.statValue}>{allEngines.length}</div>
          <div style={styles.statLabel}>All Engines</div>
        </div>
        <div
          style={{
            ...styles.statCard,
            cursor: 'pointer',
            border: filter === 'system' ? '2px solid #818cf8' : '1px solid #374151',
          }}
          onClick={() => setFilter('system')}
        >
          <div style={{ ...styles.statValue, color: CATEGORY_COLORS.system }}>{systemCount}</div>
          <div style={styles.statLabel}>System</div>
        </div>
        <div
          style={{
            ...styles.statCard,
            cursor: 'pointer',
            border: filter === 'domain' ? '2px solid #22c55e' : '1px solid #374151',
          }}
          onClick={() => setFilter('domain')}
        >
          <div style={{ ...styles.statValue, color: CATEGORY_COLORS.domain }}>{domainCount}</div>
          <div style={styles.statLabel}>Domain</div>
        </div>
        <div
          style={{
            ...styles.statCard,
            cursor: 'pointer',
            border: filter === 'custom' ? '2px solid #eab308' : '1px solid #374151',
          }}
          onClick={() => setFilter('custom')}
        >
          <div style={{ ...styles.statValue, color: CATEGORY_COLORS.custom }}>{customCount}</div>
          <div style={styles.statLabel}>Custom</div>
        </div>
      </div>

      {/* Register Form */}
      {showRegister && (
        <div style={styles.formCard}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ ...styles.input, flex: 1 }}
                placeholder="Engine ID (e.g., my-engine)..."
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
              <input
                style={{ ...styles.input, flex: 1 }}
                placeholder="Display name..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ ...styles.input, flex: 2 }}
                placeholder="Description..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
              <input
                style={{ ...styles.input, flex: 1 }}
                placeholder="Domain (optional)..."
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
              />
            </div>
            <button
              style={styles.btnCreate}
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
              <div style={{ color: '#fca5a5', fontSize: 11 }}>{registerMut.error.message}</div>
            )}
          </div>
        </div>
      )}

      {/* Engine Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 10,
        }}
      >
        {engines.map((engine) => {
          const catColor = CATEGORY_COLORS[engine.category] ?? '#6b7280'
          const statusColor = STATUS_COLORS[engine.status] ?? '#6b7280'
          return (
            <div key={engine.id} style={styles.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: statusColor,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{engine.name}</span>
                <span
                  style={{
                    fontSize: 9,
                    background: catColor + '20',
                    color: catColor,
                    padding: '1px 6px',
                    borderRadius: 3,
                    fontWeight: 600,
                  }}
                >
                  {engine.category}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6, lineHeight: 1.4 }}>
                {engine.description}
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#4b5563' }}>
                {engine.domain && <span>Domain: {engine.domain}</span>}
                <span>Status: {engine.status}</span>
                {engine.totalRequests > 0 && <span>{engine.totalRequests} reqs</span>}
                {engine.avgResponseMs > 0 && <span>{Math.round(engine.avgResponseMs)}ms avg</span>}
              </div>
              {engine.connectedApps.length > 0 && (
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>
                  Connected: {engine.connectedApps.length} apps
                </div>
              )}
            </div>
          )
        })}
      </div>

      {engines.length === 0 && (
        <div style={{ textAlign: 'center' as const, color: '#6b7280', padding: 40, fontSize: 14 }}>
          No engines found for this filter.
        </div>
      )}
    </div>
  )
}

const styles = {
  page: { padding: 24, fontFamily: 'sans-serif', color: '#f9fafb' },
  header: { marginBottom: 20 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  statCard: { background: '#1f2937', borderRadius: 8, padding: 14, textAlign: 'center' as const },
  statValue: { fontSize: 20, fontWeight: 700 },
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  formCard: {
    background: '#1f2937',
    borderRadius: 8,
    padding: 16,
    border: '1px solid #374151',
    marginBottom: 16,
  },
  input: {
    background: '#111827',
    color: '#f9fafb',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 13,
  },
  btnPrimary: {
    background: '#818cf8',
    color: '#f9fafb',
    border: 'none',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnCreate: {
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  card: { background: '#1f2937', borderRadius: 8, padding: 12, border: '1px solid #374151' },
}
