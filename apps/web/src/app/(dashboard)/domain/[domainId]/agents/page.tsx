'use client'

/**
 * Mini Brain Agents — agents belonging to this Mini Brain's workspace.
 * Route: /domain/[domainId]/agents
 */

import Link from 'next/link'
import { useParams } from 'next/navigation'

import { DbErrorBanner } from '../../../../../components/db-error-banner'
import { EmptyState } from '../../../../../components/ui/empty-state'
import { LoadingState } from '../../../../../components/ui/loading-state'
import { PageHeader } from '../../../../../components/ui/page-header'
import { SectionCard } from '../../../../../components/ui/section-card'
import type { StatusColor } from '../../../../../components/ui/status-badge'
import { StatusBadge } from '../../../../../components/ui/status-badge'
import { trpc } from '../../../../../utils/trpc'

const STATUS_COLOR: Record<string, StatusColor> = {
  idle: 'green',
  executing: 'blue',
  planning: 'blue',
  reviewing: 'yellow',
  error: 'red',
  offline: 'slate',
}

export default function DomainAgentsPage() {
  const params = useParams()
  const domainId = params.domainId as string

  const topologyQuery = trpc.entities.topology.useQuery()
  const allEntities = [
    ...(topologyQuery.data?.miniBrains ?? []),
    ...(topologyQuery.data?.brain ?? []),
  ]
  const entity = allEntities.find(
    (e) => e.id === domainId || e.domain === domainId || e.name.toLowerCase() === domainId,
  )

  const agentsQuery = trpc.agents.list.useQuery({ limit: 100, offset: 0 })

  if (topologyQuery.error || agentsQuery.error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={topologyQuery.error ?? agentsQuery.error!} />
      </div>
    )
  }

  if (topologyQuery.isLoading || agentsQuery.isLoading) {
    return <LoadingState message="Loading agents..." />
  }

  if (!entity) {
    return (
      <div className="p-6">
        <EmptyState icon="◆" title="Domain not found" />
      </div>
    )
  }

  // Filter agents that belong to this domain's workspace
  // Since we don't have a direct entity→workspace link in the query,
  // filter by tags or description containing the domain
  const allAgents = (agentsQuery.data ?? []) as Array<{
    id: string
    name: string
    type: string | null
    status: string
    model: string | null
    description: string | null
    skills: string[] | null
    tags: string[] | null
    workspaceId: string | null
  }>

  const domainAgents = allAgents.filter(
    (a) =>
      a.tags?.includes(entity.domain ?? '') ||
      a.tags?.includes(entity.name.toLowerCase()) ||
      a.description?.toLowerCase().includes(entity.domain ?? '') ||
      a.description?.toLowerCase().includes(`[${entity.id.slice(0, 8)}]`),
  )

  return (
    <div className="p-6 text-slate-50 max-w-[900px]">
      <PageHeader
        title={`${entity.name} Agents`}
        subtitle={`Agents serving the ${entity.domain ?? entity.name} domain`}
        count={domainAgents.length}
      />

      {domainAgents.length === 0 ? (
        <EmptyState
          icon="⬡"
          title="No domain agents found"
          message="Agents are created when the Mini Brain is provisioned. Check the Brain Manager."
          action={{ label: 'Brain Manager', href: `/engines/manage/${entity.id}` }}
        />
      ) : (
        <div className="space-y-2">
          {domainAgents.map((agent) => (
            <SectionCard key={agent.id} padding="sm">
              <div className="flex items-center gap-3">
                <StatusBadge
                  label={agent.status}
                  color={STATUS_COLOR[agent.status] ?? 'slate'}
                  dot
                  pulse={agent.status === 'executing'}
                />
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/agents/${agent.id}`}
                    className="text-sm text-slate-200 font-medium no-underline hover:text-neon-teal transition-colors"
                  >
                    {agent.name}
                  </Link>
                  <div className="text-[10px] text-slate-500">
                    {agent.type ?? 'agent'} · {agent.model ?? 'auto'}
                  </div>
                </div>
                {agent.skills && agent.skills.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {agent.skills.slice(0, 3).map((s) => (
                      <span
                        key={s}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-500"
                      >
                        {s}
                      </span>
                    ))}
                    {agent.skills.length > 3 && (
                      <span className="text-[9px] text-slate-600">+{agent.skills.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  )
}
