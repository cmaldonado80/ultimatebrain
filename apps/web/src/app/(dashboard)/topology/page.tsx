'use client'
import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatCard } from '../../../components/ui/stat-card'
import { trpc } from '../../../utils/trpc'

export default function TopologyPage() {
  const topologyQuery = trpc.entities.topology.useQuery()
  const brain = (topologyQuery.data?.brain ?? []) as Array<{
    id: string
    name: string
    status: string
    domain: string | null
  }>
  const miniBrains = (topologyQuery.data?.miniBrains ?? []) as Array<{
    id: string
    name: string
    status: string
    domain: string | null
  }>
  const developments = (topologyQuery.data?.developments ?? []) as Array<{
    id: string
    name: string
    status: string
    domain: string | null
  }>

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="System Topology"
        subtitle="Three-tier architecture: Corporation → Departments → Products"
      />

      <PageGrid cols="3" className="mb-6">
        <StatCard
          label="Brain Entities"
          value={brain.length}
          color="purple"
          sub="Core orchestration"
        />
        <StatCard
          label="Departments"
          value={miniBrains.length}
          color="blue"
          sub="Domain specialists"
        />
        <StatCard
          label="Developments"
          value={developments.length}
          color="green"
          sub="Deployed apps"
        />
      </PageGrid>

      {/* Brain Tier */}
      <SectionCard title="Brain (Tier 1)" className="mb-4">
        {brain.length === 0 ? (
          <div className="text-xs text-slate-600 py-3 text-center">
            No corporation entity found. Initialize the system to provision.
          </div>
        ) : (
          <div className="space-y-2">
            {brain.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-3 py-2 bg-bg-elevated rounded">
                <span className="text-neon-purple">&#9733;</span>
                <span className="text-sm font-medium flex-1">{b.name}</span>
                <span className="text-[10px] text-slate-500">{b.domain ?? 'core'}</span>
                <span className="text-[9px] uppercase text-neon-green">{b.status}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Departments */}
      <SectionCard title="Departments (Tier 2)" className="mb-4">
        {miniBrains.length === 0 ? (
          <div className="text-xs text-slate-600 py-3 text-center">No departments.</div>
        ) : (
          <PageGrid cols="2">
            {miniBrains.map((mb) => (
              <div key={mb.id} className="cyber-card p-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`neon-dot ${mb.status === 'active' ? 'neon-dot-green' : 'neon-dot-yellow'}`}
                  />
                  <span className="text-sm font-medium">{mb.name}</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  {mb.domain ?? 'general'} &middot; {mb.status}
                </div>
              </div>
            ))}
          </PageGrid>
        )}
      </SectionCard>

      {/* Developments */}
      <SectionCard title="Developments (Tier 3)">
        {developments.length === 0 ? (
          <div className="text-xs text-slate-600 py-3 text-center">No products.</div>
        ) : (
          <PageGrid cols="3">
            {developments.map((dev) => (
              <div key={dev.id} className="cyber-card p-3">
                <span className="text-sm">{dev.name}</span>
                <div className="text-[10px] text-slate-500 mt-1">{dev.domain ?? 'general'}</div>
              </div>
            ))}
          </PageGrid>
        )}
      </SectionCard>
    </div>
  )
}
