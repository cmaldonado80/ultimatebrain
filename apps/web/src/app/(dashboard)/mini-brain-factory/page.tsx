'use client'

import Link from 'next/link'
import { useState } from 'react'

import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatCard } from '../../../components/ui/stat-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

const TEMPLATES = ['astrology', 'hospitality', 'healthcare', 'marketing', 'soc-ops'] as const
const TEMPLATE_ICONS: Record<string, string> = {
  astrology: '☉',
  hospitality: '🏨',
  healthcare: '🏥',
  marketing: '📣',
  'soc-ops': '🛡',
}
const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  astrology: 'Natal charts, transits, synastry, Vedic astrology, predictive timing',
  hospitality: 'Hotel management, revenue optimization, guest experience',
  healthcare: 'Patient records, clinical decision support, compliance',
  marketing: 'Campaign management, audience targeting, analytics',
  'soc-ops': 'Security operations, threat detection, incident response',
}

export default function MiniBrainFactoryPage() {
  const utils = trpc.useUtils()
  const topologyQuery = trpc.entities.topology.useQuery()

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
  const [createTemplate, setCreateTemplate] = useState<string>(TEMPLATES[0])
  const [createError, setCreateError] = useState('')
  const [createSuccess, setCreateSuccess] = useState('')

  const smartCreateMutation = trpc.factory.smartCreate.useMutation({
    onSuccess: () => {
      setCreateSuccess(`Mini Brain "${createName}" created successfully!`)
      setCreateName('')
      setCreateError('')
      utils.entities.topology.invalidate()
    },
    onError: (err) => {
      setCreateError(err.message)
      setCreateSuccess('')
    },
  })

  // Create Development App
  const [devName, setDevName] = useState('')
  const [devParentId, setDevParentId] = useState('')
  const [devTemplate, setDevTemplate] = useState('')

  const smartCreateDevMutation = trpc.factory.smartCreateDevelopment.useMutation({
    onSuccess: () => {
      setDevName('')
      setDevTemplate('')
      utils.entities.topology.invalidate()
    },
  })

  // Regenerate API key
  const regenKeyMutation = trpc.factory.regenerateEntityApiKey.useMutation()

  // Reprovision agents
  const reprovisionMutation = trpc.factory.reprovisionAgents.useMutation({
    onSuccess: () => utils.entities.topology.invalidate(),
  })

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
          value={TEMPLATES.length}
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
                {TEMPLATES.map((t) => (
                  <option key={t} value={t}>
                    {TEMPLATE_ICONS[t]} {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  if (!createName.trim()) return
                  smartCreateMutation.mutate({
                    name: createName.trim(),
                    template: createTemplate as (typeof TEMPLATES)[number],
                  })
                }}
                disabled={smartCreateMutation.isPending || !createName.trim()}
                className="cyber-btn-primary cyber-btn-sm w-full disabled:opacity-50"
              >
                {smartCreateMutation.isPending ? 'Creating...' : 'Create Mini Brain'}
              </button>
            </div>
          </div>
          {createError && <div className="text-xs text-neon-red">{createError}</div>}
          {createSuccess && <div className="text-xs text-neon-green">{createSuccess}</div>}
          <div className="text-[10px] text-slate-600">
            Creates: Brain Entity + Workspace + Orchestrator Agent + Template Agents + Binding.
            Fully provisioned in one click.
          </div>
        </div>
      </SectionCard>

      {/* Templates */}
      <SectionCard title="Available Templates" className="mb-6">
        <PageGrid cols="3">
          {TEMPLATES.map((t) => (
            <div
              key={t}
              className={`cyber-card p-3 cursor-pointer transition-colors ${createTemplate === t ? 'border-neon-teal' : ''}`}
              onClick={() => setCreateTemplate(t)}
            >
              <div className="text-2xl mb-1">{TEMPLATE_ICONS[t]}</div>
              <div className="text-sm font-medium capitalize">{t}</div>
              <div className="text-[10px] text-slate-500 mt-1">{TEMPLATE_DESCRIPTIONS[t]}</div>
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
                            : 'blue'
                      }
                    />
                    <div className="flex gap-1">
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
                    </div>
                  </div>

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
                        </div>
                      ))}
                    </div>
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
