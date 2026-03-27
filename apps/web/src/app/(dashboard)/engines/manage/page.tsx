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
      style={{
        padding: '8px 16px',
        paddingLeft: 16 + depth * 24,
        background: '#0d1117',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        gap: 6,
        alignItems: 'center',
      }}
    >
      {devTemplates.length > 0 && (
        <select
          style={{
            background: 'var(--color-bg-elevated)',
            color: '#d1d5db',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            padding: '4px 6px',
            fontSize: 11,
          }}
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
        style={{
          background: 'var(--color-bg-elevated)',
          color: '#f9fafb',
          border: '1px solid var(--color-border)',
          borderRadius: 4,
          padding: '4px 8px',
          fontSize: 11,
          flex: 1,
        }}
        placeholder="Development name..."
        value={devName}
        onChange={(e) => onNameChange(e.target.value)}
      />
      <button
        style={{
          background: 'var(--color-neon-green)',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
        }}
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
      <div style={styles.page}>
        <DbErrorBanner error={error} />
      </div>
    )
  }

  const isLoading = entitiesQuery.isLoading || miniBrainsQuery.isLoading
  if (isLoading) {
    return (
      <div
        style={{
          ...styles.page,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
        }}
      >
        <div style={{ textAlign: 'center', color: '#6b7280' }}>Loading brain hierarchy...</div>
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
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            paddingLeft: 12 + depth * 24,
            background: depth % 2 === 0 ? '#1f2937' : '#111827',
            borderBottom: '1px solid #374151',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: statusColor,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontWeight: 700,
              fontSize: 13,
              flex: 1,
              cursor: 'pointer',
              borderBottom: expandedEntity === entity.id ? '2px solid #818cf8' : 'none',
            }}
            onClick={() => setExpandedEntity(expandedEntity === entity.id ? null : entity.id)}
            title="Click to expand"
          >
            {entity.name}
          </span>
          <Link
            href={`/engines/manage/${entity.id}`}
            style={{ fontSize: 10, color: '#818cf8', textDecoration: 'none' }}
            onClick={(e) => e.stopPropagation()}
            title="View detail"
          >
            →
          </Link>
          {entity.tier === 'mini_brain' && (
            <button
              style={{ ...styles.btnSmall, background: '#eab308', color: '#000', fontSize: 9 }}
              onClick={(e) => {
                e.stopPropagation()
                setDevCreateTarget(devCreateTarget === entity.id ? null : entity.id)
              }}
            >
              + Dev
            </button>
          )}
          <span
            style={{
              fontSize: 10,
              background: tierColor + '20',
              color: tierColor,
              padding: '1px 8px',
              borderRadius: 3,
              fontWeight: 600,
            }}
          >
            {entity.tier.replace('_', ' ')}
          </span>
          {entity.domain && <span style={{ fontSize: 10, color: '#6b7280' }}>{entity.domain}</span>}
          <span style={{ fontSize: 10, color: statusColor, fontWeight: 600 }}>{entity.status}</span>
          {entity.status === 'provisioning' && (
            <button
              style={{ ...styles.btnSmall, background: '#22c55e' }}
              onClick={() => activateMut.mutate({ id: entity.id })}
              disabled={activateMut.isPending}
            >
              Activate
            </button>
          )}
          {entity.status === 'active' && (
            <button
              style={{ ...styles.btnSmall, background: '#ef4444' }}
              onClick={() => suspendMut.mutate({ id: entity.id })}
              disabled={suspendMut.isPending}
            >
              Suspend
            </button>
          )}
          {entity.status === 'suspended' && (
            <button
              style={{ ...styles.btnSmall, background: '#22c55e' }}
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
            style={{
              padding: '8px 16px',
              paddingLeft: 16 + depth * 24,
              background: '#0d1117',
              borderBottom: '1px solid #374151',
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', gap: 16, marginBottom: 6 }}>
              <span style={{ color: '#6b7280' }}>
                Engines: {entity.enginesEnabled?.join(', ') || 'None'}
              </span>
              <span style={{ color: '#6b7280' }}>
                Health:{' '}
                {entity.lastHealthCheck
                  ? new Date(entity.lastHealthCheck).toLocaleString()
                  : 'Never checked'}
              </span>
            </div>
            {entity.tier === 'mini_brain' && entity.domain && (
              <div style={{ color: '#9ca3af', marginBottom: 4 }}>Domain: {entity.domain}</div>
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
          <div
            style={{
              paddingLeft: 16 + depth * 24,
              paddingBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <button
              style={{ ...styles.btnSmall, fontSize: 10, color: 'var(--color-neon-blue)' }}
              onClick={() => reprovisionMut.mutate({ entityId: entity.id })}
              disabled={reprovisionMut.isPending}
            >
              {reprovisionMut.isPending ? 'Provisioning...' : '↻ Reprovision Agents'}
            </button>
            {entity.status !== 'active' && (
              <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>
                Needs provisioning
              </span>
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
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={styles.title}>Brain Manager</h2>
          <button style={styles.btnPrimary} onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? 'Cancel' : '+ Create Entity'}
          </button>
        </div>
        <p style={styles.subtitle}>
          Manage the brain hierarchy — Brain → Mini-Brain → Development.
        </p>
      </div>

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          marginBottom: 20,
        }}
      >
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: TIER_COLORS.brain }}>{brains.length}</div>
          <div style={styles.statLabel}>Brains</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: TIER_COLORS.mini_brain }}>
            {miniBrains.length}
          </div>
          <div style={styles.statLabel}>Mini-Brains</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: TIER_COLORS.development }}>
            {developments.length}
          </div>
          <div style={styles.statLabel}>Developments</div>
        </div>
      </div>

      {/* Success Banner */}
      {createResult && (
        <div
          style={{
            background: '#064e3b',
            border: '1px solid #22c55e',
            borderRadius: 6,
            padding: '10px 14px',
            marginBottom: 12,
            fontSize: 12,
            color: '#6ee7b7',
          }}
        >
          Mini-Brain &quot;{createResult.name}&quot; created with {createResult.agentCount} agents —
          workspace active!
          <button
            style={{
              background: 'none',
              border: 'none',
              color: '#6ee7b7',
              cursor: 'pointer',
              marginLeft: 8,
              fontSize: 11,
            }}
            onClick={() => setCreateResult(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <div style={styles.formCard}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            <input
              style={styles.input}
              placeholder="Mini-Brain name (e.g., Hotel Revenue AI)..."
              value={entityName}
              onChange={(e) => setEntityName(e.target.value)}
            />
            <select
              style={{ ...styles.select, borderColor: selectedTemplate ? '#22c55e' : '#374151' }}
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
                  <div
                    style={{
                      background: '#0d1117',
                      borderRadius: 6,
                      padding: 10,
                      border: '1px solid #1e3a5f',
                    }}
                  >
                    <div
                      style={{ fontSize: 11, color: '#818cf8', fontWeight: 700, marginBottom: 6 }}
                    >
                      Template Preview: {tpl.domain}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
                      Engines: {tpl.engines.join(' · ')}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>
                      Agents ({tpl.agents.length}):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
                      {tpl.agents.map((a) => (
                        <span
                          key={a.name}
                          style={{
                            fontSize: 10,
                            background: '#1e1b4b',
                            color: '#818cf8',
                            padding: '2px 6px',
                            borderRadius: 3,
                          }}
                          title={`${a.role} — ${a.capabilities.join(', ')}`}
                        >
                          {a.name}
                        </span>
                      ))}
                    </div>
                    {tpl.developmentTemplates.length > 0 && (
                      <div style={{ fontSize: 10, color: '#4b5563', marginTop: 6 }}>
                        Development variants: {tpl.developmentTemplates.join(', ')}
                      </div>
                    )}
                  </div>
                )
              })()}

            <button
              style={styles.btnCreate}
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
              <div style={{ color: '#fca5a5', fontSize: 11 }}>{createMut.error.message}</div>
            )}
          </div>
        </div>
      )}

      {/* Hierarchy Tree */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Entity Hierarchy ({allEntities.length})</div>
        {allEntities.length === 0 ? (
          <div
            style={{ color: '#4b5563', fontSize: 13, textAlign: 'center' as const, padding: 20 }}
          >
            No brain entities yet. Create one to get started.
          </div>
        ) : (
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #374151' }}>
            {rootEntities.map((e) => renderEntity(e, 0))}
          </div>
        )}
      </div>

      {/* Templates */}
      {templates.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Available Templates ({templates.length})</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: 8,
            }}
          >
            {templates.map((t) => (
              <div
                key={t.id}
                style={{
                  background: '#111827',
                  borderRadius: 6,
                  padding: 10,
                  border: '1px solid #374151',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                  {t.id.charAt(0).toUpperCase() + t.id.slice(1)}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
                  {t.domain} domain
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#4b5563' }}>
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
    <div style={styles.section}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <div style={styles.sectionTitle}>Health & Healing</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            style={{ ...styles.btnSmall, background: '#818cf8' }}
            onClick={() => monitorMut.mutate()}
            disabled={monitorMut.isPending}
          >
            {monitorMut.isPending ? 'Sweeping...' : 'Health Sweep'}
          </button>
          <button
            style={{ ...styles.btnSmall, background: '#22c55e' }}
            onClick={() => autoHealMut.mutate()}
            disabled={autoHealMut.isPending}
          >
            {autoHealMut.isPending ? 'Healing...' : 'Auto-Heal'}
          </button>
        </div>
      </div>
      {monitorMut.data && (
        <div style={{ fontSize: 11, color: '#6ee7b7', marginBottom: 8 }}>
          Checked {(monitorMut.data as { workspacesChecked: number }).workspacesChecked} workspaces,{' '}
          {(monitorMut.data as { issues: unknown[] }).issues.length} issues found
        </div>
      )}
      {healthData.length > 0 && (
        <div
          style={{ display: 'flex', flexDirection: 'column' as const, gap: 4, marginBottom: 12 }}
        >
          {healthData.map((h) => (
            <div
              key={h.workspaceId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 12px',
                background: '#111827',
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: h.errorAgents > 0 ? '#ef4444' : '#22c55e',
                }}
              />
              <span style={{ flex: 1 }}>{h.workspaceName}</span>
              <span style={{ color: '#6b7280' }}>{h.agentCount} agents</span>
              <span style={{ color: '#22c55e' }}>{h.idleAgents} idle</span>
              {h.errorAgents > 0 && <span style={{ color: '#ef4444' }}>{h.errorAgents} error</span>}
              {!h.hasOrchestrator && <span style={{ color: '#f97316' }}>no orchestrator!</span>}
            </div>
          ))}
        </div>
      )}
      {healingLog.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
            Recent Healing Actions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 3 }}>
            {healingLog.map((log) => (
              <div
                key={log.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 10px',
                  background: '#111827',
                  borderRadius: 3,
                  fontSize: 11,
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: log.success ? '#22c55e' : '#ef4444',
                  }}
                />
                <span style={{ flex: 1, fontFamily: 'monospace' }}>{log.action}</span>
                <span style={{ color: '#6b7280' }}>{log.target}</span>
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
    <div style={styles.section}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <div style={styles.sectionTitle}>Cross-Workspace Routes ({routes.length})</div>
        <button style={styles.btnSmall} onClick={() => setShowAddRoute(!showAddRoute)}>
          {showAddRoute ? 'Cancel' : '+ Add Route'}
        </button>
      </div>
      {showAddRoute && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' as const }}>
          <select
            style={{ ...styles.select, flex: 1, minWidth: 120 }}
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
            style={{ ...styles.select, flex: 1, minWidth: 120 }}
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
            style={{ ...styles.input, flex: 1, minWidth: 100 }}
            placeholder="Rule..."
            value={rule}
            onChange={(e) => setRule(e.target.value)}
          />
          <input
            style={{ ...styles.input, width: 60 }}
            type="number"
            placeholder="Priority"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
          />
          <button
            style={{ ...styles.btnCreate, padding: '4px 10px' }}
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
        <div style={{ color: '#4b5563', fontSize: 12, textAlign: 'center' as const, padding: 12 }}>
          No routes configured.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
          {routes.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 12px',
                background: '#111827',
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              <span style={{ flex: 1 }}>
                {workspaces.find((w) => w.id === r.fromWorkspace)?.name ??
                  r.fromWorkspace?.slice(0, 8)}
                {' → '}
                {workspaces.find((w) => w.id === r.toWorkspace)?.name ?? r.toWorkspace?.slice(0, 8)}
              </span>
              {r.rule && (
                <span style={{ color: '#6b7280', fontFamily: 'monospace' }}>{r.rule}</span>
              )}
              <span style={{ color: '#4b5563' }}>P{r.priority}</span>
              <button
                style={{ ...styles.btnSmall, background: '#ef4444', padding: '1px 6px' }}
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
    <div style={styles.section}>
      <div style={styles.sectionTitle}>System Budget</div>
      {!budget ? (
        <div style={{ color: '#4b5563', fontSize: 12 }}>Loading budget data...</div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                background: '#111827',
                borderRadius: 6,
                padding: 10,
                textAlign: 'center' as const,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, color: '#22c55e' }}>
                {budget.activeWorkspaces}
              </div>
              <div style={{ fontSize: 10, color: '#6b7280' }}>Active</div>
            </div>
            <div
              style={{
                background: '#111827',
                borderRadius: 6,
                padding: 10,
                textAlign: 'center' as const,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700 }}>{budget.totalWorkspaces}</div>
              <div style={{ fontSize: 10, color: '#6b7280' }}>Total</div>
            </div>
            <div
              style={{
                background: '#111827',
                borderRadius: 6,
                padding: 10,
                textAlign: 'center' as const,
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: budget.workspacesOverBudget > 0 ? '#ef4444' : '#22c55e',
                }}
              >
                {budget.workspacesOverBudget}
              </div>
              <div style={{ fontSize: 10, color: '#6b7280' }}>Over Budget</div>
            </div>
          </div>
          {budget.budgetDetails.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 3 }}>
              {budget.budgetDetails.map((d) => (
                <div
                  key={d.entityId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 10px',
                    background: '#111827',
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                >
                  <span style={{ flex: 1 }}>{d.entityName}</span>
                  <span style={{ color: d.spent > d.limit ? '#ef4444' : '#22c55e' }}>
                    ${d.spent.toFixed(4)}
                  </span>
                  <span style={{ color: '#6b7280' }}>/ ${d.limit.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

const styles = {
  page: { padding: 24, fontFamily: 'sans-serif', color: '#f9fafb' },
  header: { marginBottom: 20 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  statCard: {
    background: '#1f2937',
    borderRadius: 8,
    padding: 14,
    border: '1px solid #374151',
    textAlign: 'center' as const,
  },
  statValue: { fontSize: 24, fontWeight: 700 },
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#9ca3af',
    marginBottom: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  formCard: {
    background: '#1f2937',
    borderRadius: 8,
    padding: 16,
    border: '1px solid #374151',
    marginBottom: 16,
  },
  input: {
    background: '#111827',
    color: '#f9fafb',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 13,
  },
  select: {
    background: '#111827',
    color: '#f9fafb',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    flex: 1,
  },
  btnPrimary: {
    background: '#818cf8',
    color: '#f9fafb',
    border: 'none',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnCreate: {
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnSmall: {
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 10,
    fontWeight: 600,
    cursor: 'pointer',
  },
}
