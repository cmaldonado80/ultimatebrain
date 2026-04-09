'use client'

import Link from 'next/link'
import { useState } from 'react'

import { LoadingState } from '../../../components/ui/loading-state'
import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatCard } from '../../../components/ui/stat-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

const TEMPLATE_ICONS: Record<string, string> = {
  astrology: '☉',
  hospitality: '🏨',
  healthcare: '🏥',
  marketing: '📣',
  'soc-ops': '🛡',
  design: '◈',
  engineering: '⚙',
}

/** Database status panel per department — separate component so hook runs per entity */
function DatabaseStatusPanel({ entityId }: { entityId: string }) {
  const utils = trpc.useUtils()
  const dbStatusQuery = trpc.factory.databaseStatus.useQuery({ entityId })
  const provisionMutation = trpc.factory.provisionDatabase.useMutation({
    onSuccess: () => utils.factory.databaseStatus.invalidate({ entityId }),
  })
  const deprovisionMutation = trpc.factory.deprovisionDatabase.useMutation({
    onSuccess: () => utils.factory.databaseStatus.invalidate({ entityId }),
  })
  const [confirmDeprovision, setConfirmDeprovision] = useState(false)

  const status = dbStatusQuery.data as {
    provisioned: boolean
    host: string | null
    branchId: string | null
    neonAvailable: boolean
  } | null

  if (dbStatusQuery.isLoading) {
    return <div className="ml-8 mt-2 text-[10px] text-slate-600">Checking database status...</div>
  }

  if (!status)
    return <div className="ml-8 mt-2 text-[10px] text-slate-600">Loading database status...</div>

  return (
    <div className="ml-8 mt-2 bg-bg-deep rounded px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 uppercase">Database</span>
        {status.provisioned ? (
          <>
            <span className="neon-dot neon-dot-green" />
            <span className="text-[10px] text-neon-green">Provisioned</span>
          </>
        ) : (
          <>
            <span className="neon-dot neon-dot-yellow" />
            <span className="text-[10px] text-slate-400">Not provisioned</span>
          </>
        )}
        {!status.neonAvailable && (
          <span className="text-[9px] text-slate-600">(Neon not configured)</span>
        )}
      </div>

      {/* Not provisioned — show provision button only when Neon is available */}
      {!status.provisioned && status.neonAvailable && (
        <div className="mt-1">
          <button
            onClick={() => provisionMutation.mutate({ entityId })}
            disabled={provisionMutation.isPending}
            className="text-[9px] text-neon-blue hover:underline"
          >
            {provisionMutation.isPending ? 'Provisioning...' : 'Provision Database'}
          </button>
          {provisionMutation.isError && (
            <div className="text-[9px] text-neon-red mt-1">
              Failed: {provisionMutation.error.message}
            </div>
          )}
          {provisionMutation.isSuccess && (
            <div className="text-[9px] text-neon-green mt-1">Database provisioned</div>
          )}
        </div>
      )}

      {/* Provisioned — show details and deprovision option */}
      {status.provisioned && status.host && (
        <div className="mt-1 space-y-1">
          <div className="text-[10px] text-slate-400">
            <span className="text-slate-500">Host:</span>{' '}
            <code className="text-[9px] font-mono">{status.host}</code>
          </div>
          {status.branchId && (
            <div className="text-[10px] text-slate-400">
              <span className="text-slate-500">Branch:</span>{' '}
              <code className="text-[9px] font-mono">{status.branchId}</code>
            </div>
          )}
          <div className="mt-1">
            {confirmDeprovision ? (
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-neon-red">Delete database branch?</span>
                <button
                  onClick={() => {
                    deprovisionMutation.mutate({ entityId })
                    setConfirmDeprovision(false)
                  }}
                  disabled={deprovisionMutation.isPending}
                  className="text-[9px] text-neon-red hover:underline"
                >
                  {deprovisionMutation.isPending ? '...' : 'Yes, delete'}
                </button>
                <button
                  onClick={() => setConfirmDeprovision(false)}
                  className="text-[9px] text-slate-500 hover:underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDeprovision(true)}
                className="text-[9px] text-slate-500 hover:text-neon-red"
              >
                Deprovision DB
              </button>
            )}
          </div>
        </div>
      )}
      {deprovisionMutation.isError && (
        <div className="text-[9px] text-neon-red mt-1">
          Failed: {deprovisionMutation.error.message}
        </div>
      )}
    </div>
  )
}

/** Entity agents panel — shows agents linked to this entity */
function EntityAgentsPanel({ entityId }: { entityId: string }) {
  const utils = trpc.useUtils()
  const agentsQuery = trpc.platform.entityAgents.useQuery({ entityId })
  const removeAgentMutation = trpc.platform.removeEntityAgent.useMutation({
    onSuccess: () => utils.platform.entityAgents.invalidate({ entityId }),
  })
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const agents = (agentsQuery.data ?? []) as Array<{
    agentId: string
    agentName: string
    role: string
  }>

  if (agentsQuery.isLoading) {
    return <div className="ml-8 mt-2 text-[10px] text-slate-600">Loading agents...</div>
  }
  if (agents.length === 0) return null

  const roleColors: Record<string, 'green' | 'blue' | 'yellow' | 'purple' | 'slate'> = {
    primary: 'green',
    monitor: 'blue',
    healer: 'yellow',
    specialist: 'purple',
  }

  return (
    <div className="ml-8 mt-2 bg-bg-deep rounded px-3 py-2">
      <div className="text-[10px] text-slate-500 uppercase mb-1">
        Linked Agents ({agents.length})
      </div>
      <div className="space-y-1">
        {agents.map((a) => (
          <div key={a.agentId} className="flex items-center gap-2 text-[10px]">
            <span className="text-slate-300">{a.agentName}</span>
            <StatusBadge label={a.role} color={roleColors[a.role] ?? 'slate'} />
            {confirmRemove === a.agentId ? (
              <div className="flex gap-1 ml-auto">
                <button
                  onClick={() => {
                    removeAgentMutation.mutate({ entityId, agentId: a.agentId })
                    setConfirmRemove(null)
                  }}
                  className="text-[9px] text-neon-red hover:underline"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmRemove(null)}
                  className="text-[9px] text-slate-500 hover:underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmRemove(a.agentId)}
                className="text-[9px] text-slate-600 hover:text-neon-red ml-auto"
              >
                Unlink
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Entity health panel */
function EntityHealthPanel({ entityId }: { entityId: string }) {
  const healthQuery = trpc.platform.entityHealth.useQuery({ id: entityId })

  const health = healthQuery.data as {
    status: string
    lastCheckAt: string | null
    details: Record<string, unknown> | null
  } | null

  if (healthQuery.isLoading)
    return <div className="text-[10px] text-slate-600 py-2">Loading health data...</div>
  if (!health) return null

  const statusColor: 'green' | 'yellow' | 'red' | 'slate' =
    health.status === 'healthy'
      ? 'green'
      : health.status === 'degraded'
        ? 'yellow'
        : health.status === 'unhealthy'
          ? 'red'
          : 'slate'

  return (
    <div className="ml-8 mt-2 bg-bg-deep rounded px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 uppercase">Health</span>
        <StatusBadge label={health.status} color={statusColor} />
        {health.lastCheckAt && (
          <span className="text-[9px] text-slate-600">
            Last check: {new Date(health.lastCheckAt).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  )
}

/** Token budget and usage panel */
function TokenBudgetPanel({ entityId }: { entityId: string }) {
  const utils = trpc.useUtils()
  const budgetQuery = trpc.platform.checkBudget.useQuery({ entityId })
  const usageQuery = trpc.platform.usageSummary.useQuery({ entityId })
  const costTrendQuery = trpc.platform.dailyCostTrend.useQuery({ entityId, days: 7 })
  const setBudgetMutation = trpc.platform.setBudget.useMutation({
    onSuccess: () => utils.platform.checkBudget.invalidate({ entityId }),
  })

  const [editBudget, setEditBudget] = useState(false)
  const [dailyLimit, setDailyLimit] = useState('')
  const [monthlyLimit, setMonthlyLimit] = useState('')

  const budget = budgetQuery.data as unknown as {
    withinBudget: boolean
    dailySpent: number
    monthlySpent: number
    dailyLimit: number | null
    monthlyLimit: number | null
  } | null

  const usage = usageQuery.data as unknown as {
    totalTokens: number
    totalCostUsd: number
    requestCount: number
  } | null

  const trend = (costTrendQuery.data ?? []) as unknown as Array<{
    date: string
    costUsd: number
  }>

  if (budgetQuery.isLoading && usageQuery.isLoading)
    return <div className="ml-8 mt-2 text-[10px] text-slate-600">Loading cost data...</div>

  return (
    <div className="ml-8 mt-2 bg-bg-deep rounded px-3 py-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] text-slate-500 uppercase">Token Budget & Usage</span>
        {budget && !budget.withinBudget && (
          <span className="text-[9px] text-neon-red font-medium">OVER BUDGET</span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 text-[10px]">
        {usage && (
          <>
            <div>
              <span className="text-slate-500">Requests:</span>{' '}
              <span className="text-slate-300">{usage.requestCount ?? 0}</span>
            </div>
            <div>
              <span className="text-slate-500">Tokens:</span>{' '}
              <span className="text-slate-300">{(usage.totalTokens ?? 0).toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-500">Cost:</span>{' '}
              <span className="text-neon-yellow">${(usage.totalCostUsd ?? 0).toFixed(4)}</span>
            </div>
          </>
        )}
        {budget && (
          <div>
            <span className="text-slate-500">Daily:</span>{' '}
            <span className="text-slate-300">
              ${(budget.dailySpent ?? 0).toFixed(2)}
              {budget.dailyLimit != null && ` / $${budget.dailyLimit.toFixed(2)}`}
            </span>
          </div>
        )}
      </div>

      {/* 7-day cost sparkline */}
      {Array.isArray(trend) && trend.length > 0 && (
        <div className="flex items-end gap-px mt-2 h-6">
          {trend.map((d) => {
            const max = Math.max(...trend.map((t) => t.costUsd), 0.01)
            const h = Math.max((d.costUsd / max) * 100, 4)
            return (
              <div
                key={d.date}
                className="flex-1 bg-neon-teal/40 rounded-t"
                style={{ height: `${h}%` }}
                title={`${d.date}: $${d.costUsd.toFixed(4)}`}
              />
            )
          })}
        </div>
      )}

      {/* Budget editor */}
      {editBudget ? (
        <div className="mt-2 flex gap-2 items-center">
          <input
            type="number"
            placeholder="Daily $"
            value={dailyLimit}
            onChange={(e) => setDailyLimit(e.target.value)}
            className="w-20 bg-bg-elevated border border-border-dim rounded px-1.5 py-0.5 text-[10px] text-slate-200"
          />
          <input
            type="number"
            placeholder="Monthly $"
            value={monthlyLimit}
            onChange={(e) => setMonthlyLimit(e.target.value)}
            className="w-20 bg-bg-elevated border border-border-dim rounded px-1.5 py-0.5 text-[10px] text-slate-200"
          />
          <button
            onClick={() => {
              setBudgetMutation.mutate({
                entityId,
                dailyLimitUsd: dailyLimit ? Number(dailyLimit) : undefined,
                monthlyLimitUsd: monthlyLimit ? Number(monthlyLimit) : undefined,
              })
              setEditBudget(false)
            }}
            className="text-[9px] text-neon-green hover:underline"
          >
            Save
          </button>
          <button
            onClick={() => setEditBudget(false)}
            className="text-[9px] text-slate-500 hover:underline"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditBudget(true)}
          className="text-[9px] text-slate-500 hover:text-neon-teal mt-1"
        >
          Set Budget
        </button>
      )}
    </div>
  )
}

/** Deployment workflow panel */
function DeploymentPanel({ entityId }: { entityId: string }) {
  const utils = trpc.useUtils()
  const deploymentsQuery = trpc.deployments.list.useQuery({ limit: 5 })
  const advanceMutation = trpc.deployments.advance.useMutation({
    onSuccess: () => utils.deployments.list.invalidate(),
  })
  const cancelMutation = trpc.deployments.cancel.useMutation({
    onSuccess: () => utils.deployments.list.invalidate(),
  })

  const workflows = (deploymentsQuery.data ?? []) as unknown as Array<{
    id: string
    entityId: string
    entity: { id: string; name: string } | null
    status: string
    currentStep: string | null
    steps: Array<{ name: string; status: string }> | null
    createdAt: string
  }>

  // Filter to this entity's workflows
  const entityWorkflows = workflows.filter((w) => w.entityId === entityId)

  if (deploymentsQuery.isLoading)
    return <div className="text-[10px] text-slate-600 py-2">Loading deployments...</div>
  if (entityWorkflows.length === 0) return null

  const statusColors: Record<string, 'green' | 'blue' | 'yellow' | 'red' | 'slate'> = {
    pending: 'yellow',
    running: 'blue',
    completed: 'green',
    failed: 'red',
    cancelled: 'slate',
  }

  return (
    <div className="ml-8 mt-2 bg-bg-deep rounded px-3 py-2">
      <div className="text-[10px] text-slate-500 uppercase mb-1">Deployment Workflows</div>
      {entityWorkflows.map((wf) => (
        <div key={wf.id} className="mb-2 last:mb-0">
          <div className="flex items-center gap-2">
            <StatusBadge label={wf.status} color={statusColors[wf.status] ?? 'slate'} />
            {wf.currentStep && (
              <span className="text-[9px] text-slate-400">Step: {wf.currentStep}</span>
            )}
            <span className="text-[9px] text-slate-600 ml-auto">
              {new Date(wf.createdAt).toLocaleDateString()}
            </span>
          </div>
          {/* Step progress */}
          {Array.isArray(wf.steps) && wf.steps.length > 0 && (
            <div className="flex gap-1 mt-1">
              {wf.steps.map((step) => (
                <div
                  key={step.name}
                  className={`flex-1 h-1.5 rounded ${
                    step.status === 'completed'
                      ? 'bg-neon-green'
                      : step.status === 'running'
                        ? 'bg-neon-blue animate-pulse'
                        : step.status === 'failed'
                          ? 'bg-neon-red'
                          : 'bg-slate-700'
                  }`}
                  title={`${step.name}: ${step.status}`}
                />
              ))}
            </div>
          )}
          {/* Actions */}
          {(wf.status === 'pending' || wf.status === 'running') && (
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => advanceMutation.mutate({ workflowId: wf.id })}
                disabled={advanceMutation.isPending}
                className="text-[9px] text-neon-teal hover:underline"
              >
                {advanceMutation.isPending ? '...' : 'Advance'}
              </button>
              <button
                onClick={() => cancelMutation.mutate({ workflowId: wf.id })}
                disabled={cancelMutation.isPending}
                className="text-[9px] text-slate-500 hover:text-neon-red"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** Live status panel — real-time throughput and health per department */
function LiveStatusPanel({ entityId }: { entityId: string }) {
  const statsQuery = trpc.platform.miniBrainLiveStats.useQuery(
    { entityId },
    { refetchInterval: 30_000 },
  )

  const stats = statsQuery.data as unknown as {
    requestsLastHour: number
    tokensLastHour: number
    costLast24h: number
    agentCount: number
    memoryCount: number
    lastHeartbeat: string | null
    failCount: number
    throughputBuckets: Array<{ bucket: string; requests: number; tokens: number; costUsd: number }>
  } | null

  if (statsQuery.isLoading)
    return <div className="text-[10px] text-slate-600 py-2">Loading stats...</div>
  if (!stats) return null

  // Heartbeat freshness indicator
  const heartbeatAge = stats.lastHeartbeat
    ? Date.now() - new Date(stats.lastHeartbeat).getTime()
    : null
  const heartbeatColor: 'green' | 'yellow' | 'red' | 'slate' =
    heartbeatAge === null
      ? 'slate'
      : heartbeatAge < 60_000
        ? 'green'
        : heartbeatAge < 300_000
          ? 'yellow'
          : 'red'

  const buckets = stats.throughputBuckets ?? []

  return (
    <div className="ml-8 mt-2 bg-bg-deep rounded px-3 py-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] text-slate-500 uppercase">Live Status</span>
        <StatusBadge
          label={stats.failCount > 0 ? `${stats.failCount} fails` : 'healthy'}
          color={heartbeatColor}
        />
        {stats.lastHeartbeat && (
          <span className="text-[9px] text-slate-600">
            Heartbeat: {new Date(stats.lastHeartbeat).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="grid grid-cols-5 gap-2 text-[10px]">
        <div>
          <span className="text-slate-500">Req/hr:</span>{' '}
          <span className="text-slate-300">{stats.requestsLastHour}</span>
        </div>
        <div>
          <span className="text-slate-500">Tokens/hr:</span>{' '}
          <span className="text-slate-300">{(stats.tokensLastHour ?? 0).toLocaleString()}</span>
        </div>
        <div>
          <span className="text-slate-500">Cost 24h:</span>{' '}
          <span className="text-neon-yellow">${(stats.costLast24h ?? 0).toFixed(4)}</span>
        </div>
        <div>
          <span className="text-slate-500">Agents:</span>{' '}
          <span className="text-slate-300">{stats.agentCount}</span>
        </div>
        <div>
          <span className="text-slate-500">Memories:</span>{' '}
          <span className="text-slate-300">{stats.memoryCount}</span>
        </div>
      </div>

      {/* Throughput sparkline */}
      {buckets.length > 0 && (
        <div className="mt-2">
          <div className="text-[9px] text-slate-600 mb-0.5">
            Throughput (5min buckets, last hour)
          </div>
          <div className="flex items-end gap-px h-8">
            {buckets.map((b) => {
              const max = Math.max(...buckets.map((x) => x.requests), 1)
              const h = Math.max((b.requests / max) * 100, 4)
              return (
                <div
                  key={b.bucket}
                  className="flex-1 bg-neon-teal/40 rounded-t"
                  style={{ height: `${h}%` }}
                  title={`${b.bucket}: ${b.requests} req, ${b.tokens} tokens`}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function MiniBrainFactoryPage() {
  const utils = trpc.useUtils()
  const topologyQuery = trpc.entities.topology.useQuery()
  const templatesQuery = trpc.factory.templates.useQuery()

  const templates = (templatesQuery.data ?? []) as Array<{
    id: string
    domain: string
    engines: string[]
    agents: Array<{ name: string; role: string; capabilities: string[]; soul?: string }>
    dbTables: string[]
    developmentTemplates: string[]
  }>

  const miniBrains = (topologyQuery.data?.miniBrains ?? []) as Array<{
    id: string
    name: string
    domain: string | null
    status: string
    tier: string
  }>
  const developments = (topologyQuery.data?.developments ?? []) as Array<{
    id: string
    name: string
    domain: string | null
    status: string
    parentId: string | null
  }>

  // Template detail expansion
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null)

  // Create Mini Brain
  const [createName, setCreateName] = useState('')
  const [createTemplate, setCreateTemplate] = useState<string>('')
  const [createError, setCreateError] = useState('')
  const [createResult, setCreateResult] = useState<{
    apiKey: string
    entityId: string
    agentCount: number
  } | null>(null)

  const smartCreateMutation = trpc.factory.smartCreate.useMutation({
    onSuccess: (data) => {
      const result = data as {
        entity: { id: string }
        apiKey?: string
        agentCount: number
      }
      setCreateResult({
        apiKey: result.apiKey ?? '',
        entityId: result.entity.id,
        agentCount: result.agentCount,
      })
      setCreateName('')
      setCreateError('')
      utils.entities.topology.invalidate()
    },
    onError: (err) => {
      setCreateError(err.message)
      setCreateResult(null)
    },
  })

  // Create Development App
  const [devName, setDevName] = useState('')
  const [devParentId, setDevParentId] = useState('')
  const [devTemplate, setDevTemplate] = useState('')
  const [devSuccess, setDevSuccess] = useState('')

  const smartCreateDevMutation = trpc.factory.smartCreateDevelopment.useMutation({
    onSuccess: (data) => {
      const result = data as { entity: { name: string }; agentCount: number }
      setDevSuccess(`Created "${result.entity.name}" with ${result.agentCount} agents`)
      setDevName('')
      setDevTemplate('')
      utils.entities.topology.invalidate()
      setTimeout(() => setDevSuccess(''), 5000)
    },
  })

  // Regenerate API key
  const [regenResult, setRegenResult] = useState<{ entityId: string; apiKey: string } | null>(null)
  const regenKeyMutation = trpc.factory.regenerateEntityApiKey.useMutation({
    onSuccess: (data, variables) => {
      const result = data as { apiKey: string }
      setRegenResult({ entityId: variables.entityId, apiKey: result.apiKey })
    },
  })

  // Reprovision agents
  const [reprovisionResult, setReprovisionResult] = useState<{
    entityId: string
    added: number
    existing: number
  } | null>(null)
  const reprovisionMutation = trpc.factory.reprovisionAgents.useMutation({
    onSuccess: (data, variables) => {
      const result = data as { added: number; existing: number }
      setReprovisionResult({
        entityId: variables.entityId,
        added: result.added,
        existing: result.existing,
      })
      utils.entities.topology.invalidate()
      setTimeout(() => setReprovisionResult(null), 5000)
    },
  })

  // Delete entity
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const deleteEntityMutation = trpc.entities.delete.useMutation({
    onSuccess: () => {
      setDeleteConfirm(null)
      utils.entities.topology.invalidate()
    },
  })

  // Update entity status
  const updateEntityMutation = trpc.entities.update.useMutation({
    onSuccess: () => utils.entities.topology.invalidate(),
  })

  // Heartbeat sweep
  const heartbeatSweepMutation = trpc.platform.heartbeatSweep.useMutation({
    onSuccess: () => utils.entities.topology.invalidate(),
  })

  // Mesh peers
  const meshPeersQuery = trpc.mesh.peers.useQuery()
  const meshPeers = (meshPeersQuery.data ?? []) as Array<{
    entityId: string
    name: string
    domain: string | null
    endpoint: string | null
    capabilities: string[]
    status: string
    lastHeartbeat: string | null
  }>

  // Dev templates for selected mini brain domain
  const getDevTemplatesForDomain = (domain: string | null) => {
    if (!domain) return []
    const tpl = templates.find((t) => t.id === domain)
    return tpl?.developmentTemplates ?? []
  }

  if (topologyQuery.isLoading || templatesQuery.isLoading) {
    return <LoadingState message="Loading Department Manager..." />
  }

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Department Manager"
        subtitle="Provision, manage, and deploy departments and products"
      />

      {/* Stats */}
      <PageGrid cols="4" className="mb-6">
        <StatCard
          label="Departments"
          value={miniBrains.length}
          color="purple"
          sub="Domain specialists"
        />
        <StatCard
          label="Products"
          value={developments.length}
          color="blue"
          sub="Deployed applications"
        />
        <StatCard
          label="Templates"
          value={templates.length}
          color="green"
          sub="Available blueprints"
        />
        <StatCard
          label="Mesh Peers"
          value={meshPeers.filter((p) => p.endpoint).length}
          color="blue"
          sub="Reachable endpoints"
        />
      </PageGrid>

      {/* Operations Bar */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => heartbeatSweepMutation.mutate()}
          disabled={heartbeatSweepMutation.isPending}
          className="cyber-btn-secondary cyber-btn-sm"
        >
          {heartbeatSweepMutation.isPending ? 'Sweeping...' : 'Run Heartbeat Sweep'}
        </button>
        {heartbeatSweepMutation.isSuccess && (
          <span className="text-[10px] text-neon-green self-center">
            {(() => {
              const r = heartbeatSweepMutation.data as unknown as {
                checked: number
                healthy: number
                degraded: number
                recovered: number
              }
              return `Checked ${r.checked}: ${r.healthy} healthy, ${r.degraded} degraded, ${r.recovered} recovered`
            })()}
          </span>
        )}
        {heartbeatSweepMutation.isError && (
          <span className="text-[10px] text-neon-red self-center">
            Sweep failed: {heartbeatSweepMutation.error.message}
          </span>
        )}
      </div>

      {/* Create Department */}
      <SectionCard title="Create Department" className="mb-6">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 uppercase block mb-1">Name</label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="My Astrology Department"
                className="w-full bg-bg-elevated border border-border-dim rounded px-3 py-1.5 text-sm text-slate-200 focus:border-neon-teal focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase block mb-1">Template</label>
              <select
                value={createTemplate}
                onChange={(e) => setCreateTemplate(e.target.value)}
                className="w-full bg-bg-elevated border border-border-dim rounded px-3 py-1.5 text-sm text-slate-200 focus:border-neon-teal focus:outline-none"
              >
                <option value="">Select template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {TEMPLATE_ICONS[t.id] ?? '◆'} {t.id} ({t.agents.length} agents)
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  if (!createName.trim() || !createTemplate) return
                  setCreateResult(null)
                  smartCreateMutation.mutate({
                    name: createName.trim(),
                    template: createTemplate as 'astrology',
                  })
                }}
                disabled={smartCreateMutation.isPending || !createName.trim() || !createTemplate}
                className="cyber-btn-primary cyber-btn-sm w-full disabled:opacity-50"
              >
                {smartCreateMutation.isPending ? 'Creating...' : 'Create Department'}
              </button>
            </div>
          </div>
          {createError && <div className="text-xs text-neon-red">{createError}</div>}
          {createResult && (
            <div className="bg-neon-green/10 border border-neon-green/30 rounded p-3 space-y-2">
              <div className="text-xs text-neon-green font-medium">
                Department created with {createResult.agentCount} agents!
              </div>
              {createResult.apiKey && (
                <div>
                  <div className="text-[10px] text-slate-400 mb-1">
                    API Key (shown once — copy now):
                  </div>
                  <code className="block bg-bg-deep px-2 py-1 rounded text-[11px] text-neon-yellow font-mono break-all select-all">
                    {createResult.apiKey}
                  </code>
                </div>
              )}
            </div>
          )}
          <div className="text-[10px] text-slate-600">
            Creates: Brain Entity + Workspace + Orchestrator Agent + Template Agents + Binding.
            Fully provisioned in one click.
          </div>
        </div>
      </SectionCard>

      {/* Templates from backend */}
      <SectionCard title="Available Templates" className="mb-6">
        <PageGrid cols="3">
          {templates.map((t) => {
            const isExpanded = expandedTemplate === t.id
            return (
              <div
                key={t.id}
                className={`cyber-card p-3 cursor-pointer transition-colors ${createTemplate === t.id ? 'border-neon-teal' : ''}`}
                onClick={() => setCreateTemplate(t.id)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">{TEMPLATE_ICONS[t.id] ?? '◆'}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium capitalize">{t.id}</div>
                    <div className="text-[10px] text-slate-500">{t.domain}</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setExpandedTemplate(isExpanded ? null : t.id)
                    }}
                    className="text-[9px] text-slate-500 hover:text-neon-teal"
                  >
                    {isExpanded ? '▾ Less' : '▸ Details'}
                  </button>
                </div>
                <div className="text-[10px] text-slate-400 mt-2 space-y-0.5">
                  <div>
                    <span className="text-slate-500">Agents:</span> {t.agents.length} —{' '}
                    {t.agents.map((a) => a.role).join(', ')}
                  </div>
                  <div>
                    <span className="text-slate-500">Engines:</span> {t.engines.join(', ')}
                  </div>
                  <div>
                    <span className="text-slate-500">Dev Templates:</span>{' '}
                    {t.developmentTemplates.length} — {t.developmentTemplates.join(', ')}
                  </div>
                  <div>
                    <span className="text-slate-500">DB Tables:</span> {t.dbTables.length} —{' '}
                    {t.dbTables.join(', ')}
                  </div>
                </div>

                {/* Expanded agent details */}
                {isExpanded && (
                  <div className="mt-3 pt-2 border-t border-border-dim space-y-2">
                    <div className="text-[10px] text-slate-500 uppercase">Agent Roster</div>
                    {t.agents.map((agent) => (
                      <div key={agent.name} className="bg-bg-deep rounded px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-medium text-slate-200">
                            {agent.name}
                          </span>
                          <span className="text-[9px] text-neon-teal">{agent.role}</span>
                        </div>
                        {agent.capabilities.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {agent.capabilities.map((cap) => (
                              <span
                                key={cap}
                                className="text-[8px] px-1 py-0.5 bg-neon-purple/10 text-neon-purple rounded"
                              >
                                {cap}
                              </span>
                            ))}
                          </div>
                        )}
                        {agent.soul && (
                          <div className="text-[9px] text-slate-500 mt-1 line-clamp-2">
                            {agent.soul}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </PageGrid>
      </SectionCard>

      {/* Active Departments */}
      <SectionCard title="Active Departments" className="mb-6">
        {miniBrains.length === 0 ? (
          <div className="text-xs text-slate-600 py-6 text-center">
            No departments provisioned yet. Use the form above to create one.
          </div>
        ) : (
          <div className="space-y-3">
            {miniBrains.map((mb) => {
              const mbDevs = developments.filter((d) => d.parentId === mb.id)
              const domainDevTemplates = getDevTemplatesForDomain(mb.domain)
              return (
                <div key={mb.id} className="cyber-card p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xl">{TEMPLATE_ICONS[mb.domain ?? ''] ?? '◆'}</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{mb.name}</div>
                      <div className="text-[10px] text-slate-500">
                        {mb.domain ?? 'general'} &middot; {mb.id.slice(0, 8)}
                      </div>
                    </div>
                    <StatusBadge
                      label={mb.status}
                      color={
                        mb.status === 'active'
                          ? 'green'
                          : mb.status === 'provisioning'
                            ? 'yellow'
                            : mb.status === 'suspended'
                              ? 'red'
                              : 'blue'
                      }
                    />
                    <div className="flex gap-1">
                      {/* Status toggle */}
                      {mb.status === 'active' ? (
                        <button
                          onClick={() =>
                            updateEntityMutation.mutate({ id: mb.id, status: 'suspended' })
                          }
                          disabled={updateEntityMutation.isPending}
                          className="cyber-btn-secondary text-[9px] px-2 py-0.5 text-neon-yellow"
                          title="Suspend this department"
                        >
                          Suspend
                        </button>
                      ) : mb.status === 'suspended' ? (
                        <button
                          onClick={() =>
                            updateEntityMutation.mutate({ id: mb.id, status: 'active' })
                          }
                          disabled={updateEntityMutation.isPending}
                          className="cyber-btn-secondary text-[9px] px-2 py-0.5 text-neon-green"
                          title="Activate this department"
                        >
                          Activate
                        </button>
                      ) : null}
                      <button
                        onClick={() => reprovisionMutation.mutate({ entityId: mb.id })}
                        disabled={reprovisionMutation.isPending}
                        className="cyber-btn-secondary text-[9px] px-2 py-0.5"
                        title="Reprovision agents from template"
                      >
                        {reprovisionMutation.isPending ? '...' : 'Reprovision'}
                      </button>
                      <button
                        onClick={() => regenKeyMutation.mutate({ entityId: mb.id })}
                        disabled={regenKeyMutation.isPending}
                        className="cyber-btn-secondary text-[9px] px-2 py-0.5"
                        title="Regenerate API key"
                      >
                        {regenKeyMutation.isPending ? '...' : 'Regen Key'}
                      </button>
                      {/* Delete with confirmation */}
                      {deleteConfirm === mb.id ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => deleteEntityMutation.mutate({ id: mb.id })}
                            disabled={deleteEntityMutation.isPending}
                            className="cyber-btn-secondary text-[9px] px-2 py-0.5 text-neon-red border-neon-red/40"
                          >
                            {deleteEntityMutation.isPending ? '...' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="cyber-btn-secondary text-[9px] px-2 py-0.5"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(mb.id)}
                          className="cyber-btn-secondary text-[9px] px-2 py-0.5 text-neon-red"
                          title="Delete this department"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Reprovision feedback */}
                  {reprovisionResult?.entityId === mb.id && (
                    <div className="text-[10px] text-neon-green ml-8 mb-2">
                      Reprovisioned: {reprovisionResult.added} added, {reprovisionResult.existing}{' '}
                      existing
                    </div>
                  )}

                  {/* Regen key feedback */}
                  {regenResult?.entityId === mb.id && (
                    <div className="ml-8 mb-2 bg-neon-yellow/10 border border-neon-yellow/30 rounded p-2">
                      <div className="text-[10px] text-slate-400 mb-1">
                        New API Key (shown once — copy now):
                      </div>
                      <code className="block text-[10px] text-neon-yellow font-mono break-all select-all">
                        {regenResult.apiKey}
                      </code>
                      <button
                        onClick={() => setRegenResult(null)}
                        className="text-[9px] text-slate-500 mt-1 hover:text-slate-300"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {/* Database Status */}
                  <DatabaseStatusPanel entityId={mb.id} />

                  {/* Entity Agents */}
                  <EntityAgentsPanel entityId={mb.id} />

                  {/* Health Status */}
                  <EntityHealthPanel entityId={mb.id} />

                  {/* Token Budget & Usage */}
                  <TokenBudgetPanel entityId={mb.id} />

                  {/* Deployment Workflows */}
                  <DeploymentPanel entityId={mb.id} />

                  {/* Live Status */}
                  <LiveStatusPanel entityId={mb.id} />

                  {/* Products for this Department */}
                  {mbDevs.length > 0 && (
                    <div className="ml-8 mt-2 space-y-1">
                      <div className="text-[10px] text-slate-500 uppercase">Products</div>
                      {mbDevs.map((dev) => (
                        <div
                          key={dev.id}
                          className="flex items-center gap-2 px-2 py-1 bg-bg-deep rounded text-xs"
                        >
                          <span className="text-slate-400">└</span>
                          <Link
                            href={`/domain/${dev.id}`}
                            className="text-neon-teal hover:text-neon-teal/80 no-underline flex-1"
                          >
                            {dev.name}
                          </Link>
                          <StatusBadge
                            label={dev.status}
                            color={dev.status === 'active' ? 'green' : 'yellow'}
                          />
                          {deleteConfirm === dev.id ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => deleteEntityMutation.mutate({ id: dev.id })}
                                disabled={deleteEntityMutation.isPending}
                                className="text-[9px] text-neon-red hover:underline"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="text-[9px] text-slate-500 hover:underline"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(dev.id)}
                              className="text-[9px] text-slate-500 hover:text-neon-red"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Dev app success message */}
                  {devSuccess && devParentId === mb.id && (
                    <div className="text-[10px] text-neon-green ml-8 mt-1">{devSuccess}</div>
                  )}

                  {/* Quick Create Product */}
                  <div className="ml-8 mt-2 flex gap-2">
                    <input
                      type="text"
                      placeholder="New product name..."
                      value={devParentId === mb.id ? devName : ''}
                      onFocus={() => setDevParentId(mb.id)}
                      onChange={(e) => {
                        setDevParentId(mb.id)
                        setDevName(e.target.value)
                      }}
                      className="flex-1 bg-bg-deep border border-border-dim/30 rounded px-2 py-1 text-[11px] text-slate-300 focus:border-neon-teal/50 focus:outline-none"
                    />
                    {domainDevTemplates.length > 0 && (
                      <select
                        value={devParentId === mb.id ? devTemplate : ''}
                        onFocus={() => setDevParentId(mb.id)}
                        onChange={(e) => {
                          setDevParentId(mb.id)
                          setDevTemplate(e.target.value)
                        }}
                        className="bg-bg-deep border border-border-dim/30 rounded px-2 py-1 text-[11px] text-slate-300 focus:border-neon-teal/50 focus:outline-none"
                      >
                        <option value="">No template</option>
                        {domainDevTemplates.map((dt) => (
                          <option key={dt} value={dt}>
                            {dt}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() => {
                        if (!devName.trim() || devParentId !== mb.id) return
                        smartCreateDevMutation.mutate({
                          name: devName.trim(),
                          miniBrainId: mb.id,
                          template: devTemplate || undefined,
                        })
                      }}
                      disabled={
                        smartCreateDevMutation.isPending || !devName.trim() || devParentId !== mb.id
                      }
                      className="cyber-btn-primary text-[9px] px-2 py-0.5 disabled:opacity-50"
                    >
                      {smartCreateDevMutation.isPending ? '...' : '+ Product'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
