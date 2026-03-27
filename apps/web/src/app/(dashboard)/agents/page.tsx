'use client'

/**
 * Agents — list all AI agent instances from the database.
 * Supports capability-based model selection, export/import of portable manifests.
 */

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '../../../utils/trpc'
import ConfirmDialog from '../../../components/ui/confirm-dialog'
import { DbErrorBanner } from '../../../components/db-error-banner'

interface Agent {
  id: string
  name: string
  type: string | null
  workspaceId: string | null
  status: string
  model: string | null
  requiredModelType: string | null
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

const CAPABILITIES = [
  { value: 'reasoning', label: 'Reasoning', desc: 'Complex analysis & planning' },
  { value: 'agentic', label: 'Agentic', desc: 'Tool use & autonomous work' },
  { value: 'coder', label: 'Coder', desc: 'Code generation & review' },
  { value: 'vision', label: 'Vision', desc: 'Image understanding' },
  { value: 'flash', label: 'Flash', desc: 'Fast & cheap tasks' },
  { value: 'multimodal', label: 'Multimodal', desc: 'Text + image + audio' },
  { value: 'embedding', label: 'Embedding', desc: 'Vector embeddings' },
  { value: 'guard', label: 'Guard', desc: 'Safety & guardrails' },
  { value: 'judge', label: 'Judge', desc: 'Evaluation & scoring' },
  { value: 'router', label: 'Router', desc: 'Classification & routing' },
]

function StatusDot({ status }: { status: string }) {
  const dotClass =
    status === 'idle'
      ? 'neon-dot neon-dot-green'
      : status === 'executing'
        ? 'neon-dot neon-dot-purple'
        : status === 'error'
          ? 'neon-dot neon-dot-red'
          : status === 'offline'
            ? 'neon-dot neon-dot-gray'
            : 'neon-dot neon-dot-yellow'
  return <span className={dotClass} />
}

export default function AgentsPage() {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [capability, setCapability] = useState('agentic')
  const [modelOverride, setModelOverride] = useState('')
  const [showModelOverride, setShowModelOverride] = useState(false)
  const [description, setDescription] = useState('')
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [editingModel, setEditingModel] = useState<string | null>(null)
  const [workspaceFilter, setWorkspaceFilter] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navRouter = useRouter()

  const allAgentsQuery = trpc.agents.list.useQuery(
    { limit: 500, offset: 0 },
    { enabled: !workspaceFilter },
  )
  const wsAgentsQuery = trpc.agents.byWorkspace.useQuery(
    { workspaceId: workspaceFilter || '00000000-0000-0000-0000-000000000000' },
    { enabled: !!workspaceFilter },
  )
  const { data, isLoading, error } = workspaceFilter ? wsAgentsQuery : allAgentsQuery
  const workspacesQuery = trpc.workspaces.list.useQuery({ limit: 100, offset: 0 })
  const modelsQuery = trpc.models.availableModels.useQuery()
  const availableModels = (modelsQuery.data ?? []) as Array<{
    modelId: string
    displayName: string
    provider: string
    modelType: string
    speedTier: string | null
  }>

  const utils = trpc.useUtils()
  const createMut = trpc.agents.create.useMutation({
    onSuccess: () => {
      utils.agents.list.invalidate()
      setShowForm(false)
      setName('')
      setType('')
      setDescription('')
      setModelOverride('')
      setShowModelOverride(false)
    },
  })
  const deleteMut = trpc.agents.delete.useMutation({
    onSuccess: () => utils.agents.list.invalidate(),
  })
  const updateMut = trpc.agents.update.useMutation({
    onSuccess: () => {
      utils.agents.list.invalidate()
      setEditingModel(null)
    },
  })
  const importMut = trpc.agents.importAgent.useMutation({
    onSuccess: () => utils.agents.list.invalidate(),
  })

  const handleExport = async (agentId: string, agentName: string) => {
    const manifest = utils.agents.exportAgent.fetch({ id: agentId })
    const blob = new Blob([JSON.stringify(await manifest, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${agentName.toLowerCase().replace(/\s+/g, '-')}-agent.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const manifest = JSON.parse(reader.result as string)
        importMut.mutate(manifest)
      } catch {
        alert('Invalid manifest JSON file')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  if (error) {
    return (
      <div className="p-6 text-gray-50">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 text-gray-50 flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-gray-500">
          <div className="text-2xl mb-2">Loading...</div>
          <div className="text-[13px]">Fetching agents</div>
        </div>
      </div>
    )
  }

  const allAgents: Agent[] = (data as Agent[]) ?? []
  const agents = search
    ? allAgents.filter(
        (a) =>
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          a.type?.toLowerCase().includes(search.toLowerCase()),
      )
    : allAgents

  // Group available models by provider
  const modelsByProvider = availableModels.reduce(
    (acc, m) => {
      const key = m.provider.charAt(0).toUpperCase() + m.provider.slice(1)
      ;(acc[key] ??= []).push(m)
      return acc
    },
    {} as Record<string, typeof availableModels>,
  )

  return (
    <div className="p-6 text-gray-50">
      <div className="mb-5">
        <div className="flex justify-between items-center">
          <h2 className="m-0 text-[22px] font-bold font-orbitron">Agents ({allAgents.length})</h2>
          <div className="flex gap-2">
            <button className="cyber-btn-secondary" onClick={() => fileInputRef.current?.click()}>
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
            <button className="cyber-btn-primary" onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : '+ New Agent'}
            </button>
          </div>
        </div>
        <p className="mt-1 mb-0 text-[13px] text-gray-500">
          Portable AI agents — define by capability, deploy on any provider.
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          className="cyber-input flex-1"
          placeholder="Search agents by name or type..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="cyber-select min-w-[180px]"
          value={workspaceFilter}
          onChange={(e) => setWorkspaceFilter(e.target.value)}
        >
          <option value="">All workspaces</option>
          {(workspacesQuery.data ?? []).map((ws: { id: string; name: string }) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </select>
      </div>

      {showForm && (
        <div className="cyber-card mb-4 p-4">
          <div className="flex flex-col gap-2">
            <input
              className="cyber-input"
              placeholder="Agent name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="flex gap-2">
              <select
                className="cyber-select flex-1"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">Type (optional)</option>
                <option value="executor">Executor</option>
                <option value="planner">Planner</option>
                <option value="reviewer">Reviewer</option>
                <option value="specialist">Specialist</option>
              </select>
              <select
                className="cyber-select flex-1 !border-neon-purple"
                value={capability}
                onChange={(e) => setCapability(e.target.value)}
              >
                {CAPABILITIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label} — {c.desc}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[11px] text-gray-500 cursor-pointer flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={showModelOverride}
                  onChange={(e) => {
                    setShowModelOverride(e.target.checked)
                    if (!e.target.checked) setModelOverride('')
                  }}
                />
                Override model
              </label>
              {showModelOverride && (
                <select
                  className="cyber-select flex-1"
                  value={modelOverride}
                  onChange={(e) => setModelOverride(e.target.value)}
                >
                  <option value="">Auto-resolve by capability</option>
                  {Object.entries(modelsByProvider).map(([provider, models]) => (
                    <optgroup key={provider} label={provider}>
                      {models.map((m) => (
                        <option key={m.modelId} value={m.modelId}>
                          {m.displayName}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </div>

            <input
              className="cyber-input"
              placeholder="Description (optional)..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex gap-2 items-center">
              <button
                className="cyber-btn-primary"
                onClick={() =>
                  name.trim() &&
                  createMut.mutate({
                    name: name.trim(),
                    type: type || undefined,
                    model: modelOverride || undefined,
                    requiredModelType: capability as
                      | 'reasoning'
                      | 'agentic'
                      | 'coder'
                      | 'vision'
                      | 'flash'
                      | 'multimodal'
                      | 'embedding'
                      | 'guard'
                      | 'judge'
                      | 'router',
                    description: description.trim() || undefined,
                  })
                }
                disabled={createMut.isPending || !name.trim()}
              >
                {createMut.isPending ? 'Creating...' : 'Create Agent'}
              </button>
              {createMut.error && (
                <span className="text-neon-red text-[11px]">{createMut.error.message}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {importMut.error && (
        <div className="bg-bg-elevated border border-neon-red rounded-md px-3 py-2 mb-3 text-xs text-neon-red">
          Import failed: {importMut.error.message}
        </div>
      )}

      {agents.length === 0 ? (
        <div className="text-center text-gray-500 py-10 text-sm">
          No agents found. Create one or import a manifest to get started.
        </div>
      ) : (
        <div className="cyber-grid">
          {agents.map((agent) => (
            <div key={agent.id} className="cyber-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <StatusDot status={agent.status} />
                <span
                  className="text-[15px] font-bold flex-1 cursor-pointer font-orbitron"
                  onClick={() => navRouter.push(`/agents/${agent.id}`)}
                  title="Open agent detail"
                >
                  {agent.name}
                </span>
                {agent.type && <span className="cyber-badge text-neon-blue">{agent.type}</span>}
                {agent.requiredModelType && (
                  <span className="cyber-badge text-neon-purple">{agent.requiredModelType}</span>
                )}
                <button
                  className="bg-transparent text-gray-500 border-none text-[11px] cursor-pointer hover:text-gray-300"
                  onClick={() => handleExport(agent.id, agent.name)}
                  title="Export manifest"
                >
                  Exp
                </button>
                <button
                  className="bg-transparent text-gray-500 border-none text-[11px] cursor-pointer hover:text-gray-300"
                  onClick={() => setDeleteTarget({ id: agent.id, name: agent.name })}
                >
                  Del
                </button>
              </div>
              <div className="text-xs text-gray-400 mb-2 leading-relaxed">
                {agent.description || 'No description'}
              </div>
              <div className="flex gap-4 text-[11px] text-gray-500 mb-1.5 font-mono">
                {editingModel === agent.id ? (
                  <select
                    className="cyber-select text-[11px] !py-0.5 !px-1.5 !border-neon-purple"
                    value={agent.model ?? ''}
                    onChange={(e) => updateMut.mutate({ id: agent.id, model: e.target.value })}
                    onBlur={() => setEditingModel(null)}
                    autoFocus
                  >
                    <option value="">Auto (by capability)</option>
                    {Object.entries(modelsByProvider).map(([provider, models]) => (
                      <optgroup key={provider} label={provider}>
                        {models.map((m) => (
                          <option key={m.modelId} value={m.modelId}>
                            {m.displayName}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                ) : (
                  <span
                    className="cursor-pointer border-b border-dashed border-gray-600"
                    onClick={() => setEditingModel(agent.id)}
                    title="Click to change model"
                  >
                    Model: {agent.model || `auto (${agent.requiredModelType ?? 'agentic'})`}
                  </span>
                )}
                <span>Status: {agent.status}</span>
              </div>
              {agent.skills && agent.skills.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {agent.skills.map((s) => (
                    <span key={s} className="cyber-badge text-neon-purple">
                      {s}
                    </span>
                  ))}
                </div>
              )}
              {agent.tags && agent.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {agent.tags.map((t) => (
                    <span key={t} className="cyber-badge text-gray-400">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Agent"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteTarget) deleteMut.mutate({ id: deleteTarget.id })
          setDeleteTarget(null)
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
