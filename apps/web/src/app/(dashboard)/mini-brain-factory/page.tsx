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
}

export default function MiniBrainFactoryPage() {
  const utils = trpc.useUtils()
  const topologyQuery = trpc.entities.topology.useQuery()
  const templatesQuery = trpc.factory.templates.useQuery()

  const templates = (templatesQuery.data ?? []) as Array<{
    id: string
    domain: string
    engines: string[]
    agents: Array<{ name: string; role: string }>
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

  // Database provisioning
  const provisionDbMutation = trpc.factory.provisionDatabase.useMutation({
    onSuccess: () => utils.entities.topology.invalidate(),
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

  // Dev templates for selected mini brain domain
  const getDevTemplatesForDomain = (domain: string | null) => {
    if (!domain) return []
    const tpl = templates.find((t) => t.id === domain)
    return tpl?.developmentTemplates ?? []
  }

  if (topologyQuery.isLoading || templatesQuery.isLoading) {
    return <LoadingState message="Loading Mini Brain Factory..." />
  }

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Mini Brain Factory"
        subtitle="Provision, manage, and deploy mini brains and development apps"
      />

      {/* Stats */}
      <PageGrid cols="3" className="mb-6">
        <StatCard
          label="Mini Brains"
          value={miniBrains.length}
          color="purple"
          sub="Domain specialists"
        />
        <StatCard
          label="Development Apps"
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
      </PageGrid>

      {/* Create Mini Brain */}
      <SectionCard title="Create Mini Brain" className="mb-6">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 uppercase block mb-1">Name</label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="My Astrology Brain"
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
                {smartCreateMutation.isPending ? 'Creating...' : 'Create Mini Brain'}
              </button>
            </div>
          </div>
          {createError && <div className="text-xs text-neon-red">{createError}</div>}
          {createResult && (
            <div className="bg-neon-green/10 border border-neon-green/30 rounded p-3 space-y-2">
              <div className="text-xs text-neon-green font-medium">
                Mini Brain created with {createResult.agentCount} agents!
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
          {templates.map((t) => (
            <div
              key={t.id}
              className={`cyber-card p-3 cursor-pointer transition-colors ${createTemplate === t.id ? 'border-neon-teal' : ''}`}
              onClick={() => setCreateTemplate(t.id)}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{TEMPLATE_ICONS[t.id] ?? '◆'}</span>
                <div>
                  <div className="text-sm font-medium capitalize">{t.id}</div>
                  <div className="text-[10px] text-slate-500">{t.domain}</div>
                </div>
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
                  {t.developmentTemplates.length}
                </div>
                <div>
                  <span className="text-slate-500">DB Tables:</span> {t.dbTables.length}
                </div>
              </div>
            </div>
          ))}
        </PageGrid>
      </SectionCard>

      {/* Active Mini Brains */}
      <SectionCard title="Active Mini Brains" className="mb-6">
        {miniBrains.length === 0 ? (
          <div className="text-xs text-slate-600 py-6 text-center">
            No mini brains provisioned yet. Use the form above to create one.
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
                          title="Suspend this mini brain"
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
                          title="Activate this mini brain"
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
                      <button
                        onClick={() => provisionDbMutation.mutate({ entityId: mb.id })}
                        disabled={provisionDbMutation.isPending}
                        className="cyber-btn-secondary text-[9px] px-2 py-0.5 text-neon-blue"
                        title="Provision Neon database branch"
                      >
                        {provisionDbMutation.isPending ? '...' : 'Provision DB'}
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
                          title="Delete this mini brain"
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

                  {/* Provision DB feedback */}
                  {provisionDbMutation.isError && (
                    <div className="text-[10px] text-neon-red ml-8 mb-2">
                      DB provisioning failed: {provisionDbMutation.error.message}
                    </div>
                  )}
                  {provisionDbMutation.isSuccess && (
                    <div className="text-[10px] text-neon-green ml-8 mb-2">
                      Database provisioned successfully
                    </div>
                  )}

                  {/* Development Apps for this Mini Brain */}
                  {mbDevs.length > 0 && (
                    <div className="ml-8 mt-2 space-y-1">
                      <div className="text-[10px] text-slate-500 uppercase">Development Apps</div>
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

                  {/* Quick Create Development */}
                  <div className="ml-8 mt-2 flex gap-2">
                    <input
                      type="text"
                      placeholder="New development app name..."
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
                      {smartCreateDevMutation.isPending ? '...' : '+ Dev App'}
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
