'use client'
import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { trpc } from '../../../utils/trpc'

export default function MiniBrainFactoryPage() {
  const topologyQuery = trpc.entities.topology.useQuery()
  const templatesQuery = trpc.factory.templates.useQuery(undefined as never)

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
  }>
  const templates = (templatesQuery.data ?? []) as unknown as Array<{
    id: string
    name: string
    description: string
  }>

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Mini Brain Factory"
        subtitle="Provision, manage, and deploy mini brains and development apps"
      />

      <PageGrid cols="3" className="mb-6">
        <SectionCard padding="sm">
          <div className="text-[10px] text-slate-500 uppercase">Mini Brains</div>
          <div className="text-2xl font-mono text-neon-purple">{miniBrains.length}</div>
        </SectionCard>
        <SectionCard padding="sm">
          <div className="text-[10px] text-slate-500 uppercase">Developments</div>
          <div className="text-2xl font-mono text-neon-blue">{developments.length}</div>
        </SectionCard>
        <SectionCard padding="sm">
          <div className="text-[10px] text-slate-500 uppercase">Templates</div>
          <div className="text-2xl font-mono text-neon-teal">{templates.length}</div>
        </SectionCard>
      </PageGrid>

      <SectionCard title="Active Mini Brains" className="mb-6">
        {miniBrains.length === 0 ? (
          <div className="text-xs text-slate-600 py-4 text-center">
            No mini brains provisioned yet.
          </div>
        ) : (
          <div className="space-y-2">
            {miniBrains.map((mb) => (
              <div key={mb.id} className="flex items-center gap-3 px-3 py-2 bg-bg-elevated rounded">
                <span
                  className={`neon-dot ${mb.status === 'active' ? 'neon-dot-green' : 'neon-dot-yellow'}`}
                />
                <span className="text-sm font-medium flex-1">{mb.name}</span>
                <span className="text-[10px] text-slate-500">{mb.domain ?? 'general'}</span>
                <span className="text-[9px] text-slate-600 uppercase">{mb.status}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Development Apps">
        {developments.length === 0 ? (
          <div className="text-xs text-slate-600 py-4 text-center">
            No development apps deployed.
          </div>
        ) : (
          <div className="space-y-2">
            {developments.map((dev) => (
              <div
                key={dev.id}
                className="flex items-center gap-3 px-3 py-2 bg-bg-elevated rounded"
              >
                <span className="text-sm flex-1">{dev.name}</span>
                <span className="text-[10px] text-slate-500">{dev.domain ?? 'general'}</span>
                <span className="text-[9px] text-slate-600 uppercase">{dev.status}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
