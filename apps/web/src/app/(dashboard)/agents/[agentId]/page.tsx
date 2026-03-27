'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { trpc } from '../../../../utils/trpc'
import { DbErrorBanner } from '../../../../components/db-error-banner'

export default function AgentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const agentId = params.agentId as string

  const { data, isLoading, error } = trpc.agents.agentWithTraces.useQuery({ id: agentId })
  const modelsQuery = trpc.models.availableModels.useQuery()
  const utils = trpc.useUtils()

  const [editingSoul, setEditingSoul] = useState(false)
  const [soulDraft, setSoulDraft] = useState('')
  const [editingConfig, setEditingConfig] = useState(false)

  const updateMut = trpc.agents.update.useMutation({
    onSuccess: () => {
      utils.agents.agentWithTraces.invalidate({ id: agentId })
      setEditingSoul(false)
      setEditingConfig(false)
    },
  })

  if (error) {
    return (
      <div className="p-6 text-slate-50 max-w-[800px]">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="p-6 text-slate-50 max-w-[800px] flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-500">Loading agent...</div>
      </div>
    )
  }

  const agent = data
  const availableModels = (modelsQuery.data ?? []) as Array<{
    modelId: string
    displayName: string
    provider: string
  }>
  const modelsByProvider = availableModels.reduce(
    (acc, m) => {
      const key = m.provider.charAt(0).toUpperCase() + m.provider.slice(1)
      ;(acc[key] ??= []).push(m)
      return acc
    },
    {} as Record<string, typeof availableModels>,
  )

  const handleExport = async () => {
    const manifest = await utils.agents.exportAgent.fetch({ id: agentId })
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${agent.name.toLowerCase().replace(/\s+/g, '-')}-agent.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 text-slate-50 max-w-[800px]">
      <button
        className="bg-transparent border-none text-neon-purple cursor-pointer text-[13px] p-0 mb-4"
        onClick={() => router.push('/agents')}
      >
        &larr; Back to Agents
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h2 className="m-0 text-[22px] font-bold font-orbitron">{agent.name}</h2>
          {agent.type && (
            <span className="cyber-badge text-neon-blue bg-neon-blue/10 border-neon-blue/20">
              {agent.type}
            </span>
          )}
          {agent.requiredModelType && (
            <span className="cyber-badge text-neon-purple bg-neon-purple/10 border-neon-purple/20">
              {agent.requiredModelType}
            </span>
          )}
          <span
            className={`neon-dot ${
              agent.status === 'idle'
                ? 'neon-dot-green'
                : agent.status === 'error'
                  ? 'neon-dot-red'
                  : 'neon-dot-purple'
            }`}
          />
          <span className="text-[11px] text-slate-500">{agent.status}</span>
        </div>
        <p className="mt-1 mb-0 text-[13px] text-slate-400">
          {agent.description || 'No description'}
        </p>
        <div className="flex gap-2 mt-2">
          <span className="text-[11px] text-slate-600 font-mono">
            Model: {agent.model || `auto (${agent.requiredModelType ?? 'agentic'})`}
          </span>
          <span className="text-[11px] text-slate-600">|</span>
          <span className="text-[11px] text-slate-600 font-mono">
            Temp: {agent.temperature ?? 1.0} | Max tokens: {agent.maxTokens ?? 4096}
          </span>
        </div>
      </div>

      {/* Soul / System Prompt */}
      <div className="cyber-card p-4 mb-4">
        <div className="flex justify-between items-center mb-2">
          <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide font-orbitron">
            Soul (System Prompt)
          </div>
          <div className="flex gap-2">
            <button
              className="cyber-btn-secondary !px-2.5 !py-1 !text-[11px]"
              onClick={handleExport}
            >
              Export
            </button>
            {!editingSoul ? (
              <button
                className="cyber-btn-secondary !px-2.5 !py-1 !text-[11px]"
                onClick={() => {
                  setEditingSoul(true)
                  setSoulDraft(agent.soul ?? '')
                }}
              >
                Edit
              </button>
            ) : (
              <>
                <button
                  className="cyber-btn-primary !px-2.5 !py-1 !text-[11px] !bg-neon-green/20 !text-neon-green !border-neon-green/30"
                  onClick={() => updateMut.mutate({ id: agentId, soul: soulDraft })}
                  disabled={updateMut.isPending}
                >
                  {updateMut.isPending ? 'Saving...' : 'Save'}
                </button>
                <button
                  className="cyber-btn-secondary !px-2.5 !py-1 !text-[11px]"
                  onClick={() => setEditingSoul(false)}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
        {editingSoul ? (
          <textarea
            className="cyber-input font-mono resize-y"
            value={soulDraft}
            onChange={(e) => setSoulDraft(e.target.value)}
            rows={8}
            placeholder="Define this agent's personality and instructions...&#10;&#10;Example: You are a senior code reviewer. Be thorough but constructive. Focus on security, performance, and maintainability."
          />
        ) : (
          <div className="bg-bg-elevated rounded-md px-3.5 py-3 text-[13px] leading-relaxed whitespace-pre-wrap min-h-[60px] text-slate-300">
            {agent.soul || (
              <span className="text-slate-600 italic">
                No soul configured. Click Edit to define this agent&apos;s personality.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Configuration */}
      <div className="cyber-card p-4 mb-4">
        <div className="flex justify-between items-center mb-2">
          <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide font-orbitron">
            Configuration
          </div>
          {!editingConfig ? (
            <button
              className="cyber-btn-secondary !px-2.5 !py-1 !text-[11px]"
              onClick={() => setEditingConfig(true)}
            >
              Edit
            </button>
          ) : (
            <button
              className="cyber-btn-primary !px-2.5 !py-1 !text-[11px] !bg-neon-green/20 !text-neon-green !border-neon-green/30"
              onClick={() => setEditingConfig(false)}
            >
              Done
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-500">Model</label>
            {editingConfig ? (
              <select
                className="cyber-select !py-1 !px-2 !text-xs"
                value={agent.model ?? ''}
                onChange={(e) =>
                  updateMut.mutate({ id: agentId, model: e.target.value || undefined })
                }
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
              <span className="text-[13px] text-slate-300 font-mono">{agent.model || 'Auto'}</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-500">Temperature</label>
            {editingConfig ? (
              <input
                type="number"
                className="cyber-input !py-1 !px-2 !text-xs !w-[100px]"
                value={agent.temperature ?? 1.0}
                min={0}
                max={2}
                step={0.1}
                onChange={(e) =>
                  updateMut.mutate({ id: agentId, temperature: parseFloat(e.target.value) })
                }
              />
            ) : (
              <span className="text-[13px] text-slate-300 font-mono">
                {agent.temperature ?? 1.0}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-500">Max Tokens</label>
            {editingConfig ? (
              <input
                type="number"
                className="cyber-input !py-1 !px-2 !text-xs !w-[100px]"
                value={agent.maxTokens ?? 4096}
                min={1}
                max={200000}
                step={256}
                onChange={(e) =>
                  updateMut.mutate({ id: agentId, maxTokens: parseInt(e.target.value) })
                }
              />
            ) : (
              <span className="text-[13px] text-slate-300 font-mono">
                {agent.maxTokens ?? 4096}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-500">Capability</label>
            <span className="text-[13px] text-slate-300 font-mono">
              {agent.requiredModelType ?? 'agentic'}
            </span>
          </div>
        </div>
      </div>

      {/* Skills & Tags */}
      <div className="cyber-card p-4 mb-4">
        <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide font-orbitron mb-2">
          Skills & Tags
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <div className="text-[11px] text-slate-500 mb-1">Skills</div>
            <div className="flex flex-wrap gap-1">
              {agent.skills?.length ? (
                agent.skills.map((s) => (
                  <span
                    key={s}
                    className="cyber-badge text-neon-purple bg-neon-purple/10 border-neon-purple/20"
                  >
                    {s}
                  </span>
                ))
              ) : (
                <span className="text-slate-600 text-xs">None</span>
              )}
            </div>
          </div>
          <div className="flex-1">
            <div className="text-[11px] text-slate-500 mb-1">Tags</div>
            <div className="flex flex-wrap gap-1">
              {agent.tags?.length ? (
                agent.tags.map((t) => (
                  <span key={t} className="cyber-badge">
                    {t}
                  </span>
                ))
              ) : (
                <span className="text-slate-600 text-xs">None</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="cyber-card p-4 mb-4">
        <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide font-orbitron mb-2">
          Recent Activity ({agent.recentTraces.length})
        </div>
        {agent.recentTraces.length === 0 ? (
          <div className="text-slate-600 text-[13px] p-4 text-center">
            No activity recorded yet.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {agent.recentTraces.map((trace) => (
              <div
                key={trace.spanId}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-bg-elevated rounded"
              >
                <span
                  className={`neon-dot !w-1.5 !h-1.5 ${
                    trace.status === 'ok'
                      ? 'neon-dot-green'
                      : trace.status === 'error'
                        ? 'neon-dot-red'
                        : ''
                  }`}
                />
                <span className="text-xs font-mono flex-1">{trace.operation}</span>
                {trace.durationMs != null && (
                  <span className="text-[10px] text-slate-600">{trace.durationMs}ms</span>
                )}
                <span className="text-[10px] text-slate-600">
                  {new Date(trace.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
