'use client'
import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatCard } from '../../../components/ui/stat-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

export default function AlertingPage() {
  const rulesQuery = trpc.alerting.getAlertRules.useQuery()
  const incidentsQuery = trpc.alerting.getActiveIncidents.useQuery()
  const rules = (rulesQuery.data ?? []) as Array<{
    id: string
    name: string
    serviceScope: string | null
    condition: string | null
    threshold: number | null
    severity: string
    enabled: boolean
  }>
  const incidents = (incidentsQuery.data ?? []) as Array<{
    id: string
    message: string | null
    severity: string
    status: string
    serviceName: string | null
    triggeredAt: Date
  }>

  const activeRules = rules.filter((r) => r.enabled)
  const openIncidents = incidents.filter((i) => i.status !== 'resolved')

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Alerting"
        subtitle="Alert rules, active incidents, and severity monitoring"
      />

      <PageGrid cols="3" className="mb-6">
        <StatCard label="Alert Rules" value={rules.length} sub={`${activeRules.length} active`} />
        <StatCard
          label="Open Incidents"
          value={openIncidents.length}
          color={openIncidents.length > 0 ? 'red' : 'green'}
          sub={openIncidents.length > 0 ? 'needs attention' : 'all clear'}
        />
        <StatCard label="Total Incidents" value={incidents.length} sub="all time" />
      </PageGrid>

      <PageGrid cols="2" gap="md">
        <SectionCard title="Alert Rules">
          {rules.length === 0 ? (
            <div className="text-xs text-slate-600 py-4 text-center">
              No alert rules configured.
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 px-3 py-2 bg-bg-elevated rounded"
                >
                  <span className={`neon-dot ${r.enabled ? 'neon-dot-green' : 'neon-dot-red'}`} />
                  <span className="text-xs font-medium flex-1">{r.name}</span>
                  <StatusBadge
                    label={r.severity}
                    color={
                      r.severity === 'critical' ? 'red' : r.severity === 'high' ? 'yellow' : 'blue'
                    }
                  />
                  <span className="text-[10px] text-slate-500">{r.serviceScope ?? 'global'}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Active Incidents">
          {openIncidents.length === 0 ? (
            <div className="text-xs text-neon-green py-4 text-center">
              No active incidents. All systems nominal.
            </div>
          ) : (
            <div className="space-y-2">
              {openIncidents.map((inc) => (
                <div
                  key={inc.id}
                  className="px-3 py-2 bg-bg-elevated rounded border-l-2 border-neon-red"
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge label={inc.severity} color="red" />
                    <span className="text-xs text-slate-400">{inc.serviceName ?? 'system'}</span>
                  </div>
                  <div className="text-xs text-slate-200 mt-1">{inc.message ?? 'No details'}</div>
                  <div className="text-[10px] text-slate-600 mt-1">
                    {new Date(inc.triggeredAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </PageGrid>
    </div>
  )
}
