'use client'

/**
 * Tool Catalog — browsable directory of all tools with tiers, scopes, and capabilities.
 * Agents and humans can discover what's available, what permissions are needed,
 * and whether dry-run is supported.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../../components/db-error-banner'
import { LoadingState } from '../../../../components/ui/loading-state'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { trpc } from '../../../../utils/trpc'

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  safe: { bg: 'bg-neon-green/10 border-neon-green/20', text: 'text-neon-green', label: 'SAFE' },
  privileged: {
    bg: 'bg-neon-yellow/10 border-neon-yellow/20',
    text: 'text-neon-yellow',
    label: 'PRIVILEGED',
  },
  raw: { bg: 'bg-neon-red/10 border-neon-red/20', text: 'text-neon-red', label: 'RAW/ADMIN' },
}

export default function ToolCatalogPage() {
  const [tierFilter, setTierFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const toolsQuery = trpc.sandbox.discoverTools.useQuery(
    tierFilter ? { tier: tierFilter as 'safe' | 'privileged' | 'raw' } : undefined,
    { staleTime: 60_000 },
  )

  const data = toolsQuery.data as
    | {
        totalTools: number
        tierSummary: Record<string, number>
        tools: Array<{
          name: string
          tier: string
          destructive: boolean
          networkAccess: boolean
          fileAccess: boolean
          dryRunnable: boolean
          description: string
        }>
      }
    | undefined

  if (toolsQuery.isLoading) return <LoadingState message="Loading tool catalog..." />
  if (toolsQuery.error) return <DbErrorBanner error={{ message: toolsQuery.error.message }} />

  const tools = (data?.tools ?? []).filter((t) =>
    search
      ? t.name.includes(search) || t.description.toLowerCase().includes(search.toLowerCase())
      : true,
  )

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Tool Catalog"
        subtitle={`${data?.totalTools ?? 0} tools — ${data?.tierSummary?.safe ?? 0} safe, ${data?.tierSummary?.privileged ?? 0} privileged, ${data?.tierSummary?.raw ?? 0} admin`}
      />

      {/* Controls */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Search tools..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="cyber-input flex-1 text-sm px-3 py-2"
        />
        <div className="flex gap-1">
          {[null, 'safe', 'privileged', 'raw'].map((tier) => {
            const active = tierFilter === tier
            return (
              <button
                key={tier ?? 'all'}
                onClick={() => setTierFilter(tier)}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-neon-blue/20 text-neon-blue border-neon-blue/30'
                    : 'bg-bg-card text-slate-400 border-border-dim hover:text-slate-200'
                }`}
              >
                {tier ? tier.toUpperCase() : 'ALL'}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tool Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {tools.map((tool) => {
          const style = TIER_STYLES[tool.tier] ?? TIER_STYLES['privileged']!
          return (
            <div
              key={tool.name}
              className={`p-4 rounded-lg border ${style.bg} hover:brightness-110 transition-all`}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-sm font-mono text-slate-200">{tool.name}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${style.text}`}>
                  {style.label}
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-3">{tool.description}</p>
              <div className="flex gap-2 flex-wrap">
                {tool.destructive && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-neon-red/10 text-neon-red border border-neon-red/20">
                    DESTRUCTIVE
                  </span>
                )}
                {tool.networkAccess && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-neon-blue/10 text-neon-blue border border-neon-blue/20">
                    NETWORK
                  </span>
                )}
                {tool.fileAccess && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-neon-purple/10 text-neon-purple border border-neon-purple/20">
                    FILE I/O
                  </span>
                )}
                {tool.dryRunnable && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-neon-teal/10 text-neon-teal border border-neon-teal/20">
                    DRY-RUN
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {tools.length === 0 && (
        <SectionCard title="No tools found">
          <p className="text-slate-500 text-sm">
            {search ? `No tools matching "${search}"` : 'No tools available for selected tier.'}
          </p>
        </SectionCard>
      )}
    </div>
  )
}
