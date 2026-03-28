'use client'

/**
 * Workspaces — lifecycle-managed organizational units with bindings and goals.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '../../../utils/trpc'
import { DbErrorBanner } from '../../../components/db-error-banner'
import ConfirmDialog from '../../../components/ui/confirm-dialog'

interface Workspace {
  id: string
  name: string
  type: string | null
  goal: string | null
  color: string | null
  icon: string | null
  autonomyLevel: number | null
  lifecycleState: string
  isSystemProtected: boolean | null
  settings: unknown
  createdAt: Date
  updatedAt: Date
}

interface Binding {
  id: string
  bindingType: string
  bindingKey: string
  enabled: boolean
}

interface Goal {
  id: string
  title: string
  status: string
  priority: number
  targetMetric: string | null
  targetValue: number | null
  currentValue: number | null
}

const LIFECYCLE_COLORS: Record<string, string> = {
  draft: '#6b7280',
  active: '#00ff88',
  paused: '#ffd200',
  retired: '#ff3a5c',
}

const BINDING_ICONS: Record<string, string> = {
  brain: '🧠',
  engine: '⚙️',
  skill: '🔧',
}

export default function WorkspacesPage() {
  const [showForm, setShowForm] = useState(false)
  const [showSeedConfirm, setShowSeedConfirm] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [goal, setGoal] = useState('')
  const [search, setSearch] = useState('')
  const navRouter = useRouter()
  const { data, isLoading, error } = trpc.workspaces.list.useQuery({ limit: 100, offset: 0 })

  const utils = trpc.useUtils()
  const createMut = trpc.workspaces.create.useMutation({
    onSuccess: () => {
      utils.workspaces.list.invalidate()
      setShowForm(false)
      setName('')
      setType('')
      setGoal('')
    },
  })
  const seedBrainMut = trpc.systemOrchestrator.seedBrain.useMutation({
    onSuccess: () => {
      utils.workspaces.list.invalidate()
      utils.agents.list.invalidate()
    },
  })

  if (error) {
    return (
      <div className="p-6 text-slate-50">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 text-slate-50 flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-500">
          <div className="text-2xl mb-2">Loading...</div>
          <div className="text-[13px]">Fetching workspaces</div>
        </div>
      </div>
    )
  }

  const allWorkspaces: Workspace[] = (data as Workspace[]) ?? []
  const workspaces = search
    ? allWorkspaces.filter((w) => w.name.toLowerCase().includes(search.toLowerCase()))
    : allWorkspaces

  return (
    <div className="p-6 text-slate-50">
      <div className="mb-5">
        <div className="flex justify-between items-center">
          <h2 className="m-0 text-[22px] font-bold font-orbitron">
            Workspaces ({allWorkspaces.length})
          </h2>
          <div className="flex gap-2">
            <button
              className="cyber-btn-primary"
              onClick={() => setShowSeedConfirm(true)}
              disabled={seedBrainMut.isPending}
            >
              {seedBrainMut.isPending ? 'Seeding...' : 'Initialize Brain'}
            </button>
            <button className="cyber-btn-secondary" onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : '+ New Workspace'}
            </button>
          </div>
        </div>
        <p className="mt-1 mb-0 text-[13px] text-slate-500">
          Lifecycle-managed organizational units with bindings, goals, and execution boundaries.
        </p>
      </div>

      <input
        className="cyber-input w-full mb-4"
        placeholder="Search workspaces..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {showForm && (
        <div className="bg-bg-elevated rounded-lg p-4 border border-border mb-4">
          <div className="flex flex-col gap-2">
            <input
              className="cyber-input"
              placeholder="Workspace name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              className="cyber-select flex-1"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">Type (optional)</option>
              <option value="general">General</option>
              <option value="development">Development</option>
              <option value="staging">Staging</option>
            </select>
            <input
              className="cyber-input"
              placeholder="Goal (optional)..."
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
            <div className="flex gap-2 items-center">
              <button
                className="bg-neon-green/80 hover:bg-neon-green text-white border-none rounded-md px-3.5 py-1.5 text-xs font-semibold cursor-pointer transition-colors"
                onClick={() =>
                  name.trim() &&
                  createMut.mutate({
                    name: name.trim(),
                    type: (type as 'general' | 'development' | 'staging' | 'system') || undefined,
                    goal: goal.trim() || undefined,
                  })
                }
                disabled={createMut.isPending || !name.trim()}
              >
                {createMut.isPending ? 'Creating...' : 'Create Workspace'}
              </button>
              {createMut.error && (
                <span className="text-neon-red text-[11px]">{createMut.error.message}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {seedBrainMut.data && (
        <div className="bg-neon-green/10 border border-neon-green/30 rounded-md px-3 py-2 mb-3 text-xs text-neon-green">
          Brain initialized: {seedBrainMut.data.workspacesCreated} workspaces,{' '}
          {seedBrainMut.data.agentsCreated} agents created.
          {seedBrainMut.data.skipped.length > 0 &&
            ` Skipped: ${seedBrainMut.data.skipped.join(', ')}`}
        </div>
      )}
      {seedBrainMut.error && (
        <div className="bg-neon-red/10 border border-neon-red/30 rounded-md px-3 py-2 mb-3 text-xs text-neon-red">
          Seed failed: {seedBrainMut.error.message}
        </div>
      )}

      {workspaces.length === 0 ? (
        <div className="text-center text-slate-500 py-10 text-sm">
          No workspaces found. Click &quot;Initialize Brain&quot; to create 10 category workspaces
          with 30+ agents.
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3">
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              onClick={() => navRouter.push(`/workspaces/${ws.id}`)}
              className="cursor-pointer"
            >
              <WorkspaceCard workspace={ws} />
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={showSeedConfirm}
        title="Initialize Brain"
        message="This will create 10 category workspaces (Core Development, Language Specialists, Infrastructure, etc.) with 30+ specialized agents, each with its own orchestrator connected to the system orchestrator. Existing workspaces with the same name will be skipped."
        confirmLabel="Initialize"
        onConfirm={() => {
          seedBrainMut.mutate()
          setShowSeedConfirm(false)
        }}
        onCancel={() => setShowSeedConfirm(false)}
      />
    </div>
  )
}

function WorkspaceCard({ workspace: ws }: { workspace: Workspace }) {
  const bindingsQuery = trpc.workspaces.listBindings.useQuery({ workspaceId: ws.id })
  const goalsQuery = trpc.workspaces.listGoals.useQuery({ workspaceId: ws.id })
  const agentsQuery = trpc.agents.byWorkspace.useQuery({ workspaceId: ws.id })

  const bindings: Binding[] = (bindingsQuery.data as Binding[]) ?? []
  const goals: Goal[] = (goalsQuery.data as Goal[]) ?? []
  const agentCount = (agentsQuery.data as unknown[] | undefined)?.length ?? 0
  const lifecycleColor = LIFECYCLE_COLORS[ws.lifecycleState] || '#6b7280'

  return (
    <div className="cyber-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{ws.type === 'system' ? '🔒' : ws.icon || '📁'}</span>
        <span className="text-[15px] font-bold flex-1">{ws.name}</span>
        {ws.type === 'system' && (
          <span className="text-[10px] bg-neon-red text-white px-1.5 py-0.5 rounded font-semibold">
            SYSTEM
          </span>
        )}
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded border uppercase"
          style={{ color: lifecycleColor, borderColor: lifecycleColor }}
        >
          {ws.lifecycleState}
        </span>
      </div>

      {ws.goal && <div className="text-xs text-slate-400 mb-2 leading-relaxed">{ws.goal}</div>}

      <div className="flex gap-4 text-[11px] text-slate-500 mb-2">
        {ws.type && <span>{ws.type}</span>}
        <span>{agentCount} agents</span>
        <span>Autonomy: {ws.autonomyLevel ?? 1}/5</span>
      </div>

      {bindings.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
            Bindings
          </div>
          <div className="flex flex-wrap gap-1">
            {bindings.map((b) => (
              <span
                key={b.id}
                className={`text-[11px] bg-neon-purple/10 text-neon-purple px-2 py-0.5 rounded ${
                  !b.enabled ? 'opacity-50' : ''
                }`}
              >
                {BINDING_ICONS[b.bindingType] || '📦'} {b.bindingKey}
              </span>
            ))}
          </div>
        </div>
      )}

      {goals.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
            Goals
          </div>
          {goals.slice(0, 3).map((g) => (
            <div key={g.id} className="flex justify-between items-center text-xs mb-0.5">
              <span className="text-slate-300">{g.title}</span>
              {g.targetMetric && g.targetValue != null && (
                <span className="text-slate-500 text-[11px] font-mono">
                  {g.currentValue != null ? `${g.currentValue}/${g.targetValue}` : g.targetValue}{' '}
                  {g.targetMetric}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
