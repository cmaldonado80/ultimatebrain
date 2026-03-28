'use client'

/**
 * Brain Manager — create and manage brain entities, mini-brains, and developments.
 * Hierarchy: Brain → Mini-Brain → Development
 */

import { useState } from 'react'
import Link from 'next/link'
import { trpc } from '../../../../utils/trpc'
import { DbErrorBanner } from '../../../../components/db-error-banner'

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

const TIER_COLORS: Record<string, string> = {
  brain: '#818cf8',
  mini_brain: '#22c55e',
  development: '#eab308',
}

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  provisioning: '#eab308',
  suspended: '#ef4444',
  degraded: '#f97316',
}

function DevCreationForm({
  domain,
  devName,
  devTemplate,
  onNameChange,
  onTemplateChange,
  onSubmit,
  isPending,
  depth,
}: {
  domain: string
  devName: string
  devTemplate: string
  onNameChange: (v: string) => void
  onTemplateChange: (v: string) => void
  onSubmit: () => void
  isPending: boolean
  depth: number
}) {
  const devTemplatesQuery = trpc.factory.developmentTemplates.useQuery(
    {
      template: domain as
        | 'astrology'
        | 'hospitality'
        | 'healthcare'
        | 'legal'
        | 'marketing'
        | 'soc-ops',
    },
    { enabled: !!domain },
  )
  const devTemplates = (devTemplatesQuery.data ?? []) as string[]

  return (
    <div
      className="py-2 px-4 bg-bg-deep border-b border-border flex gap-1.5 items-center"
      style={{ paddingLeft: 16 + depth * 24 }}
    >
      {devTemplates.length > 0 && (
        <select
          className="cyber-select text-[11px] py-1 px-1.5"
          value={devTemplate}
          onChange={(e) => onTemplateChange(e.target.value)}
        >
          <option value="">Select template...</option>
          {devTemplates.map((t) => (
            <option key={t} value={t}>
              {t.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
      )}
      <input
        className="cyber-input text-[11px] py-1 px-2 flex-1"
        placeholder="Development name..."
        value={devName}
        onChange={(e) => onNameChange(e.target.value)}
      />
      <button
        className="cyber-btn-primary bg-neon-green text-white border-none rounded py-1 px-2.5 text-[11px] font-semibold cursor-pointer"
        onClick={onSubmit}
        disabled={isPending || !devName.trim()}
      >
        {isPending ? 'Creating...' : 'Create'}
      </button>
    </div>
  )
}

export default function BrainManagerPage() {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [entityName, setEntityName] = useState('')
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null)
  const [devCreateTarget, setDevCreateTarget] = useState<string | null>(null)
  const [devName, setDevName] = useState('')
  const [devTemplate, setDevTemplate] = useState('')
  const [createResult, setCreateResult] = useState<{ name: string; agentCount: number } | null>(
    null,
  )

  const entitiesQuery = trpc.platform.entitiesByTier.useQuery({ tier: 'brain' })
  const miniBrainsQuery = trpc.platform.entitiesByTier.useQuery({ tier: 'mini_brain' })
  const developmentsQuery = trpc.platform.entitiesByTier.useQuery({ tier: 'development' })
  const templatesQuery = trpc.factory.templates.useQuery()

  const utils = trpc.useUtils()
  const createMut = trpc.factory.smartCreate.useMutation({
    onSuccess: (data) => {
      utils.platform.entitiesByTier.invalidate()
      setShowCreateForm(false)
      setEntityName('')
      setSelectedTemplate('')
      setCreateResult({ name: data.entity.name, agentCount: data.agentCount })
    },
  })
  const devCreateMut = trpc.factory.smartCreateDevelopment.useMutation({
    onSuccess: () => {
      utils.platform.entitiesByTier.invalidate()
      setDevCreateTarget(null)
      setDevName('')
      setDevTemplate('')
    },
  })
  const reprovisionMut = trpc.factory.reprovisionAgents.useMutation({
    onSuccess: () => utils.platform.entitiesByTier.invalidate(),
  })
  const activateMut = trpc.platform.activateEntity.useMutation({
    onSuccess: () => utils.platform.entitiesByTier.invalidate(),
  })
  const suspendMut = trpc.platform.suspendEntity.useMutation({
    onSuccess: () => utils.platform.entitiesByTier.invalidate(),
  })

  const error = entitiesQuery.error || miniBrainsQuery.error
  if (error) {
    return (
      <div className="p-6 font-sans text-slate-50">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  const isLoading = entitiesQuery.isLoading || miniBrainsQuery.isLoading
  if (isLoading) {
    return (
      <div className="p-6 font-sans text-slate-50 flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-500">Loading brain hierarchy...</div>
      </div>
    )
  }

  const brains = (entitiesQuery.data ?? []) as Entity[]
  const miniBrains = (miniBrainsQuery.data ?? []) as Entity[]
  const developments = (developmentsQuery.data ?? []) as Entity[]
  const templates = (templatesQuery.data ?? []) as unknown as Template[]
  const allEntities = [...brains, ...miniBrains, ...developments]

  function renderEntity(entity: Entity, depth: number) {
    const children = allEntities.filter((e) => e.parentId === entity.id)
    const tierColor = TIER_COLORS[entity.tier] ?? '#6b7280'
    const statusColor = STATUS_COLORS[entity.status] ?? '#6b7280'

    return (
      <div key={entity.id}>
        <div
          className={`flex items-center gap-2 py-2 px-3 border-b border-border-dim ${depth % 2 === 0 ? 'bg-bg-surface' : 'bg-bg-deep'}`}
          style={{ paddingLeft: 12 + depth * 24 }}
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: statusColor }} />
          <span
            className={`font-bold text-[13px] flex-1 cursor-pointer ${expandedEntity === entity.id ? 'border-b-2 border-neon-purple' : ''}`}
            onClick={() => setExpandedEntity(expandedEntity === entity.id ? null : entity.id)}
            title="Click to expand"
          >
            {entity.name}
          </span>
          <Link
            href={`/engines/manage/${entity.id}`}
            className="text-[10px] text-neon-purple no-underline"
            onClick={(e) => e.stopPropagation()}
            title="View detail"
          >
            →
          </Link>
          {entity.tier === 'mini_brain' && (
            <button
              className="text-white border-none rounded py-0.5 px-2 text-[9px] font-semibold cursor-pointer bg-yellow-500 text-black"
              onClick={(e) => {
                e.stopPropagation()
                setDevCreateTarget(devCreateTarget === entity.id ? null : entity.id)
              }}
            >
              + Dev
            </button>
          )}
          <span
            className="text-[10px] py-px px-2 rounded font-semibold"
            style={{ background: tierColor + '20', color: tierColor }}
          >
            {entity.tier.replace('_', ' ')}
          </span>
          {entity.domain && <span className="text-[10px] text-slate-500">{entity.domain}</span>}
          <span className="text-[10px] font-semibold" style={{ color: statusColor }}>
            {entity.status}
          </span>
          {entity.status === 'provisioning' && (
            <button
              className="text-white border-none rounded py-0.5 px-2 text-[10px] font-semibold cursor-pointer bg-green-500"
              onClick={() => activateMut.mutate({ id: entity.id })}
              disabled={activateMut.isPending}
            >
              Activate
            </button>
          )}
          {entity.status === 'active' && (
            <button
              className="text-white border-none rounded py-0.5 px-2 text-[10px] font-semibold cursor-pointer bg-red-500"
              onClick={() => suspendMut.mutate({ id: entity.id })}
              disabled={suspendMut.isPending}
            >
              Suspend
            </button>
          )}
          {entity.status === 'suspended' && (
            <button
              className="text-white border-none rounded py-0.5 px-2 text-[10px] font-semibold cursor-pointer bg-green-500"
              onClick={() => activateMut.mutate({ id: entity.id })}
              disabled={activateMut.isPending}
            >
              Reactivate
            </button>
          )}
        </div>
        {/* Expanded detail */}
        {expandedEntity === entity.id && (
          <div
            className="py-2 px-4 bg-bg-deep border-b border-border-dim text-xs"
            style={{ paddingLeft: 16 + depth * 24 }}
          >
            <div className="flex gap-4 mb-1.5">
              <span className="text-slate-500">
                Engines: {entity.enginesEnabled?.join(', ') || 'None'}
              </span>
              <span className="text-slate-500">
                Health:{' '}
                {entity.lastHealthCheck
                  ? new Date(entity.lastHealthCheck).toLocaleString()
                  : 'Never checked'}
              </span>
            </div>
            {entity.tier === 'mini_brain' && entity.domain && (
              <div className="text-slate-400 mb-1">Domain: {entity.domain}</div>
            )}
          </div>
        )}
        {/* Dev creation inline */}
        {devCreateTarget === entity.id && (
          <DevCreationForm
            domain={entity.domain ?? ''}
            devName={devName}
            devTemplate={devTemplate}
            onNameChange={setDevName}
            onTemplateChange={(t) => {
              setDevTemplate(t)
              if (t && !devName)
                setDevName(t.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
            }}
            onSubmit={() =>
              devName.trim() &&
              devCreateMut.mutate({
                name: devName.trim(),
                miniBrainId: entity.id,
                template: devTemplate || undefined,
              })
            }
            isPending={devCreateMut.isPending}
            depth={depth}
          />
        )}
        {/* Reprovision button for developments (available in any state for recovery) */}
        {entity.tier === 'development' && (
          <div className="pb-1 flex items-center gap-2" style={{ paddingLeft: 16 + depth * 24 }}>
            <button
              className="text-neon-blue border-none rounded py-0.5 px-2 text-[10px] font-semibold cursor-pointer"
              onClick={() => reprovisionMut.mutate({ entityId: entity.id })}
              disabled={reprovisionMut.isPending}
            >
              {reprovisionMut.isPending ? 'Provisioning...' : '↻ Reprovision Agents'}
            </button>
            {entity.status !== 'active' && (
              <span className="text-[10px] text-amber-400 font-semibold">Needs provisioning</span>
            )}
          </div>
        )}
        {children.map((child) => renderEntity(child, depth + 1))}
      </div>
    )
  }

  // Root entities (no parent)
  const rootEntities = allEntities.filter((e) => !e.parentId)

  return (
    <div className="p-6 font-sans text-slate-50">
      <div className="mb-5">
        <div className="flex justify-between items-center">
          <h2 className="m-0 text-[22px] font-bold font-orbitron">Brain Manager</h2>
          <button className="cyber-btn-primary" onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? 'Cancel' : '+ Create Entity'}
          </button>
        </div>
        <p className="mt-1 mb-0 text-[13px] text-slate-500">
          Manage the brain hierarchy — Brain → Mini-Brain → Development.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2.5 mb-5">
        <div className="cyber-card text-center">
          <div className="text-2xl font-bold" style={{ color: TIER_COLORS.brain }}>
            {brains.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Brains</div>
        </div>
        <div className="cyber-card text-center">
          <div className="text-2xl font-bold" style={{ color: TIER_COLORS.mini_brain }}>
            {miniBrains.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Mini-Brains</div>
        </div>
        <div className="cyber-card text-center">
          <div className="text-2xl font-bold" style={{ color: TIER_COLORS.development }}>
            {developments.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Developments</div>
        </div>
      </div>

      {/* Success Banner */}
      {createResult && (
        <div className="bg-emerald-950 border border-green-500 rounded-md py-2.5 px-3.5 mb-3 text-xs text-emerald-300">
          Mini-Brain &quot;{createResult.name}&quot; created with {createResult.agentCount} agents —
          workspace active!
          <button
            className="bg-transparent border-none text-emerald-300 cursor-pointer ml-2 text-[11px]"
            onClick={() => setCreateResult(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <div className="cyber-card mb-4">
          <div className="flex flex-col gap-2">
            <input
              className="cyber-input"
              placeholder="Mini-Brain name (e.g., Hotel Revenue AI)..."
              value={entityName}
              onChange={(e) => setEntityName(e.target.value)}
            />
            <select
              className="cyber-select"
              style={{ borderColor: selectedTemplate ? '#22c55e' : undefined }}
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
            >
              <option value="">Select a template (required)</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id.charAt(0).toUpperCase() + t.id.slice(1)} — {t.domain} ({t.agents.length}{' '}
                  agents, {t.engines.length} engines)
                </option>
              ))}
            </select>

            {/* Template Preview */}
            {selectedTemplate &&
              (() => {
                const tpl = templates.find((t) => t.id === selectedTemplate)
                if (!tpl) return null
                return (
                  <div className="bg-bg-deep rounded-md p-2.5 border border-border">
                    <div className="text-[11px] text-neon-purple font-bold mb-1.5">
                      Template Preview: {tpl.domain}
                    </div>
                    <div className="text-[11px] text-slate-500 mb-1">
                      Engines: {tpl.engines.join(' · ')}
                    </div>
                    <div className="text-[11px] text-slate-500 mb-1.5">
                      Agents ({tpl.agents.length}):
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {tpl.agents.map((a) => (
                        <span
                          key={a.name}
                          className="cyber-badge text-[10px]"
                          title={`${a.role} — ${a.capabilities.join(', ')}`}
                        >
                          {a.name}
                        </span>
                      ))}
                    </div>
                    {tpl.developmentTemplates.length > 0 && (
                      <div className="text-[10px] text-slate-600 mt-1.5">
                        Development variants: {tpl.developmentTemplates.join(', ')}
                      </div>
                    )}
                  </div>
                )
              })()}

            <button
              className="cyber-btn-primary bg-green-500 hover:bg-green-600"
              onClick={() =>
                entityName.trim() &&
                selectedTemplate &&
                createMut.mutate({
                  template: selectedTemplate as
                    | 'astrology'
                    | 'hospitality'
                    | 'healthcare'
                    | 'legal'
                    | 'marketing'
                    | 'soc-ops',
                  name: entityName.trim(),
                  parentId: brains[0]?.id,
                })
              }
              disabled={createMut.isPending || !entityName.trim() || !selectedTemplate}
            >
              {createMut.isPending ? 'Provisioning Mini-Brain...' : 'Create Mini-Brain'}
            </button>
            {createMut.error && (
              <div className="text-red-300 text-[11px]">{createMut.error.message}</div>
            )}
          </div>
        </div>
      )}

      {/* Hierarchy Tree */}
      <div className="mb-6">
        <div className="text-[13px] font-bold text-slate-400 mb-2.5 uppercase tracking-wide">
          Entity Hierarchy ({allEntities.length})
        </div>
        {allEntities.length === 0 ? (
          <div className="text-slate-600 text-[13px] text-center p-5">
            No brain entities yet. Create one to get started.
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden border border-border-dim">
            {rootEntities.map((e) => renderEntity(e, 0))}
          </div>
        )}
      </div>

      {/* Templates */}
      {templates.length > 0 && (
        <div className="mb-6">
          <div className="text-[13px] font-bold text-slate-400 mb-2.5 uppercase tracking-wide">
            Available Templates ({templates.length})
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2">
            {templates.map((t) => (
              <div key={t.id} className="bg-bg-deep rounded-md p-2.5 border border-border-dim">
                <div className="font-bold text-[13px] mb-1">
                  {t.id.charAt(0).toUpperCase() + t.id.slice(1)}
                </div>
                <div className="text-[11px] text-slate-500 mb-1">{t.domain} domain</div>
                <div className="flex gap-2 text-[10px] text-slate-600">
                  <span>Engines: {t.engines.length}</span>
                  <span>Agents: {t.agents.length}</span>
                  <span>Dev templates: {t.developmentTemplates.length}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Health & Healing */}
      <HealthSection />

      {/* Routes */}
      <RoutesSection />

      {/* Budget Summary */}
      <BudgetSection />
    </div>
  )
}

function HealthSection() {
  const healthQuery = trpc.systemOrchestrator.allWorkspacesHealth.useQuery()
  const healingQuery = trpc.healing.healingLog.useQuery({ limit: 10 })
  const monitorMut = trpc.systemOrchestrator.monitorHealth.useMutation()
  const autoHealMut = trpc.healing.autoHeal.useMutation({
    onSuccess: () => healingQuery.refetch(),
  })

  const healthData = (healthQuery.data ?? []) as Array<{
    workspaceId: string
    workspaceName: string
    agentCount: number
    idleAgents: number
    errorAgents: number
    hasOrchestrator: boolean
  }>
  const healingLog = (healingQuery.data ?? []) as unknown as Array<{
    id: string
    action: string
    target: string
    reason: string
    success: boolean
    createdAt: Date
  }>

  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-2.5">
        <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide">
          Health & Healing
        </div>
        <div className="flex gap-1.5">
          <button
            className="cyber-btn-secondary text-[10px]"
            onClick={() => monitorMut.mutate()}
            disabled={monitorMut.isPending}
          >
            {monitorMut.isPending ? 'Sweeping...' : 'Health Sweep'}
          </button>
          <button
            className="cyber-btn-primary bg-green-500 text-[10px]"
            onClick={() => autoHealMut.mutate()}
            disabled={autoHealMut.isPending}
          >
            {autoHealMut.isPending ? 'Healing...' : 'Auto-Heal'}
          </button>
        </div>
      </div>
      {monitorMut.data && (
        <div className="text-[11px] text-emerald-300 mb-2">
          Checked {(monitorMut.data as { workspacesChecked: number }).workspacesChecked} workspaces,{' '}
          {(monitorMut.data as { issues: unknown[] }).issues.length} issues found
        </div>
      )}
      {healthData.length > 0 && (
        <div className="flex flex-col gap-1 mb-3">
          {healthData.map((h) => (
            <div
              key={h.workspaceId}
              className="flex items-center gap-2 py-1 px-3 bg-bg-deep rounded text-xs"
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: h.errorAgents > 0 ? '#ef4444' : '#22c55e' }}
              />
              <span className="flex-1">{h.workspaceName}</span>
              <span className="text-slate-500">{h.agentCount} agents</span>
              <span className="text-neon-green">{h.idleAgents} idle</span>
              {h.errorAgents > 0 && <span className="text-neon-red">{h.errorAgents} error</span>}
              {!h.hasOrchestrator && <span className="text-orange-500">no orchestrator!</span>}
            </div>
          ))}
        </div>
      )}
      {healingLog.length > 0 && (
        <>
          <div className="text-[11px] text-slate-500 mb-1">Recent Healing Actions</div>
          <div className="flex flex-col gap-[3px]">
            {healingLog.map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-1.5 py-[3px] px-2.5 bg-bg-deep rounded-sm text-[11px]"
              >
                <span
                  className="w-[5px] h-[5px] rounded-full"
                  style={{ background: log.success ? '#22c55e' : '#ef4444' }}
                />
                <span className="flex-1 font-mono">{log.action}</span>
                <span className="text-slate-500">{log.target}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function RoutesSection() {
  const [showAddRoute, setShowAddRoute] = useState(false)
  const [fromWs, setFromWs] = useState('')
  const [toWs, setToWs] = useState('')
  const [rule, setRule] = useState('')
  const [priority, setPriority] = useState(0)

  const routesQuery = trpc.platform.routes.useQuery({})
  const wsQuery = trpc.workspaces.list.useQuery({ limit: 100, offset: 0 })
  const utils = trpc.useUtils()
  const addRouteMut = trpc.platform.addRoute.useMutation({
    onSuccess: () => {
      utils.platform.routes.invalidate()
      setShowAddRoute(false)
    },
  })
  const deleteRouteMut = trpc.platform.deleteRoute.useMutation({
    onSuccess: () => utils.platform.routes.invalidate(),
  })

  const routes = (routesQuery.data ?? []) as Array<{
    id: string
    fromWorkspace: string | null
    toWorkspace: string | null
    rule: string | null
    priority: number | null
  }>
  const workspaces = (wsQuery.data ?? []) as Array<{ id: string; name: string }>

  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-2.5">
        <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide">
          Cross-Workspace Routes ({routes.length})
        </div>
        <button
          className="cyber-btn-secondary text-[10px]"
          onClick={() => setShowAddRoute(!showAddRoute)}
        >
          {showAddRoute ? 'Cancel' : '+ Add Route'}
        </button>
      </div>
      {showAddRoute && (
        <div className="flex gap-1.5 mb-2.5 flex-wrap">
          <select
            className="cyber-select flex-1 min-w-[120px]"
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
            className="cyber-select flex-1 min-w-[120px]"
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
            className="cyber-input flex-1 min-w-[100px]"
            placeholder="Rule..."
            value={rule}
            onChange={(e) => setRule(e.target.value)}
          />
          <input
            className="cyber-input w-[60px]"
            type="number"
            placeholder="Priority"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
          />
          <button
            className="cyber-btn-primary bg-green-500 py-1 px-2.5"
            onClick={() =>
              fromWs &&
              toWs &&
              addRouteMut.mutate({
                fromWorkspace: fromWs,
                toWorkspace: toWs,
                rule: rule || '*',
                priority,
              })
            }
            disabled={!fromWs || !toWs || addRouteMut.isPending}
          >
            Add
          </button>
        </div>
      )}
      {routes.length === 0 ? (
        <div className="text-slate-600 text-xs text-center p-3">No routes configured.</div>
      ) : (
        <div className="flex flex-col gap-1">
          {routes.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2 py-1 px-3 bg-bg-deep rounded text-xs"
            >
              <span className="flex-1">
                {workspaces.find((w) => w.id === r.fromWorkspace)?.name ??
                  r.fromWorkspace?.slice(0, 8)}
                {' → '}
                {workspaces.find((w) => w.id === r.toWorkspace)?.name ?? r.toWorkspace?.slice(0, 8)}
              </span>
              {r.rule && <span className="text-slate-500 font-mono">{r.rule}</span>}
              <span className="text-slate-600">P{r.priority}</span>
              <button
                className="cyber-btn-danger text-[10px] py-px px-1.5"
                onClick={() => deleteRouteMut.mutate({ id: r.id })}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BudgetSection() {
  const budgetQuery = trpc.systemOrchestrator.budgetSummary.useQuery()
  const budget = budgetQuery.data as
    | {
        totalWorkspaces: number
        activeWorkspaces: number
        workspacesOverBudget: number
        budgetDetails: Array<{ entityId: string; entityName: string; spent: number; limit: number }>
      }
    | undefined

  return (
    <div className="mb-6">
      <div className="text-[13px] font-bold text-slate-400 mb-2.5 uppercase tracking-wide">
        System Budget
      </div>
      {!budget ? (
        <div className="text-slate-600 text-xs">Loading budget data...</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-bg-deep rounded-md p-2.5 text-center">
              <div className="text-lg font-bold text-neon-green">{budget.activeWorkspaces}</div>
              <div className="text-[10px] text-slate-500">Active</div>
            </div>
            <div className="bg-bg-deep rounded-md p-2.5 text-center">
              <div className="text-lg font-bold">{budget.totalWorkspaces}</div>
              <div className="text-[10px] text-slate-500">Total</div>
            </div>
            <div className="bg-bg-deep rounded-md p-2.5 text-center">
              <div
                className="text-lg font-bold"
                style={{ color: budget.workspacesOverBudget > 0 ? '#ef4444' : '#22c55e' }}
              >
                {budget.workspacesOverBudget}
              </div>
              <div className="text-[10px] text-slate-500">Over Budget</div>
            </div>
          </div>
          {budget.budgetDetails.length > 0 && (
            <div className="flex flex-col gap-[3px]">
              {budget.budgetDetails.map((d) => (
                <div
                  key={d.entityId}
                  className="flex items-center gap-2 py-1 px-2.5 bg-bg-deep rounded text-xs"
                >
                  <span className="flex-1">{d.entityName}</span>
                  <span style={{ color: d.spent > d.limit ? '#ef4444' : '#22c55e' }}>
                    ${d.spent.toFixed(4)}
                  </span>
                  <span className="text-slate-500">/ ${d.limit.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
