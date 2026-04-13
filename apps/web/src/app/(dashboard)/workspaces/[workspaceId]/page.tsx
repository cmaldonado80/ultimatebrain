'use client'

import { useParams, useRouter } from 'next/navigation'

import { DbErrorBanner } from '../../../../components/db-error-banner'
import { LoadingState } from '../../../../components/ui/loading-state'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import type { StatusColor } from '../../../../components/ui/status-badge'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../lib/trpc'

const LIFECYCLE_BADGE_COLOR: Record<string, StatusColor> = {
  draft: 'slate',
  active: 'green',
  paused: 'yellow',
  retired: 'red',
}

interface Agent {
  id: string
  name: string
  type: string | null
  status: string
  model: string | null
  requiredModelType: string | null
  isWsOrchestrator: boolean | null
  soul: string | null
  description: string | null
  skills: string[] | null
}

export default function WorkspaceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const workspaceId = params.workspaceId as string

  const wsQuery = trpc.workspaces.byId.useQuery({ id: workspaceId })
  const agentsQuery = trpc.agents.byWorkspace.useQuery({ workspaceId })
  const bindingsQuery = trpc.workspaces.listBindings.useQuery({ workspaceId })
  const goalsQuery = trpc.workspaces.listGoals.useQuery({ workspaceId })
  const summaryQuery = trpc.workspaces.getWorkspaceSummary.useQuery({ workspaceId })
  const policyQuery = trpc.workspaces.getWorkspacePolicy.useQuery({ workspaceId })
  const workforceQuery = trpc.agents.getWorkforceInsights.useQuery({ workspaceId })
  const utils = trpc.useUtils()

  const activateMut = trpc.workspaces.activate.useMutation({
    onSuccess: () => utils.workspaces.byId.invalidate({ id: workspaceId }),
  })
  const pauseMut = trpc.workspaces.pause.useMutation({
    onSuccess: () => utils.workspaces.byId.invalidate({ id: workspaceId }),
  })
  const retireMut = trpc.workspaces.retire.useMutation({
    onSuccess: () => utils.workspaces.byId.invalidate({ id: workspaceId }),
  })

  if (wsQuery.error) {
    return (
      <div className="p-6 text-slate-50 max-w-[900px]">
        <DbErrorBanner error={wsQuery.error} />
      </div>
    )
  }

  if (wsQuery.isLoading || !wsQuery.data) {
    return (
      <div className="p-6 text-slate-50 max-w-[900px]">
        <LoadingState message="Loading workspace..." />
      </div>
    )
  }

  const ws = wsQuery.data as {
    id: string
    name: string
    type: string | null
    goal: string | null
    lifecycleState: string
    autonomyLevel: number | null
    icon: string | null
  }
  const agents = (agentsQuery.data ?? []) as Agent[]
  const orchestrator = agents.find((a) => a.isWsOrchestrator)
  const regularAgents = agents.filter((a) => !a.isWsOrchestrator)
  const bindings = (bindingsQuery.data ?? []) as Array<{
    id: string
    bindingType: string
    bindingKey: string
    enabled: boolean
  }>
  const goals = (goalsQuery.data ?? []) as Array<{
    id: string
    title: string
    status: string
    priority: number
  }>

  return (
    <div className="p-6 text-slate-50 max-w-[900px]">
      <button
        className="bg-transparent border-none text-neon-purple cursor-pointer text-[13px] p-0 mb-4"
        onClick={() => router.push('/workspaces')}
      >
        &larr; Back to Workspaces
      </button>

      {/* Header */}
      <PageHeader
        title={`${ws.icon || '📁'} ${ws.name}`}
        actions={
          <div className="flex items-center gap-2">
            {ws.type && (
              <span className="cyber-badge bg-neon-blue/10 text-neon-blue">{ws.type}</span>
            )}
            <StatusBadge
              label={ws.lifecycleState}
              color={LIFECYCLE_BADGE_COLOR[ws.lifecycleState] ?? 'slate'}
            />
          </div>
        }
      />
      <div className="mb-6">
        <div className="flex gap-2 mt-2">
          {ws.lifecycleState === 'draft' && (
            <button
              className="cyber-btn-primary bg-neon-green/20 hover:bg-neon-green/30 text-white border-neon-green/30 text-[11px] font-semibold px-3 py-1"
              onClick={() => activateMut.mutate({ id: workspaceId })}
              disabled={activateMut.isPending}
            >
              {activateMut.isPending ? 'Activating...' : 'Activate'}
            </button>
          )}
          {ws.lifecycleState === 'active' && (
            <button
              className="cyber-btn-secondary bg-neon-yellow/20 hover:bg-neon-yellow/30 text-black border-neon-yellow/30 text-[11px] font-semibold px-3 py-1"
              onClick={() => pauseMut.mutate({ id: workspaceId })}
              disabled={pauseMut.isPending}
            >
              {pauseMut.isPending ? 'Pausing...' : 'Pause'}
            </button>
          )}
          {ws.lifecycleState === 'paused' && (
            <>
              <button
                className="cyber-btn-primary bg-neon-green/20 hover:bg-neon-green/30 text-white border-neon-green/30 text-[11px] font-semibold px-3 py-1"
                onClick={() => activateMut.mutate({ id: workspaceId })}
                disabled={activateMut.isPending}
              >
                Resume
              </button>
              <button
                className="cyber-btn-danger text-[11px] font-semibold px-3 py-1"
                onClick={() => retireMut.mutate({ id: workspaceId })}
                disabled={retireMut.isPending}
              >
                Retire
              </button>
            </>
          )}
        </div>
        {(activateMut.error || pauseMut.error || retireMut.error) && (
          <div className="text-neon-red text-[11px] mt-1">
            {activateMut.error?.message || pauseMut.error?.message || retireMut.error?.message}
          </div>
        )}
        <p className="mt-1 mb-0 text-[13px] text-slate-400">{ws.goal || 'No goal set'}</p>
        <div className="text-[11px] text-slate-600 mt-1">
          Autonomy: {ws.autonomyLevel ?? 1}/5 | Agents: {agents.length} | Bindings:{' '}
          {bindings.length}
        </div>
      </div>

      {/* Performance Summary */}
      {summaryQuery.data && (
        <SectionCard title="Performance" className="mb-4">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-lg font-mono text-slate-200">{summaryQuery.data.totalRuns}</div>
              <div className="text-[10px] text-slate-500">Runs</div>
            </div>
            <div>
              <div className="text-lg font-mono text-neon-green">
                {Math.round(summaryQuery.data.successRate * 100)}%
              </div>
              <div className="text-[10px] text-slate-500">Success</div>
            </div>
            <div>
              <div className="text-lg font-mono text-neon-teal">
                {summaryQuery.data.avgQualityScore != null
                  ? `${Math.round(summaryQuery.data.avgQualityScore * 100)}%`
                  : '--'}
              </div>
              <div className="text-[10px] text-slate-500">Quality</div>
            </div>
            <div>
              <div
                className={`text-lg font-mono ${
                  summaryQuery.data.trend === 'improving'
                    ? 'text-neon-green'
                    : summaryQuery.data.trend === 'declining'
                      ? 'text-neon-red'
                      : 'text-slate-400'
                }`}
              >
                {summaryQuery.data.trend === 'improving'
                  ? '↑'
                  : summaryQuery.data.trend === 'declining'
                    ? '↓'
                    : summaryQuery.data.trend === 'stable'
                      ? '→'
                      : '--'}
              </div>
              <div className="text-[10px] text-slate-500">Trend</div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Workspace Policy */}
      {policyQuery.data && (
        <SectionCard title="Policy" className="mb-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
            <div className="text-slate-500">Decision Mode</div>
            <div className="text-slate-300 capitalize">{policyQuery.data.decisionMode}</div>
            <div className="text-slate-500">Autonomy</div>
            <div className="text-slate-300 capitalize">{policyQuery.data.autonomyMode}</div>
            <div className="text-slate-500">On Failure</div>
            <div className="text-slate-300 capitalize">{policyQuery.data.escalationOnFailure}</div>
            <div className="text-slate-500">Guardrails</div>
            <div className="text-slate-300 capitalize">{policyQuery.data.guardrailLevel}</div>
          </div>
        </SectionCard>
      )}

      {/* Workforce Intelligence */}
      {workforceQuery.data && workforceQuery.data.agentsWithData > 0 && (
        <SectionCard title="Workforce Intelligence" variant="intelligence" className="mb-4">
          <div className="text-[11px] text-slate-500 mb-3">{workforceQuery.data.summary}</div>

          {/* Top Agents */}
          {workforceQuery.data.topAgents.length > 0 && (
            <div className="mb-3">
              <div className="text-[11px] text-neon-teal font-semibold mb-1.5">Top Agents</div>
              <div className="flex flex-col gap-1">
                {workforceQuery.data.topAgents.slice(0, 5).map((agent, i) => (
                  <div
                    key={agent.agentId}
                    className="flex items-center gap-2 text-[12px] bg-bg-elevated rounded px-2.5 py-1.5 cursor-pointer hover:border-neon-teal/30 border border-transparent transition-colors"
                    onClick={() => router.push(`/agents/${agent.agentId}`)}
                  >
                    <span className="text-neon-teal font-mono w-5 text-right shrink-0">
                      #{i + 1}
                    </span>
                    <span className="text-slate-200 font-medium flex-1">{agent.agentName}</span>
                    <span className="text-neon-green font-mono">
                      {Math.round(agent.score * 100)}%
                    </span>
                    <span className="text-slate-600 text-[10px]">{agent.runs} runs</span>
                    {agent.topStrength && (
                      <span className="cyber-badge text-[9px] text-neon-purple">
                        {agent.topStrength}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strong Pairs */}
          {workforceQuery.data.strongPairs.length > 0 && (
            <div className="mb-3">
              <div className="text-[11px] text-neon-blue font-semibold mb-1.5">Strong Pairs</div>
              <div className="flex flex-wrap gap-1.5">
                {workforceQuery.data.strongPairs.map((pair, i) => (
                  <span
                    key={i}
                    className="text-[10px] bg-neon-blue/10 text-neon-blue px-2 py-1 rounded border border-neon-blue/20"
                  >
                    {pair.agentA.name} + {pair.agentB.name}
                    {pair.avgQuality != null && (
                      <span className="ml-1 text-neon-green">
                        {Math.round(pair.avgQuality * 100)}%
                      </span>
                    )}
                    <span className="ml-1 text-slate-600">({pair.sharedRuns})</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Weak Coverage */}
          {workforceQuery.data.weakCoverage.length > 0 && (
            <div>
              <div className="text-[11px] text-neon-yellow font-semibold mb-1.5">Weak Coverage</div>
              <div className="flex flex-col gap-1">
                {workforceQuery.data.weakCoverage.map((area, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-[11px] bg-neon-yellow/5 rounded px-2.5 py-1.5 border border-neon-yellow/10"
                  >
                    <span className="text-neon-yellow shrink-0">
                      {area.type === 'workflow' ? '⚡' : '🔧'}
                    </span>
                    <span className="text-slate-300 flex-1">{area.warning}</span>
                    <span className="text-neon-red font-mono text-[10px]">
                      {Math.round(area.bestScore * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* Orchestrator */}
      <SectionCard title="Orchestrator" className="mb-4">
        {orchestrator ? (
          <div className="bg-bg-elevated rounded-md p-3 border border-border">
            <div className="flex items-center gap-2">
              <span
                className="neon-dot"
                style={{
                  background:
                    orchestrator.status === 'idle'
                      ? 'var(--color-neon-green)'
                      : orchestrator.status === 'error'
                        ? 'var(--color-neon-red)'
                        : 'var(--color-neon-purple)',
                }}
              />
              <span
                className="text-sm font-bold cursor-pointer"
                onClick={() => router.push(`/agents/${orchestrator.id}`)}
              >
                {orchestrator.name}
              </span>
              <span className="text-[10px] text-slate-500">{orchestrator.status}</span>
              {orchestrator.requiredModelType && (
                <span className="cyber-badge bg-neon-purple/10 text-neon-purple">
                  {orchestrator.requiredModelType}
                </span>
              )}
            </div>
            {orchestrator.soul && (
              <div className="text-xs text-slate-400 mt-1.5 leading-snug">
                {orchestrator.soul.slice(0, 200)}
                {orchestrator.soul.length > 200 ? '...' : ''}
              </div>
            )}
          </div>
        ) : (
          <div className="text-neon-red text-[13px]">No orchestrator found!</div>
        )}
      </SectionCard>

      {/* Agents */}
      <SectionCard title={`Agents (${regularAgents.length})`} className="mb-4">
        {regularAgents.length === 0 ? (
          <div className="text-slate-600 text-[13px] p-3 text-center">
            No agents in this workspace yet.
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
            {regularAgents.map((agent) => (
              <div
                key={agent.id}
                className="bg-bg-elevated rounded-md p-2.5 border border-border cursor-pointer hover:border-neon-blue/30 transition-colors"
                onClick={() => router.push(`/agents/${agent.id}`)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      background:
                        agent.status === 'idle'
                          ? 'var(--color-neon-green)'
                          : agent.status === 'error'
                            ? 'var(--color-neon-red)'
                            : 'var(--color-neon-purple)',
                    }}
                  />
                  <span className="text-[13px] font-bold flex-1">{agent.name}</span>
                  {agent.type && (
                    <span className="cyber-badge text-[9px] bg-neon-blue/10 text-neon-blue px-1.5 py-px">
                      {agent.type}
                    </span>
                  )}
                  {agent.requiredModelType && (
                    <span className="cyber-badge text-[9px] bg-neon-purple/10 text-neon-purple px-1.5 py-px">
                      {agent.requiredModelType}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mb-1">
                  {agent.description?.slice(0, 100) || 'No description'}
                </div>
                {agent.skills && agent.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {agent.skills.slice(0, 5).map((s) => (
                      <span
                        key={s}
                        className="text-[9px] bg-neon-purple/10 text-neon-purple px-1.5 py-px rounded"
                      >
                        {s}
                      </span>
                    ))}
                    {agent.skills.length > 5 && (
                      <span className="text-[10px] text-slate-600">+{agent.skills.length - 5}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Bindings */}
      {bindings.length > 0 && (
        <SectionCard title={`Bindings (${bindings.length})`} className="mb-4">
          <div className="flex flex-wrap gap-1.5">
            {bindings.map((b) => (
              <span
                key={b.id}
                className={`text-[11px] bg-neon-purple/10 text-neon-purple px-2 py-0.5 rounded ${
                  b.enabled ? 'opacity-100' : 'opacity-50'
                }`}
              >
                {b.bindingType === 'brain' ? '🧠' : b.bindingType === 'engine' ? '⚙️' : '🔧'}{' '}
                {b.bindingKey}
              </span>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Goals */}
      {goals.length > 0 && (
        <SectionCard title={`Goals (${goals.length})`} className="mb-4">
          {goals.map((g) => (
            <div key={g.id} className="flex justify-between py-1 text-[13px]">
              <span className="text-slate-300">{g.title}</span>
              <span
                className={`text-[11px] ${
                  g.status === 'active' ? 'text-neon-green' : 'text-slate-500'
                }`}
              >
                {g.status}
              </span>
            </div>
          ))}
        </SectionCard>
      )}
    </div>
  )
}
