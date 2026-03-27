'use client'

/**
 * Live Viewer — real-time presence tracking for users and agents.
 */

import { useState } from 'react'
import { trpc } from '../../../utils/trpc'
import { DbErrorBanner } from '../../../components/db-error-banner'

type FilterType = 'all' | 'user' | 'agent'

export default function LiveViewerPage() {
  const [filter, setFilter] = useState<FilterType>('all')

  const presenceQuery = trpc.presence.getActive.useQuery(undefined, {
    refetchInterval: 5000,
  })

  if (presenceQuery.error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={presenceQuery.error} />
      </div>
    )
  }

  const entries = (presenceQuery.data ?? []) as Array<{
    id: string
    type: 'user' | 'agent'
    name: string
    location: string
    workspaceId?: string
    ticketId?: string
    isExecuting?: boolean
    lastSeen: string | Date
    connectedAt: string | Date
  }>

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.type === filter)
  const userCount = entries.filter((e) => e.type === 'user').length
  const agentCount = entries.filter((e) => e.type === 'agent').length

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-orbitron text-neon-teal">Live Viewer</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time presence &mdash; {entries.length} active ({userCount} users, {agentCount}{' '}
            agents)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="neon-dot-green animate-pulse" />
          <span className="text-xs text-slate-500">Auto-refresh 5s</span>
        </div>
      </div>

      {/* Filter buttons */}
      <div className="flex gap-2">
        {(['all', 'user', 'agent'] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`cyber-btn-secondary text-xs px-3 py-1.5 ${
              filter === f ? 'ring-1 ring-neon-teal text-neon-teal' : ''
            }`}
          >
            {f === 'all'
              ? `All (${entries.length})`
              : f === 'user'
                ? `Users (${userCount})`
                : `Agents (${agentCount})`}
          </button>
        ))}
      </div>

      {/* Presence table */}
      {presenceQuery.isLoading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="text-lg font-orbitron text-slate-500">Scanning presence...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="cyber-card p-8 text-center text-slate-500">
          No active {filter === 'all' ? 'entries' : filter + 's'} right now.
        </div>
      ) : (
        <div className="cyber-table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-dim text-left text-xs text-slate-500 uppercase tracking-wider">
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Location</th>
                <th className="pb-2 pr-4">Workspace</th>
                <th className="pb-2 pr-4">Ticket</th>
                <th className="pb-2">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const isExecuting = entry.type === 'agent' && entry.isExecuting
                return (
                  <tr
                    key={entry.id}
                    className="border-b border-border-dim/30 hover:bg-bg-elevated/50"
                  >
                    <td className="py-2 pr-4">
                      <div
                        className={`w-2.5 h-2.5 rounded-full ${
                          isExecuting ? 'bg-neon-green animate-pulse' : 'bg-neon-teal'
                        }`}
                      />
                    </td>
                    <td className="py-2 pr-4 font-medium text-slate-200">{entry.name}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`cyber-badge text-xs ${
                          entry.type === 'agent'
                            ? 'bg-violet-500/20 text-violet-300'
                            : 'bg-sky-500/20 text-sky-300'
                        }`}
                      >
                        {entry.type}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-slate-400 font-mono text-xs">{entry.location}</td>
                    <td className="py-2 pr-4 text-slate-500 text-xs">
                      {entry.workspaceId ? entry.workspaceId.slice(0, 8) + '...' : '—'}
                    </td>
                    <td className="py-2 pr-4 text-slate-500 text-xs">
                      {entry.ticketId ? entry.ticketId.slice(0, 8) + '...' : '—'}
                    </td>
                    <td className="py-2 text-slate-500 text-xs">
                      {formatTimestamp(entry.lastSeen)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function formatTimestamp(ts: string | Date): string {
  try {
    const d = typeof ts === 'string' ? new Date(ts) : ts
    const now = Date.now()
    const diff = now - d.getTime()
    if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`
    if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
    return d.toLocaleTimeString()
  } catch {
    return '—'
  }
}
