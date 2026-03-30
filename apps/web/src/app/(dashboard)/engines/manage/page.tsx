'use client'

import Link from 'next/link'
import { useState } from 'react'

import { DbErrorBanner } from '../../../../components/db-error-banner'
import { LoadingState } from '../../../../components/ui/loading-state'
import { PageHeader } from '../../../../components/ui/page-header'
import { trpc } from '../../../../utils/trpc'

/* ── Types ──────────────────────────────────────────────────────────────── */

interface Entity {
  id: string
  name: string
  domain: string | null
  tier: string
  status: string
  parentId: string | null
  enginesEnabled: string[] | null
  lastHealthCheck: Date | null
  createdAt: Date
}

interface Template {
  id: string
  domain: string
  engines: string[]
  agents: Array<{ name: string; role: string; capabilities: string[] }>
  dbTables: string[]
  developmentTemplates: string[]
}

type Tab = 'hierarchy' | 'health' | 'routes' | 'budget'

const TIER_BADGE: Record<string, string> = {
  brain: 'text-indigo-400 border-indigo-400/30 bg-indigo-400/10',
  mini_brain: 'text-green-400 border-green-400/30 bg-green-400/10',
  development: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
}

const STATUS_DOT: Record<string, string> = {
  active: 'neon-dot neon-dot-green',
  provisioning: 'neon-dot neon-dot-yellow',
  suspended: 'neon-dot neon-dot-red',
  degraded: 'neon-dot neon-dot-purple',
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function BrainManagerPage() {
  const [tab, setTab] = useState<Tab>('hierarchy')

  const brainsQ = trpc.platform.entitiesByTier.useQuery({ tier: 'brain' })
  const miniBrainsQ = trpc.platform.entitiesByTier.useQuery({ tier: 'mini_brain' })
  const devsQ = trpc.platform.entitiesByTier.useQuery({ tier: 'development' })

  const error = brainsQ.error || miniBrainsQ.error
  if (error)
    return (
      <div className="p-6">
        <DbErrorBanner error={error} />
      </div>
    )

  const isLoading = brainsQ.isLoading || miniBrainsQ.isLoading
  if (isLoading) {
    return (
      <div className="p-6">
        <LoadingState message="Loading brain manager..." />
      </div>
    )
  }

  const brains = (brainsQ.data ?? []) as Entity[]
  const miniBrains = (miniBrainsQ.data ?? []) as Entity[]
  const developments = (devsQ.data ?? []) as Entity[]

  const tabs: { key: Tab; label: string }[] = [
    { key: 'hierarchy', label: 'Hierarchy' },
    { key: 'health', label: 'Health' },
    { key: 'routes', label: 'Routes' },
    { key: 'budget', label: 'Budget' },
  ]

  return (
    <div className="p-6 text-slate-200">
      {/* Header */}
      <PageHeader title="Brain Manager" subtitle="Brain → Mini-Brain → Development" />

      {/* Stat bar */}
      <div className="flex gap-3 mb-5">
        {[
          { label: 'Brains', count: brains.length, cls: 'text-indigo-400' },
          { label: 'Mini-Brains', count: miniBrains.length, cls: 'text-green-400' },
          { label: 'Developments', count: developments.length, cls: 'text-yellow-400' },
        ].map((s) => (
          <div key={s.label} className="cyber-card px-4 py-2 text-center flex-1">
            <div className={`text-xl font-bold ${s.cls}`}>{s.count}</div>
            <div className="text-[11px] text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`cyber-btn-secondary cyber-btn-sm ${
              tab === t.key ? 'ring-1 ring-neon-teal text-neon-teal' : ''
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'hierarchy' && (
        <HierarchyTab brains={brains} miniBrains={miniBrains} developments={developments} />
      )}
      {tab === 'health' && <HealthTab />}
      {tab === 'routes' && <RoutesTab />}
      {tab === 'budget' && <BudgetTab />}
    </div>
  )
}

/* ── Hierarchy Tab ──────────────────────────────────────────────────────── */

function HierarchyTab({
  brains,
  miniBrains,
  developments,
}: {
  brains: Entity[]
  miniBrains: Entity[]
  developments: Entity[]
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showCreate, setShowCreate] = useState(false)

  const allEntities = [...brains, ...miniBrains, ...developments]
  const rootEntities = allEntities.filter((e) => !e.parentId)

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const childrenOf = (id: string) => allEntities.filter((e) => e.parentId === id)

  return (
    <>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-orbitron text-neon-teal">
          Entity Hierarchy ({allEntities.length})
        </h3>
        <button
          className="cyber-btn-primary cyber-btn-sm"
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? 'Cancel' : '+ Create'}
        </button>
      </div>

      {showCreate && <CreationPanel brains={brains} onDone={() => setShowCreate(false)} />}

      {allEntities.length === 0 ? (
        <div className="text-slate-500 text-sm text-center py-8">
          No brain entities yet. Create one to get started.
        </div>
      ) : (
        <div className="cyber-card overflow-hidden">
          {rootEntities.map((entity) => (
            <TreeRow
              key={entity.id}
              entity={entity}
              depth={0}
              expanded={expanded}
              toggle={toggle}
              childrenOf={childrenOf}
            />
          ))}
        </div>
      )}
    </>
  )
}

function TreeRow({
  entity,
  depth,
  expanded,
  toggle,
  childrenOf,
}: {
  entity: Entity
  depth: number
  expanded: Set<string>
  toggle: (id: string) => void
  childrenOf: (id: string) => Entity[]
}) {
  const children = childrenOf(entity.id)
  const hasChildren = children.length > 0
  const isOpen = expanded.has(entity.id)
  const indent = depth === 0 ? 'ml-0' : depth === 1 ? 'ml-6' : depth === 2 ? 'ml-12' : 'ml-16'

  return (
    <>
      <div className={`flex items-center gap-2.5 py-2 px-3 border-b border-white/5 ${indent}`}>
        {/* Chevron */}
        <button
          onClick={() => hasChildren && toggle(entity.id)}
          className={`w-4 text-xs text-slate-500 bg-transparent border-none cursor-pointer ${
            !hasChildren ? 'invisible' : ''
          }`}
        >
          {isOpen ? '\u25BE' : '\u25B8'}
        </button>

        {/* Status dot */}
        <span className={STATUS_DOT[entity.status] ?? 'neon-dot neon-dot-blue'} />

        {/* Name */}
        <Link
          href={`/engines/manage/${entity.id}`}
          className="font-medium text-slate-200 hover:text-neon-teal transition-colors text-sm flex-1"
        >
          {entity.name}
        </Link>

        {/* Tier badge */}
        <span className={`cyber-badge text-xs ${TIER_BADGE[entity.tier] ?? ''}`}>
          {entity.tier.replace('_', ' ')}
        </span>

        {/* Domain */}
        {entity.domain && <span className="text-xs text-slate-500">{entity.domain}</span>}
      </div>

      {/* Children */}
      {isOpen &&
        children.map((child) => (
          <TreeRow
            key={child.id}
            entity={child}
            depth={depth + 1}
            expanded={expanded}
            toggle={toggle}
            childrenOf={childrenOf}
          />
        ))}
    </>
  )
}

/* ── Creation Panel ─────────────────────────────────────────────────────── */

function CreationPanel({ brains, onDone }: { brains: Entity[]; onDone: () => void }) {
  const [name, setName] = useState('')
  const [template, setTemplate] = useState('')
  const [result, setResult] = useState<{ name: string; agentCount: number } | null>(null)

  const templatesQ = trpc.factory.templates.useQuery()
  const templates = (templatesQ.data ?? []) as unknown as Template[]

  const utils = trpc.useUtils()
  const createMut = trpc.factory.smartCreate.useMutation({
    onSuccess: (data) => {
      utils.platform.entitiesByTier.invalidate()
      setResult({ name: data.entity.name, agentCount: data.agentCount })
      setName('')
      setTemplate('')
    },
  })

  const selectedTpl = templates.find((t) => t.id === template)

  if (result) {
    return (
      <div className="cyber-card p-4 mb-4 border-green-500/30">
        <div className="text-sm text-green-400 mb-2">
          Mini-Brain &quot;{result.name}&quot; created with {result.agentCount} agents.
        </div>
        <button
          className="cyber-btn-secondary cyber-btn-sm"
          onClick={() => {
            setResult(null)
            onDone()
          }}
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="cyber-card p-4 mb-4">
      <h4 className="text-sm font-orbitron text-neon-teal mb-3">Create Mini-Brain</h4>

      {/* Step 1 */}
      <div className="flex flex-col gap-2 mb-3">
        <input
          className="cyber-input cyber-input-sm"
          placeholder="Mini-Brain name (e.g., Hotel Revenue AI)..."
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="cyber-select cyber-select-sm"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        >
          <option value="">Select a template (required)</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.id.charAt(0).toUpperCase() + t.id.slice(1)} -- {t.domain} ({t.agents.length}{' '}
              agents, {t.engines.length} engines)
            </option>
          ))}
        </select>
      </div>

      {/* Step 2: Preview */}
      {selectedTpl && (
        <div className="bg-white/5 rounded-lg p-3 mb-3 border border-white/10">
          <div className="text-xs text-neon-teal font-bold mb-1.5">
            Template Preview: {selectedTpl.domain}
          </div>
          <div className="text-xs text-slate-400 mb-1">
            Engines: {selectedTpl.engines.join(' / ')}
          </div>
          <div className="text-xs text-slate-400 mb-1.5">Agents ({selectedTpl.agents.length}):</div>
          <div className="flex flex-wrap gap-1">
            {selectedTpl.agents.map((a) => (
              <span
                key={a.name}
                className="cyber-badge text-[10px]"
                title={`${a.role} -- ${a.capabilities.join(', ')}`}
              >
                {a.name}
              </span>
            ))}
          </div>
          {selectedTpl.developmentTemplates.length > 0 && (
            <div className="text-[10px] text-slate-500 mt-1.5">
              Dev variants: {selectedTpl.developmentTemplates.join(', ')}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 items-center">
        <button
          className="cyber-btn-primary cyber-btn-sm"
          disabled={createMut.isPending || !name.trim() || !template}
          onClick={() =>
            createMut.mutate({
              template: template as
                | 'astrology'
                | 'hospitality'
                | 'healthcare'
                | 'legal'
                | 'marketing'
                | 'soc-ops',
              name: name.trim(),
              parentId: brains[0]?.id,
            })
          }
        >
          {createMut.isPending ? 'Provisioning...' : 'Create'}
        </button>
        <button className="cyber-btn-secondary cyber-btn-sm" onClick={onDone}>
          Cancel
        </button>
        {createMut.error && <span className="text-xs text-red-400">{createMut.error.message}</span>}
      </div>
    </div>
  )
}

/* ── Health Tab ─────────────────────────────────────────────────────────── */

function HealthTab() {
  const diagnoseQ = trpc.healing.diagnose.useQuery()
  const healingLogQ = trpc.healing.healingLog.useQuery({ limit: 10 })
  const autoHealMut = trpc.healing.autoHeal.useMutation({
    onSuccess: () => healingLogQ.refetch(),
  })

  const healthData = (diagnoseQ.data ?? []) as Array<{
    workspaceId: string
    workspaceName: string
    agentCount: number
    idleAgents: number
    errorAgents: number
    hasOrchestrator: boolean
  }>
  const healingLog = (healingLogQ.data ?? []) as unknown as Array<{
    id: string
    action: string
    target: string
    reason: string
    success: boolean
    createdAt: Date
  }>

  return (
    <>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-orbitron text-neon-teal">System Health</h3>
        <button
          className="cyber-btn-primary cyber-btn-sm"
          onClick={() => autoHealMut.mutate()}
          disabled={autoHealMut.isPending}
        >
          {autoHealMut.isPending ? 'Healing...' : 'Auto-Heal'}
        </button>
      </div>

      {healthData.length === 0 ? (
        <div className="text-slate-500 text-sm text-center py-6">No health data available.</div>
      ) : (
        <div className="cyber-card overflow-hidden mb-4">
          {healthData.map((h) => (
            <div
              key={h.workspaceId}
              className="flex items-center gap-2.5 py-2 px-3 border-b border-white/5 text-sm"
            >
              <span
                className={h.errorAgents > 0 ? 'neon-dot neon-dot-red' : 'neon-dot neon-dot-green'}
              />
              <span className="flex-1 text-slate-200">{h.workspaceName}</span>
              <span className="text-slate-400 text-xs">{h.agentCount} agents</span>
              <span className="text-xs text-green-400">{h.idleAgents} idle</span>
              {h.errorAgents > 0 && (
                <span className="text-xs text-red-400">{h.errorAgents} error</span>
              )}
              {!h.hasOrchestrator && (
                <span className="text-xs text-orange-400">no orchestrator</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Healing log */}
      {healingLog.length > 0 && (
        <>
          <h4 className="text-xs font-orbitron text-slate-400 uppercase tracking-wide mb-2">
            Recent Healing Actions
          </h4>
          <div className="cyber-card overflow-hidden">
            {healingLog.map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-2 py-1.5 px-3 border-b border-white/5 text-xs"
              >
                <span
                  className={log.success ? 'neon-dot neon-dot-green' : 'neon-dot neon-dot-red'}
                />
                <span className="flex-1 font-mono text-slate-200">{log.action}</span>
                <span className="text-slate-500">{log.target}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

/* ── Routes Tab ─────────────────────────────────────────────────────────── */

function RoutesTab() {
  const [showAdd, setShowAdd] = useState(false)
  const [fromWs, setFromWs] = useState('')
  const [toWs, setToWs] = useState('')
  const [rule, setRule] = useState('')
  const [priority, setPriority] = useState(0)

  const routesQ = trpc.platform.routes.useQuery({})
  const wsQ = trpc.workspaces.list.useQuery({ limit: 100, offset: 0 })
  const utils = trpc.useUtils()

  const addMut = trpc.platform.addRoute.useMutation({
    onSuccess: () => {
      utils.platform.routes.invalidate()
      setShowAdd(false)
    },
  })
  const deleteMut = trpc.platform.deleteRoute.useMutation({
    onSuccess: () => utils.platform.routes.invalidate(),
  })

  const routes = (routesQ.data ?? []) as Array<{
    id: string
    fromWorkspace: string | null
    toWorkspace: string | null
    rule: string | null
    priority: number | null
  }>
  const workspaces = (wsQ.data ?? []) as Array<{ id: string; name: string }>

  const wsName = (id: string | null) =>
    workspaces.find((w) => w.id === id)?.name ?? id?.slice(0, 8) ?? '?'

  return (
    <>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-orbitron text-neon-teal">
          Cross-Workspace Routes ({routes.length})
        </h3>
        <button className="cyber-btn-secondary cyber-btn-sm" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add Route'}
        </button>
      </div>

      {showAdd && (
        <div className="cyber-card p-3 mb-4 flex gap-2 flex-wrap items-end">
          <select
            className="cyber-select cyber-select-sm flex-1 min-w-[120px]"
            value={fromWs}
            onChange={(e) => setFromWs(e.target.value)}
          >
            <option value="">From workspace</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <select
            className="cyber-select cyber-select-sm flex-1 min-w-[120px]"
            value={toWs}
            onChange={(e) => setToWs(e.target.value)}
          >
            <option value="">To workspace</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <input
            className="cyber-input cyber-input-sm flex-1 min-w-[100px]"
            placeholder="Rule..."
            value={rule}
            onChange={(e) => setRule(e.target.value)}
          />
          <input
            className="cyber-input cyber-input-sm w-16"
            type="number"
            placeholder="Pri"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
          />
          <button
            className="cyber-btn-primary cyber-btn-sm"
            disabled={!fromWs || !toWs || addMut.isPending}
            onClick={() =>
              addMut.mutate({
                fromWorkspace: fromWs,
                toWorkspace: toWs,
                rule: rule || '*',
                priority,
              })
            }
          >
            Add
          </button>
        </div>
      )}

      {routes.length === 0 ? (
        <div className="text-slate-500 text-sm text-center py-6">No routes configured.</div>
      ) : (
        <div className="cyber-card overflow-hidden">
          {routes.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2.5 py-2 px-3 border-b border-white/5 text-sm"
            >
              <span className="flex-1 text-slate-200">
                {wsName(r.fromWorkspace)} &rarr; {wsName(r.toWorkspace)}
              </span>
              {r.rule && <span className="text-xs text-slate-500 font-mono">{r.rule}</span>}
              <span className="text-xs text-slate-500">P{r.priority}</span>
              <button
                className="cyber-btn-danger cyber-btn-xs"
                onClick={() => deleteMut.mutate({ id: r.id })}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ── Budget Tab ─────────────────────────────────────────────────────────── */

function BudgetTab() {
  const budgetQ = trpc.systemOrchestrator.budgetSummary.useQuery()
  const budget = budgetQ.data as
    | {
        totalWorkspaces: number
        activeWorkspaces: number
        workspacesOverBudget: number
        budgetDetails: Array<{ entityId: string; entityName: string; spent: number; limit: number }>
      }
    | undefined

  if (!budget) {
    return <div className="text-slate-500 text-sm text-center py-6">Loading budget data...</div>
  }

  return (
    <>
      <h3 className="text-sm font-orbitron text-neon-teal mb-3">System Budget</h3>

      <div className="flex gap-3 mb-4">
        {[
          { label: 'Active', value: budget.activeWorkspaces, cls: 'text-green-400' },
          { label: 'Total', value: budget.totalWorkspaces, cls: 'text-slate-200' },
          {
            label: 'Over Budget',
            value: budget.workspacesOverBudget,
            cls: budget.workspacesOverBudget > 0 ? 'text-red-400' : 'text-green-400',
          },
        ].map((s) => (
          <div key={s.label} className="cyber-card px-4 py-2 text-center flex-1">
            <div className={`text-lg font-bold ${s.cls}`}>{s.value}</div>
            <div className="text-[10px] text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {budget.budgetDetails.length > 0 && (
        <div className="cyber-card overflow-hidden">
          {budget.budgetDetails.map((d) => (
            <div
              key={d.entityId}
              className="flex items-center gap-2.5 py-2 px-3 border-b border-white/5 text-sm"
            >
              <span className="flex-1 text-slate-200">{d.entityName}</span>
              <span className={d.spent > d.limit ? 'text-red-400' : 'text-green-400'}>
                ${d.spent.toFixed(4)}
              </span>
              <span className="text-slate-500">/ ${d.limit.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
