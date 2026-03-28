'use client'

import { useParams, useRouter } from 'next/navigation'
import { trpc } from '../../../../utils/trpc'
import { DbErrorBanner } from '../../../../components/db-error-banner'

const LIFECYCLE_COLORS: Record<string, string> = {
  draft: '#6b7280',
  active: 'var(--color-neon-green)',
  paused: 'var(--color-neon-yellow)',
  retired: 'var(--color-neon-red)',
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
      <div className="p-6 text-slate-50 max-w-[900px] flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-500">Loading workspace...</div>
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

  const lifecycleColor = LIFECYCLE_COLORS[ws.lifecycleState] ?? '#6b7280'

  return (
    <div className="p-6 text-slate-50 max-w-[900px]">
      <button
        className="bg-transparent border-none text-neon-purple cursor-pointer text-[13px] p-0 mb-4"
        onClick={() => router.push('/workspaces')}
      >
        &larr; Back to Workspaces
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{ws.icon || '📁'}</span>
          <h2 className="m-0 text-[22px] font-bold">{ws.name}</h2>
          {ws.type && <span className="cyber-badge bg-neon-blue/10 text-neon-blue">{ws.type}</span>}
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded border uppercase"
            style={{ color: lifecycleColor, borderColor: lifecycleColor }}
          >
            {ws.lifecycleState}
          </span>
        </div>
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

      {/* Orchestrator */}
      <div className="cyber-card p-4 mb-4">
        <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
          Orchestrator
        </div>
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
      </div>

      {/* Agents */}
      <div className="cyber-card p-4 mb-4">
        <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
          Agents ({regularAgents.length})
        </div>
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
      </div>

      {/* Bindings */}
      {bindings.length > 0 && (
        <div className="cyber-card p-4 mb-4">
          <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
            Bindings ({bindings.length})
          </div>
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
        </div>
      )}

      {/* Goals */}
      {goals.length > 0 && (
        <div className="cyber-card p-4 mb-4">
          <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
            Goals ({goals.length})
          </div>
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
        </div>
      )}
    </div>
  )
}
