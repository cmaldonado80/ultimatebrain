'use client'

/**
 * Memory Graph — explore the brain's tiered memory system.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { OrgBadge } from '../../../components/ui/org-badge'
import { trpc } from '../../../utils/trpc'

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
      <div className="p-6 text-slate-50 flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-500">
          <div className="text-2xl mb-2">Loading...</div>
          <div className="text-[13px]">Fetching memory data</div>
        </div>
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
      <div className="mb-5">
        <div className="flex justify-between items-center">
          <h2 className="m-0 text-[22px] font-bold font-orbitron">
            Memory Graph <OrgBadge />
          </h2>
          <button
            className="cyber-btn-primary text-xs font-semibold"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancel' : '+ Store Memory'}
          </button>
        </div>
        <p className="mt-1 mb-0 text-[13px] text-slate-500">
          Explore the brain's memory tiers — core, recall, and archival — with vector search.
        </p>
      </div>

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
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          {Object.entries(stats).map(([tier, count]) => (
            <div key={tier} className="cyber-card text-center">
              <div className={`text-[22px] font-bold ${TIER_COLORS[tier] || 'text-slate-50'}`}>
                {String(count)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 capitalize">{tier}</div>
            </div>
          ))}
        </div>
      )}

      <input
        className="cyber-input w-full mb-2.5"
        placeholder="Search memories by key or content..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <div className="flex gap-1.5 mb-4">
        <button
          className={
            filterTier === undefined
              ? 'cyber-btn-primary text-xs font-semibold'
              : 'cyber-btn-secondary text-xs'
          }
          onClick={() => setFilterTier(undefined)}
        >
          All
        </button>
        {['core', 'recall', 'archival'].map((t) => (
          <button
            key={t}
            className={
              filterTier === t
                ? 'cyber-btn-primary text-xs font-semibold'
                : 'cyber-btn-secondary text-xs'
            }
            onClick={() => setFilterTier(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {memories.length === 0 ? (
        <div className="text-center text-slate-500 py-10 text-sm">
          No memories found in this tier.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {memories.map((m) => (
            <div key={m.id} className="cyber-card">
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
