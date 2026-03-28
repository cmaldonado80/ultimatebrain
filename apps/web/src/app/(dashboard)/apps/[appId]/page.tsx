'use client'

/**
 * Single App View — detailed dashboard for a connected agent
 *
 * Shows: agent info, model, skills, tags, etc.
 */

import Link from 'next/link'
import { useParams } from 'next/navigation'

import { DbErrorBanner } from '../../../../components/db-error-banner'
import { trpc } from '../../../../utils/trpc'

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
      <div className="text-slate-50 p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-500">
          <div className="text-2xl mb-2">Loading...</div>
          <div className="text-[13px]">Fetching app details</div>
        </div>
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
        <div className="flex justify-between items-start">
          <div>
            <h1 className="m-0 mb-1.5 text-[22px] font-bold">{agentName}</h1>
            <div className="flex gap-2 items-center">
              <span className="cyber-badge bg-[#1e3a5f] text-blue-300 font-semibold">
                {agentType}
              </span>
              {agentDescription && (
                <span className="text-xs text-slate-500">{agentDescription}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2.5 mb-5">
        <div className="cyber-card p-3 text-center">
          <div className="text-[22px] font-bold">{agentModel}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Model</div>
        </div>
        <div className="cyber-card p-3 text-center">
          <div className="text-[22px] font-bold">{agentSkills.length}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Skills</div>
        </div>
        <div className="cyber-card p-3 text-center">
          <div className="text-[22px] font-bold">{agentTags.length}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Tags</div>
        </div>
        <div className="cyber-card p-3 text-center">
          <div className="text-[22px] font-bold">{agentType}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Type</div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-4">
        {/* Left: Skills */}
        <div>
          <div className="cyber-card p-4 mb-3">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">
              Skills
            </div>
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
          </div>
        </div>

        {/* Right: Tags & Details */}
        <div>
          <div className="cyber-card p-4 mb-3">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">
              Tags
            </div>
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
          </div>

          <div className="cyber-card p-4 mb-3">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">
              Details
            </div>
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
          </div>
        </div>
      </div>
    </div>
  )
}
