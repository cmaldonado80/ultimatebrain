'use client'

/**
 * Single App View — detailed dashboard for a connected agent
 *
 * Shows: agent info, model, skills, tags, etc.
 */

import Link from 'next/link'
import { useParams } from 'next/navigation'

import { DbErrorBanner } from '../../../../components/db-error-banner'
import { LoadingState } from '../../../../components/ui/loading-state'
import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { trpc } from '../../../../lib/trpc'

/** Row shape returned by `trpc.agents.byId` (drizzle `agents` table select) */
interface AgentRecord {
  id: string
  name: string
  type: string | null
  workspaceId: string | null
  status: string
  model: string | null
  color: string | null
  bg: string | null
  description: string | null
  tags: string[] | null
  skills: string[] | null
  isWsOrchestrator: boolean | null
  triggerMode: string | null
  createdAt: Date
  updatedAt: Date
}

export default function AppDetailPage() {
  const params = useParams()
  const appId = params.appId as string

  const { data: app, isLoading, error } = trpc.agents.byId.useQuery({ id: appId })

  if (error) {
    return (
      <div className="text-slate-50 p-6">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="text-slate-50 p-6">
        <LoadingState message="Loading app..." />
      </div>
    )
  }

  if (!app && !error) {
    return (
      <div className="text-slate-50 p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-red-400">
          <div className="text-lg font-bold mb-2">App not found</div>
          <div className="text-[13px] text-slate-400">No agent with ID {appId}</div>
        </div>
      </div>
    )
  }

  const agent = (app as AgentRecord) ?? ({} as Partial<AgentRecord>)
  const agentName = agent.name ?? `Agent ${appId.slice(0, 8)}`
  const agentType = agent.type ?? 'agent'
  const agentDescription = agent.description ?? ''
  const agentModel = agent.model ?? 'N/A'
  const agentSkills: string[] = agent.skills ?? []
  const agentTags: string[] = agent.tags ?? []

  return (
    <div className="text-slate-50 p-6">
      {/* Header */}
      <div className="mb-5">
        <Link href="/apps" className="text-xs text-slate-500 no-underline block mb-2">
          ← Apps
        </Link>
        <PageHeader title={agentName} />
        <div className="flex gap-2 items-center">
          <span className="cyber-badge bg-[#1e3a5f] text-blue-300 font-semibold">{agentType}</span>
          {agentDescription && <span className="text-xs text-slate-500">{agentDescription}</span>}
        </div>
      </div>

      {/* Stats row */}
      <PageGrid cols="4" className="mb-5">
        <StatCard label="Model" value={agentModel} />
        <StatCard label="Skills" value={agentSkills.length} />
        <StatCard label="Tags" value={agentTags.length} />
        <StatCard label="Type" value={agentType} />
      </PageGrid>

      <div className="grid grid-cols-[1fr_320px] gap-4">
        {/* Left: Skills */}
        <div>
          <SectionCard title="Skills" className="mb-3">
            {agentSkills.length === 0 ? (
              <div className="text-xs text-slate-600 text-center p-4">No skills assigned</div>
            ) : (
              agentSkills.map((skill) => (
                <div
                  key={skill}
                  className="flex items-center gap-2 py-1.5 border-b border-gray-900 text-xs"
                >
                  <span className="neon-dot neon-dot-green" />
                  <span className="flex-1 font-semibold">{skill}</span>
                </div>
              ))
            )}
          </SectionCard>
        </div>

        {/* Right: Tags & Details */}
        <div>
          <SectionCard title="Tags" className="mb-3">
            {agentTags.length === 0 ? (
              <div className="text-xs text-slate-600 text-center p-4">No tags</div>
            ) : (
              <div className="flex gap-1.5 flex-wrap">
                {agentTags.map((tag) => (
                  <span key={tag} className="cyber-badge bg-slate-700 text-slate-400">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Details" className="mb-3">
            <div className="flex gap-2 py-1 text-xs border-b border-gray-900">
              <span className="text-slate-500 min-w-[80px]">ID:</span>
              <span className="text-slate-300 font-mono text-[11px] break-all">{appId}</span>
            </div>
            {agent.workspaceId && (
              <div className="flex gap-2 py-1 text-xs border-b border-gray-900">
                <span className="text-slate-500 min-w-[80px]">Workspace:</span>
                <span className="text-slate-300 font-mono text-[11px] break-all">
                  {agent.workspaceId}
                </span>
              </div>
            )}
            {agent.createdAt && (
              <div className="flex gap-2 py-1 text-xs border-b border-gray-900">
                <span className="text-slate-500 min-w-[80px]">Created:</span>
                <span className="text-slate-300 font-mono text-[11px] break-all">
                  {new Date(agent.createdAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
