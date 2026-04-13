'use client'

/**
 * Memory Graph — explore the brain's tiered memory system.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { EmptyState } from '../../../components/ui/empty-state'
import { FilterPills } from '../../../components/ui/filter-pills'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatCard } from '../../../components/ui/stat-card'
import { trpc } from '../../../lib/trpc'

interface Memory {
  id: string
  key: string
  content: string
  source: string | null
  confidence: number | null
  workspaceId: string | null
  tier: string
  createdAt: Date
  updatedAt: Date | null
}

const TIER_COLORS: Record<string, string> = {
  core: 'text-neon-purple',
  recall: 'text-neon-green',
  archival: 'text-slate-500',
}

export default function MemoryPage() {
  const [filterTier, setFilterTier] = useState<string | undefined>(undefined)
  const [searchQuery, setSearchQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [memKey, setMemKey] = useState('')
  const [memContent, setMemContent] = useState('')
  const [memTier, setMemTier] = useState<'core' | 'recall' | 'archival'>('recall')
  const listQuery = trpc.memory.list.useQuery(
    filterTier ? { tier: filterTier as 'core' | 'recall' | 'archival' } : undefined,
  )
  const statsQuery = trpc.memory.tierStats.useQuery()
  const utils = trpc.useUtils()
  const storeMut = trpc.memory.store.useMutation({
    onSuccess: () => {
      utils.memory.list.invalidate()
      utils.memory.tierStats.invalidate()
      setShowForm(false)
      setMemKey('')
      setMemContent('')
    },
  })

  const error = listQuery.error || statsQuery.error

  if (error) {
    return (
      <div className="p-6 text-slate-50">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  const isLoading = listQuery.isLoading || statsQuery.isLoading

  if (isLoading) {
    return (
      <div className="p-6 text-slate-50">
        <LoadingState message="Loading memory data..." />
      </div>
    )
  }

  const allMemories: Memory[] = (listQuery.data as Memory[]) ?? []
  const memories = searchQuery
    ? allMemories.filter(
        (m) =>
          m.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.content.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : allMemories
  const stats = statsQuery.data as Record<string, number> | undefined

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Memory Graph"
        subtitle="Explore the brain's memory tiers — core, recall, and archival — with vector search."
        actions={
          <button
            className="cyber-btn-primary text-xs font-semibold"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancel' : '+ Store Memory'}
          </button>
        }
      />

      {showForm && (
        <div className="cyber-card mb-4">
          <div className="flex flex-col gap-2">
            <input
              className="cyber-input"
              placeholder="Memory key (e.g. project.architecture)..."
              value={memKey}
              onChange={(e) => setMemKey(e.target.value)}
            />
            <textarea
              className="cyber-input min-h-[80px] resize-y"
              placeholder="Memory content..."
              value={memContent}
              onChange={(e) => setMemContent(e.target.value)}
            />
            <div className="flex gap-2 items-center">
              <select
                className="cyber-select"
                value={memTier}
                onChange={(e) => setMemTier(e.target.value as 'core' | 'recall' | 'archival')}
              >
                <option value="core">Core</option>
                <option value="recall">Recall</option>
                <option value="archival">Archival</option>
              </select>
              <button
                className="cyber-btn-primary text-xs font-semibold"
                onClick={() =>
                  memKey.trim() &&
                  memContent.trim() &&
                  storeMut.mutate({ key: memKey.trim(), content: memContent.trim(), tier: memTier })
                }
                disabled={storeMut.isPending || !memKey.trim() || !memContent.trim()}
              >
                {storeMut.isPending ? 'Storing...' : 'Store'}
              </button>
              {storeMut.error && (
                <span className="text-neon-red text-[11px]">{storeMut.error.message}</span>
              )}
            </div>
          </div>
        </div>
      )}
      {stats && (
        <PageGrid cols="3" className="mb-4">
          {Object.entries(stats).map(([tier, count]) => (
            <StatCard
              key={tier}
              label={tier}
              value={count}
              color={tier === 'core' ? 'purple' : tier === 'recall' ? 'green' : 'slate'}
            />
          ))}
        </PageGrid>
      )}

      <input
        className="cyber-input w-full mb-2.5"
        placeholder="Search memories by key or content..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <FilterPills
        options={['all', 'core', 'recall', 'archival'] as const}
        value={filterTier ?? 'all'}
        onChange={(v) => setFilterTier(v === 'all' ? undefined : v)}
        className="mb-4"
      />

      {memories.length === 0 ? (
        <EmptyState title="No memories found" message="No memories found in this tier." />
      ) : (
        <div className="flex flex-col gap-2">
          {memories.map((m) => (
            <SectionCard key={m.id} variant="intelligence" padding="md">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[13px] font-bold font-mono flex-1">{m.key}</span>
                <span
                  className={`text-[10px] font-semibold ${TIER_COLORS[m.tier] || 'text-slate-500'}`}
                >
                  {m.tier}
                </span>
                {m.confidence != null && (
                  <span className="text-[10px] text-slate-500">
                    {(m.confidence * 100).toFixed(0)}%
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-300 leading-relaxed mb-1.5">{m.content}</div>
              <div className="flex gap-4 text-[10px] text-slate-600 font-mono">
                <span>ID: {m.id.slice(0, 8)}</span>
                {m.source && <span>Source: {m.source.slice(0, 8)}</span>}
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  )
}
