'use client'

/**
 * AITMPL Marketplace — discover, scan, and install components.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { trpc } from '../../../utils/trpc'

type Category = 'agents' | 'skills' | 'commands' | 'hooks' | 'mcps' | 'settings'

export default function AitmplPage() {
  const [activeTab, setActiveTab] = useState<Category>('agents')
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const preInstalledQuery = trpc.aitmpl.preInstalled.useQuery()
  const browseQuery = trpc.aitmpl.browse.useQuery({ category: activeTab })

  const syncMut = trpc.aitmpl.syncCatalog.useMutation({
    onSuccess: () => {
      showAction('Catalog synced successfully')
    },
    onError: (err) => showAction(`Sync failed: ${err.message}`),
  })

  const installMut = trpc.aitmpl.install.useMutation({
    onSuccess: () => showAction('Component installed'),
    onError: (err) => showAction(`Install failed: ${err.message}`),
  })

  const scanMut = trpc.aitmpl.scan.useMutation({
    onSuccess: (data) => {
      const result = data as { safe?: boolean; issues?: string[]; error?: string }
      if (result.error) {
        showAction(`Scan error: ${result.error}`)
      } else {
        showAction(
          result.safe
            ? 'Scan passed — safe to install'
            : `Scan found issues: ${result.issues?.join(', ')}`,
        )
      }
    },
  })

  function showAction(msg: string) {
    setActionMsg(msg)
    setTimeout(() => setActionMsg(null), 6000)
  }

  if (preInstalledQuery.error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={preInstalledQuery.error} />
      </div>
    )
  }

  const catalog = preInstalledQuery.data as {
    agents: Array<{ name: string; description: string; trustScore?: number; source?: string }>
    skills: Array<{ name: string; description: string; enabled?: boolean }>
    commands: Array<{ name: string; description: string; trigger?: string }>
    hooks: Array<{ event: string; action: string; enabled?: boolean }>
    mcps: Array<{ name: string; description: string; installMode?: string; enabled?: boolean }>
    totals: {
      agents: number
      skills: number
      commands: number
      hooks: number
      mcps: number
      total: number
    }
  } | null

  const browseResults = (browseQuery.data ?? []) as Array<{
    name: string
    description: string
    category?: string
  }>

  const tabs: { key: Category; label: string; count: number }[] = [
    { key: 'agents', label: 'Agents', count: catalog?.totals.agents ?? 0 },
    { key: 'skills', label: 'Skills', count: catalog?.totals.skills ?? 0 },
    { key: 'commands', label: 'Commands', count: catalog?.totals.commands ?? 0 },
    { key: 'hooks', label: 'Hooks', count: catalog?.totals.hooks ?? 0 },
    { key: 'mcps', label: 'MCPs', count: catalog?.totals.mcps ?? 0 },
  ]

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-orbitron text-neon-teal">Component Marketplace</h1>
          <p className="text-sm text-slate-400 mt-1">
            AITMPL components &mdash; {catalog?.totals.total ?? 0} pre-installed
          </p>
        </div>
        <button
          className="cyber-btn-secondary text-sm px-3 py-1.5"
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending}
        >
          {syncMut.isPending ? 'Syncing...' : 'Sync Catalog'}
        </button>
      </div>

      {actionMsg && (
        <div className="cyber-card border-neon-teal/40 bg-neon-teal/5 px-4 py-2 text-sm text-neon-teal">
          {actionMsg}
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`cyber-btn-secondary text-xs px-3 py-1.5 ${
              activeTab === tab.key ? 'ring-1 ring-neon-teal text-neon-teal' : ''
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Pre-installed components for active tab */}
      {preInstalledQuery.isLoading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="text-lg font-orbitron text-slate-500">Loading catalog...</div>
        </div>
      ) : (
        <div>
          <h2 className="text-sm font-orbitron text-slate-400 mb-3">Pre-installed</h2>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {activeTab === 'agents' &&
              catalog?.agents.map((a) => (
                <div key={a.name} className="cyber-card p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-slate-200 text-sm">{a.name}</span>
                    {a.trustScore != null && (
                      <span className="text-xs text-neon-teal">
                        {(a.trustScore * 100).toFixed(0)}% trust
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">{a.description}</p>
                  {a.source && (
                    <span className="text-xs text-slate-500 mt-1 inline-block">{a.source}</span>
                  )}
                </div>
              ))}
            {activeTab === 'skills' &&
              catalog?.skills.map((s) => (
                <div key={s.name} className="cyber-card p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-slate-200 text-sm">{s.name}</span>
                    <span className={`text-xs ${s.enabled ? 'text-neon-green' : 'text-slate-500'}`}>
                      {s.enabled ? 'enabled' : 'disabled'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{s.description}</p>
                </div>
              ))}
            {activeTab === 'commands' &&
              catalog?.commands.map((c) => (
                <div key={c.name} className="cyber-card p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-xs text-neon-teal bg-bg-deep px-1.5 py-0.5 rounded">
                      {c.trigger}
                    </code>
                    <span className="font-medium text-slate-200 text-sm">{c.name}</span>
                  </div>
                  <p className="text-xs text-slate-400">{c.description}</p>
                </div>
              ))}
            {activeTab === 'hooks' &&
              catalog?.hooks.map((h, i) => (
                <div key={i} className="cyber-card p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-slate-200 text-sm">{h.event}</span>
                    <span className={`text-xs ${h.enabled ? 'text-neon-green' : 'text-slate-500'}`}>
                      {h.enabled ? 'active' : 'inactive'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{h.action}</p>
                </div>
              ))}
            {activeTab === 'mcps' &&
              catalog?.mcps.map((m) => (
                <div key={m.name} className="cyber-card p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-slate-200 text-sm">{m.name}</span>
                    <span
                      className={`cyber-badge text-xs ${
                        m.installMode === 'pre-installed'
                          ? 'bg-neon-green/20 text-neon-green'
                          : 'bg-sky-500/20 text-sky-300'
                      }`}
                    >
                      {m.installMode}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{m.description}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Browse marketplace */}
      {browseResults.length > 0 && (
        <div>
          <h2 className="text-sm font-orbitron text-slate-400 mb-3">Marketplace ({activeTab})</h2>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {browseResults.map((item) => (
              <div key={item.name} className="cyber-card p-3">
                <div className="font-medium text-slate-200 text-sm mb-1">{item.name}</div>
                <p className="text-xs text-slate-400 mb-2">{item.description}</p>
                <div className="flex gap-2">
                  <button
                    className="cyber-btn-secondary text-xs px-2 py-1"
                    onClick={() => scanMut.mutate({ name: item.name, category: activeTab })}
                    disabled={scanMut.isPending}
                  >
                    Scan
                  </button>
                  <button
                    className="cyber-btn-primary text-xs px-2 py-1"
                    onClick={() => installMut.mutate({ name: item.name, category: activeTab })}
                    disabled={installMut.isPending}
                  >
                    Install
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
