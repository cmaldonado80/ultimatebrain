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
      <div style={styles.page}>
        <DbErrorBanner error={wsQuery.error} />
      </div>
    )
  }

  if (wsQuery.isLoading || !wsQuery.data) {
    return (
      <div
        style={{
          ...styles.page,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
        }}
      >
        <div style={{ textAlign: 'center', color: '#6b7280' }}>Loading workspace...</div>
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
    <div style={styles.page}>
      <button style={styles.backBtn} onClick={() => router.push('/workspaces')}>
        &larr; Back to Workspaces
      </button>

      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>{ws.icon || '📁'}</span>
          <h2 style={styles.title}>{ws.name}</h2>
          {ws.type && <span style={styles.typeBadge}>{ws.type}</span>}
          <span
            style={{ ...styles.lifecycleBadge, color: lifecycleColor, borderColor: lifecycleColor }}
          >
            {ws.lifecycleState}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {ws.lifecycleState === 'draft' && (
            <button
              style={{
                background: 'var(--color-neon-green)',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                padding: '4px 12px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={() => activateMut.mutate({ id: workspaceId })}
              disabled={activateMut.isPending}
            >
              {activateMut.isPending ? 'Activating...' : 'Activate'}
            </button>
          )}
          {ws.lifecycleState === 'active' && (
            <button
              style={{
                background: 'var(--color-neon-yellow)',
                color: '#000',
                border: 'none',
                borderRadius: 4,
                padding: '4px 12px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={() => pauseMut.mutate({ id: workspaceId })}
              disabled={pauseMut.isPending}
            >
              {pauseMut.isPending ? 'Pausing...' : 'Pause'}
            </button>
          )}
          {ws.lifecycleState === 'paused' && (
            <>
              <button
                style={{
                  background: 'var(--color-neon-green)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onClick={() => activateMut.mutate({ id: workspaceId })}
                disabled={activateMut.isPending}
              >
                Resume
              </button>
              <button
                style={{
                  background: 'var(--color-neon-red)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onClick={() => retireMut.mutate({ id: workspaceId })}
                disabled={retireMut.isPending}
              >
                Retire
              </button>
            </>
          )}
        </div>
        {(activateMut.error || pauseMut.error || retireMut.error) && (
          <div style={{ color: 'var(--color-neon-red)', fontSize: 11, marginTop: 4 }}>
            {activateMut.error?.message || pauseMut.error?.message || retireMut.error?.message}
          </div>
        )}
        <p style={styles.subtitle}>{ws.goal || 'No goal set'}</p>
        <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>
          Autonomy: {ws.autonomyLevel ?? 1}/5 | Agents: {agents.length} | Bindings:{' '}
          {bindings.length}
        </div>
      </div>

      {/* Orchestrator */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Orchestrator</div>
        {orchestrator ? (
          <div style={styles.orchestratorCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background:
                    orchestrator.status === 'idle'
                      ? 'var(--color-neon-green)'
                      : orchestrator.status === 'error'
                        ? 'var(--color-neon-red)'
                        : 'var(--color-neon-purple)',
                }}
              />
              <span
                style={{ fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                onClick={() => router.push(`/agents/${orchestrator.id}`)}
              >
                {orchestrator.name}
              </span>
              <span style={{ fontSize: 10, color: '#6b7280' }}>{orchestrator.status}</span>
              {orchestrator.requiredModelType && (
                <span style={styles.capBadge}>{orchestrator.requiredModelType}</span>
              )}
            </div>
            {orchestrator.soul && (
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6, lineHeight: 1.4 }}>
                {orchestrator.soul.slice(0, 200)}
                {orchestrator.soul.length > 200 ? '...' : ''}
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: 'var(--color-neon-red)', fontSize: 13 }}>No orchestrator found!</div>
        )}
      </div>

      {/* Agents */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Agents ({regularAgents.length})</div>
        {regularAgents.length === 0 ? (
          <div
            style={{ color: '#4b5563', fontSize: 13, padding: 12, textAlign: 'center' as const }}
          >
            No agents in this workspace yet.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 8,
            }}
          >
            {regularAgents.map((agent) => (
              <div
                key={agent.id}
                style={styles.agentCard}
                onClick={() => router.push(`/agents/${agent.id}`)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background:
                        agent.status === 'idle'
                          ? 'var(--color-neon-green)'
                          : agent.status === 'error'
                            ? 'var(--color-neon-red)'
                            : 'var(--color-neon-purple)',
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{agent.name}</span>
                  {agent.type && <span style={styles.typeBadgeSmall}>{agent.type}</span>}
                  {agent.requiredModelType && (
                    <span style={styles.capBadge}>{agent.requiredModelType}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
                  {agent.description?.slice(0, 100) || 'No description'}
                </div>
                {agent.skills && agent.skills.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 3 }}>
                    {agent.skills.slice(0, 5).map((s) => (
                      <span key={s} style={styles.skillTag}>
                        {s}
                      </span>
                    ))}
                    {agent.skills.length > 5 && (
                      <span style={{ fontSize: 10, color: '#4b5563' }}>
                        +{agent.skills.length - 5}
                      </span>
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
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Bindings ({bindings.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
            {bindings.map((b) => (
              <span key={b.id} style={{ ...styles.bindingTag, opacity: b.enabled ? 1 : 0.5 }}>
                {b.bindingType === 'brain' ? '🧠' : b.bindingType === 'engine' ? '⚙️' : '🔧'}{' '}
                {b.bindingKey}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Goals */}
      {goals.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Goals ({goals.length})</div>
          {goals.map((g) => (
            <div
              key={g.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 0',
                fontSize: 13,
              }}
            >
              <span style={{ color: '#d1d5db' }}>{g.title}</span>
              <span
                style={{
                  fontSize: 11,
                  color: g.status === 'active' ? 'var(--color-neon-green)' : '#6b7280',
                }}
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

const styles = {
  page: { padding: 24, fontFamily: 'sans-serif', color: '#f9fafb', maxWidth: 900 },
  backBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-neon-purple)',
    cursor: 'pointer',
    fontSize: 13,
    padding: 0,
    marginBottom: 16,
  },
  header: { marginBottom: 24 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#9ca3af' },
  typeBadge: {
    fontSize: 10,
    background: 'rgba(0,212,255,0.1)',
    color: 'var(--color-neon-blue)',
    padding: '2px 8px',
    borderRadius: 4,
  },
  lifecycleBadge: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 4,
    border: '1px solid',
    textTransform: 'uppercase' as const,
  },
  section: {
    background: 'var(--color-bg-card)',
    backdropFilter: 'blur(12px)',
    borderRadius: 8,
    padding: 16,
    border: '1px solid var(--color-border)',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  orchestratorCard: {
    background: 'var(--color-bg-elevated)',
    borderRadius: 6,
    padding: 12,
    border: '1px solid var(--color-border)',
  },
  agentCard: {
    background: 'var(--color-bg-elevated)',
    borderRadius: 6,
    padding: 10,
    border: '1px solid var(--color-border)',
    cursor: 'pointer',
  },
  typeBadgeSmall: {
    fontSize: 9,
    background: 'rgba(0,212,255,0.1)',
    color: 'var(--color-neon-blue)',
    padding: '1px 6px',
    borderRadius: 3,
  },
  capBadge: {
    fontSize: 9,
    background: 'rgba(139,92,246,0.12)',
    color: 'var(--color-neon-purple)',
    padding: '1px 6px',
    borderRadius: 3,
  },
  skillTag: {
    fontSize: 9,
    background: 'rgba(139,92,246,0.12)',
    color: 'var(--color-neon-purple)',
    padding: '1px 5px',
    borderRadius: 3,
  },
  bindingTag: {
    fontSize: 11,
    background: 'rgba(139,92,246,0.12)',
    color: 'var(--color-neon-purple)',
    padding: '2px 8px',
    borderRadius: 4,
  },
}
