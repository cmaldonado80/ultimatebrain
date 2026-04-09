'use client'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

export default function SecretsPage() {
  // Secrets require an entityId — show placeholder when none selected
  const topologyQuery = trpc.entities.topology.useQuery()
  const firstEntity = ((topologyQuery.data?.brain ?? []) as Array<{ id: string }>)[0]
  const secretsQuery = trpc.secrets.list.useQuery(
    { entityId: firstEntity?.id ?? '' },
    { enabled: !!firstEntity?.id },
  )
  const secrets = (secretsQuery.data ?? []) as Array<{
    id: string
    type: string
    status: string
    version: number
    keyPrefix: string | null
    createdAt: Date
    expiresAt: Date | null
  }>

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Secrets Management"
        subtitle="API keys, tokens, and credentials for departments and services"
      />

      <SectionCard title="Entity Secrets">
        {secrets.length === 0 ? (
          <div className="text-xs text-slate-600 py-4 text-center">No secrets configured.</div>
        ) : (
          <div className="space-y-2">
            {secrets.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2 bg-bg-elevated rounded">
                <span className="text-xs font-mono text-slate-400">{s.keyPrefix ?? '****'}...</span>
                <span className="text-xs flex-1">{s.type}</span>
                <StatusBadge
                  label={s.status}
                  color={
                    s.status === 'active' ? 'green' : s.status === 'revoked' ? 'red' : 'yellow'
                  }
                />
                <span className="text-[10px] text-slate-500">v{s.version}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
