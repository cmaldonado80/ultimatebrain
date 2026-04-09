'use client'

/**
 * Gateway — LLM cost governance, budget controls, model analytics,
 * and per-agent spend tracking.
 */

import { useState } from 'react'

import { LoadingState } from '../../../../components/ui/loading-state'
import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

const REFRESH = 30_000

export default function GatewayPage() {
  const providersQuery = trpc.gateway.listProviders.useQuery(undefined, {
    refetchInterval: REFRESH,
  })
  const costQuery = trpc.gateway.costSummary.useQuery(undefined, { refetchInterval: REFRESH })
  const pricingQuery = trpc.gateway.pricing.useQuery()
  const agentsQuery = trpc.agents.list.useQuery({ limit: 100, offset: 0 })
  const utils = trpc.useUtils()

  // Budget form state
  const [budgetAgentId, setBudgetAgentId] = useState('')
  const [budgetSoft, setBudgetSoft] = useState('50')
  const [budgetHard, setBudgetHard] = useState('100')
  const [budgetPeriod, setBudgetPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily')

  const setBudgetMut = trpc.gateway.setBudget.useMutation({
    onSuccess: () => {
      utils.gateway.costSummary.invalidate()
      setBudgetAgentId('')
    },
  })

  if (providersQuery.isLoading) return <LoadingState message="Loading Gateway..." />

  const providers = (providersQuery.data ?? []) as Array<{
    provider: string
    createdAt: Date
  }>

  const cost = costQuery.data as {
    totalCostUsd: number
    totalTokensIn: number
    totalTokensOut: number
    totalCalls: number
    avgLatencyMs: number
    cacheHitRate: number
    byProvider: Array<{ provider: string; cost: number; tokens: number; count: number }>
    byModel: Array<{ model: string; cost: number; tokens: number; count: number }>
    topAgents: Array<{
      agentId: string
      agentName: string
      cost: number
      tokens: number
      count: number
    }>
  } | null

  const agentsList = (agentsQuery.data ?? []) as Array<{
    id: string
    name: string
  }>

  const pricing = (pricingQuery.data ?? {}) as Record<string, { input: number; output: number }>

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Gateway & Cost Governance"
        subtitle="LLM routing, budget controls, model analytics, and per-agent spend tracking"
      />

      {/* Top-level stats */}
      <PageGrid cols="4" className="mb-6">
        <StatCard
          label="Total Spend"
          value={`$${(cost?.totalCostUsd ?? 0).toFixed(2)}`}
          color="yellow"
          sub="all providers"
        />
        <StatCard
          label="Total Calls"
          value={cost?.totalCalls ?? 0}
          color="blue"
          sub={`${(cost?.totalTokensIn ?? 0) + (cost?.totalTokensOut ?? 0) > 1000 ? `${(((cost?.totalTokensIn ?? 0) + (cost?.totalTokensOut ?? 0)) / 1000).toFixed(0)}k tokens` : `${(cost?.totalTokensIn ?? 0) + (cost?.totalTokensOut ?? 0)} tokens`}`}
        />
        <StatCard
          label="Avg Latency"
          value={cost?.avgLatencyMs ? `${cost.avgLatencyMs}ms` : '—'}
          color="purple"
          sub="per request"
        />
        <StatCard
          label="Cache Hit"
          value={cost?.cacheHitRate != null ? `${cost.cacheHitRate}%` : '—'}
          color={
            cost?.cacheHitRate && cost.cacheHitRate > 30
              ? 'green'
              : cost?.cacheHitRate && cost.cacheHitRate > 10
                ? 'yellow'
                : 'slate'
          }
          sub="semantic cache"
        />
      </PageGrid>

      {/* Budget Configuration */}
      <SectionCard title="Set Agent Budget" className="mb-6">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="w-56">
            <label className="text-[10px] text-slate-500 block mb-1">Agent</label>
            <select
              className="cyber-input cyber-input-sm w-full"
              value={budgetAgentId}
              onChange={(e) => setBudgetAgentId(e.target.value)}
            >
              <option value="">Select agent...</option>
              {agentsList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-28">
            <label className="text-[10px] text-slate-500 block mb-1">Soft Limit ($)</label>
            <input
              className="cyber-input cyber-input-sm w-full"
              type="number"
              placeholder="50"
              value={budgetSoft}
              onChange={(e) => setBudgetSoft(e.target.value)}
            />
          </div>
          <div className="w-28">
            <label className="text-[10px] text-slate-500 block mb-1">Hard Limit ($)</label>
            <input
              className="cyber-input cyber-input-sm w-full"
              type="number"
              placeholder="100"
              value={budgetHard}
              onChange={(e) => setBudgetHard(e.target.value)}
            />
          </div>
          <div className="w-32">
            <label className="text-[10px] text-slate-500 block mb-1">Period</label>
            <select
              className="cyber-input cyber-input-sm w-full"
              value={budgetPeriod}
              onChange={(e) => setBudgetPeriod(e.target.value as 'daily' | 'weekly' | 'monthly')}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <button
            className="cyber-btn-primary cyber-btn-sm flex-shrink-0"
            disabled={!budgetAgentId || setBudgetMut.isPending}
            onClick={() =>
              setBudgetMut.mutate({
                agentId: budgetAgentId,
                softLimitUsd: parseFloat(budgetSoft) || 50,
                hardLimitUsd: parseFloat(budgetHard) || 100,
                period: budgetPeriod,
              })
            }
          >
            {setBudgetMut.isPending ? 'Setting...' : 'Set Budget'}
          </button>
        </div>
        <div className="text-[10px] text-slate-600 mt-2">
          Soft limit triggers a warning notification. Hard limit blocks further LLM requests for the
          agent until the budget period resets.
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Cost by Provider */}
        <SectionCard title="Cost by Provider">
          {!cost?.byProvider?.length ? (
            <div className="text-xs text-slate-600 py-6 text-center">No usage data yet.</div>
          ) : (
            <div className="space-y-1.5">
              {cost.byProvider
                .sort((a, b) => b.cost - a.cost)
                .map((bp) => {
                  const pct =
                    cost.totalCostUsd > 0 ? Math.round((bp.cost / cost.totalCostUsd) * 100) : 0
                  return (
                    <div
                      key={bp.provider}
                      className="bg-bg-deep rounded px-3 py-2.5 border border-border-dim"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-200 font-medium capitalize">
                          {bp.provider}
                        </span>
                        <span className="text-xs text-neon-yellow font-mono">
                          ${bp.cost.toFixed(4)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                          <div
                            className="h-full bg-neon-blue/60 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-500 w-16 text-right">
                          {bp.count} calls
                        </span>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </SectionCard>

        {/* Cost by Model */}
        <SectionCard title="Cost by Model">
          {!cost?.byModel?.length ? (
            <div className="text-xs text-slate-600 py-6 text-center">No model data yet.</div>
          ) : (
            <div className="space-y-1.5">
              {cost.byModel
                .sort((a, b) => b.cost - a.cost)
                .map((bm) => {
                  const pct =
                    cost.totalCostUsd > 0 ? Math.round((bm.cost / cost.totalCostUsd) * 100) : 0
                  return (
                    <div
                      key={bm.model}
                      className="bg-bg-deep rounded px-3 py-2.5 border border-border-dim"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] text-slate-200 font-mono">{bm.model}</span>
                        <span className="text-xs text-neon-yellow font-mono">
                          ${bm.cost.toFixed(4)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                          <div
                            className="h-full bg-neon-purple/60 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-500 w-20 text-right">
                          {(bm.tokens / 1000).toFixed(0)}k tokens
                        </span>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Top Spending Agents */}
      <SectionCard title="Top Spending Agents" className="mb-6">
        {!cost?.topAgents?.length ? (
          <div className="text-xs text-slate-600 py-6 text-center">
            No per-agent cost data yet. Costs are tracked when agents make LLM calls.
          </div>
        ) : (
          <div className="space-y-1.5">
            {cost.topAgents.map((a, i) => {
              const pct = cost.totalCostUsd > 0 ? Math.round((a.cost / cost.totalCostUsd) * 100) : 0
              return (
                <div
                  key={a.agentId}
                  className="flex items-center gap-3 bg-bg-deep rounded px-3 py-2.5 border border-border-dim"
                >
                  <span
                    className={`text-[11px] font-bold w-5 ${i < 3 ? 'text-neon-yellow' : 'text-slate-500'}`}
                  >
                    {i + 1}
                  </span>
                  <span className="text-[11px] text-slate-200 flex-1 min-w-0 truncate">
                    {a.agentName}
                  </span>
                  <div className="w-32 h-1.5 bg-bg-elevated rounded-full overflow-hidden flex-shrink-0">
                    <div
                      className="h-full bg-neon-yellow/50 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 w-16 text-right flex-shrink-0">
                    {a.count} calls
                  </span>
                  <span className="text-xs text-neon-yellow font-mono w-20 text-right flex-shrink-0">
                    ${a.cost.toFixed(4)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configured Providers */}
        <SectionCard title="Configured Providers">
          {providers.length === 0 ? (
            <div className="text-xs text-slate-600 py-6 text-center">
              No API keys stored. Add provider keys in Settings → Secrets.
            </div>
          ) : (
            <div className="space-y-1.5">
              {providers.map((p) => (
                <div
                  key={p.provider}
                  className="flex items-center justify-between bg-bg-deep rounded px-3 py-2 border border-border-dim"
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge label="active" color="green" />
                    <span className="text-xs text-slate-200 capitalize">{p.provider}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Added {new Date(p.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Pricing Reference */}
        <SectionCard title="Model Pricing (per 1M tokens)">
          {Object.keys(pricing).length === 0 ? (
            <div className="text-xs text-slate-600 py-6 text-center">No pricing data.</div>
          ) : (
            <div className="space-y-1">
              {Object.entries(pricing)
                .filter(([, v]) => v.input > 0 || v.output > 0)
                .sort(([, a], [, b]) => b.output - a.output)
                .map(([model, p]) => (
                  <div
                    key={model}
                    className="flex items-center justify-between bg-bg-deep rounded px-3 py-1.5 border border-border-dim"
                  >
                    <span className="text-[11px] text-slate-300 font-mono">{model}</span>
                    <div className="flex gap-4 text-[10px] font-mono">
                      <span className="text-neon-blue">${p.input.toFixed(2)} in</span>
                      <span className="text-neon-yellow">${p.output.toFixed(2)} out</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
