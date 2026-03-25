'use client'

/**
 * Agents — list all AI agent instances from the database.
 * Supports capability-based model selection, export/import of portable manifests.
 */

import { useState, useRef } from 'react'
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
  const color =
    status === 'idle'
      ? '#22c55e'
      : status === 'executing'
        ? '#818cf8'
        : status === 'error'
          ? '#ef4444'
          : status === 'offline'
            ? '#6b7280'
            : '#f97316'
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 4px ${color}`,
        flexShrink: 0,
      }}
    />
  )
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading, error } = trpc.agents.list.useQuery({ limit: 100, offset: 0 })
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
      <div style={styles.page}>
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (isLoading) {
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
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>Loading...</div>
          <div style={{ fontSize: 13 }}>Fetching agents</div>
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
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={styles.title}>Agents ({allAgents.length})</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={styles.btnSecondary} onClick={() => fileInputRef.current?.click()}>
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImport}
            />
            <button style={styles.btnPrimary} onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : '+ New Agent'}
            </button>
          </div>
        </div>
        <p style={styles.subtitle}>
          Portable AI agents — define by capability, deploy on any provider.
        </p>
      </div>

      <input
        style={{ ...styles.searchInput, marginBottom: 16 }}
        placeholder="Search agents by name or type..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {showForm && (
        <div style={styles.formCard}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            <input
              style={styles.input}
              placeholder="Agent name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                style={{ ...styles.select, flex: 1 }}
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
                style={{ ...styles.select, flex: 1, borderColor: '#818cf8' }}
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

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label
                style={{
                  fontSize: 11,
                  color: '#6b7280',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
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
                  style={{ ...styles.select, flex: 1 }}
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
              style={styles.input}
              placeholder="Description (optional)..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                style={styles.btnCreate}
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
                <span style={{ color: '#fca5a5', fontSize: 11 }}>{createMut.error.message}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {importMut.error && (
        <div
          style={{
            background: '#1e1b4b',
            border: '1px solid #ef4444',
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: 12,
            color: '#fca5a5',
          }}
        >
          Import failed: {importMut.error.message}
        </div>
      )}

      {agents.length === 0 ? (
        <div style={styles.empty}>
          No agents found. Create one or import a manifest to get started.
        </div>
      ) : (
        <div style={styles.grid}>
          {agents.map((agent) => (
            <div key={agent.id} style={styles.card}>
              <div style={styles.cardTop}>
                <StatusDot status={agent.status} />
                <span style={styles.cardName}>{agent.name}</span>
                {agent.type && <span style={styles.typeBadge}>{agent.type}</span>}
                {agent.requiredModelType && (
                  <span style={styles.capBadge}>{agent.requiredModelType}</span>
                )}
                <button
                  style={styles.btnIcon}
                  onClick={() => handleExport(agent.id, agent.name)}
                  title="Export manifest"
                >
                  Exp
                </button>
                <button
                  style={styles.btnIcon}
                  onClick={() => setDeleteTarget({ id: agent.id, name: agent.name })}
                >
                  Del
                </button>
              </div>
              <div style={styles.cardDesc}>{agent.description || 'No description'}</div>
              <div style={styles.cardMeta}>
                {editingModel === agent.id ? (
                  <select
                    style={{
                      ...styles.select,
                      fontSize: 11,
                      padding: '2px 6px',
                      border: '1px solid #818cf8',
                    }}
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
                    style={{ cursor: 'pointer', borderBottom: '1px dashed #4b5563' }}
                    onClick={() => setEditingModel(agent.id)}
                    title="Click to change model"
                  >
                    Model: {agent.model || `auto (${agent.requiredModelType ?? 'agentic'})`}
                  </span>
                )}
                <span>Status: {agent.status}</span>
              </div>
              {agent.skills && agent.skills.length > 0 && (
                <div style={styles.tags}>
                  {agent.skills.map((s) => (
                    <span key={s} style={styles.tag}>
                      {s}
                    </span>
                  ))}
                </div>
              )}
              {agent.tags && agent.tags.length > 0 && (
                <div style={styles.tags}>
                  {agent.tags.map((t) => (
                    <span key={t} style={styles.tagAlt}>
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

const styles = {
  page: { padding: 24, fontFamily: 'sans-serif', color: '#f9fafb' },
  header: { marginBottom: 20 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  searchInput: {
    width: '100%',
    background: '#1f2937',
    color: '#f9fafb',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 13,
    boxSizing: 'border-box' as const,
  },
  input: {
    background: '#111827',
    color: '#f9fafb',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 13,
  },
  select: {
    background: '#111827',
    color: '#f9fafb',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
  },
  formCard: {
    background: '#1f2937',
    borderRadius: 8,
    padding: 16,
    border: '1px solid #374151',
    marginBottom: 16,
  },
  btnPrimary: {
    background: '#818cf8',
    color: '#f9fafb',
    border: 'none',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnSecondary: {
    background: '#374151',
    color: '#d1d5db',
    border: 'none',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnCreate: {
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnIcon: {
    background: 'transparent',
    color: '#6b7280',
    border: 'none',
    fontSize: 11,
    cursor: 'pointer',
  },
  empty: { textAlign: 'center' as const, color: '#6b7280', padding: 40, fontSize: 14 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 },
  card: { background: '#1f2937', borderRadius: 8, padding: 16, border: '1px solid #374151' },
  cardTop: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardName: { fontSize: 15, fontWeight: 700, flex: 1 },
  typeBadge: {
    fontSize: 10,
    background: '#1e3a5f',
    color: '#93c5fd',
    padding: '2px 8px',
    borderRadius: 4,
  },
  capBadge: {
    fontSize: 10,
    background: '#1e1b4b',
    color: '#a78bfa',
    padding: '2px 8px',
    borderRadius: 4,
  },
  cardDesc: { fontSize: 12, color: '#9ca3af', marginBottom: 8, lineHeight: 1.4 },
  cardMeta: { display: 'flex', gap: 16, fontSize: 11, color: '#6b7280', marginBottom: 6 },
  tags: { display: 'flex', flexWrap: 'wrap' as const, gap: 4, marginTop: 6 },
  tag: {
    fontSize: 10,
    background: '#1e1b4b',
    color: '#818cf8',
    padding: '2px 6px',
    borderRadius: 4,
  },
  tagAlt: {
    fontSize: 10,
    background: '#1c1917',
    color: '#a3a3a3',
    padding: '2px 6px',
    borderRadius: 4,
  },
}
