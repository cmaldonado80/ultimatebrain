'use client'

/**
 * Live Viewer — real-time presence tracking for users and agents.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { EmptyState } from '../../../components/ui/empty-state'
import { FilterPills } from '../../../components/ui/filter-pills'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { trpc } from '../../../utils/trpc'

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

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Live Viewer" live />

      <FilterPills
        options={['all', 'user', 'agent'] as const}
        value={filter}
        onChange={setFilter}
        labels={{ all: 'All', user: 'Users', agent: 'Agents' }}
        className="mb-4"
      />

      {/* Presence table */}
      {presenceQuery.isLoading ? (
        <LoadingState message="Scanning presence..." />
      ) : filtered.length === 0 ? (
        <EmptyState title="No active entries right now" />
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
