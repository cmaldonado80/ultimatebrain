'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { trpc } from '../../../../utils/trpc'

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
      <div style={styles.page}>
        <div style={{ color: '#fca5a5', padding: 20 }}>Error: {error.message}</div>
      </div>
    )
  }

  if (isLoading || !data) {
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
        <div style={{ textAlign: 'center', color: '#6b7280' }}>Loading agent...</div>
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
    <div style={styles.page}>
      <button style={styles.backBtn} onClick={() => router.push('/agents')}>
        &larr; Back to Agents
      </button>

      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={styles.title}>{agent.name}</h2>
          {agent.type && <span style={styles.badge}>{agent.type}</span>}
          {agent.requiredModelType && (
            <span style={styles.capBadge}>{agent.requiredModelType}</span>
          )}
          <span
            style={{
              ...styles.statusDot,
              background:
                agent.status === 'idle'
                  ? '#22c55e'
                  : agent.status === 'error'
                    ? '#ef4444'
                    : '#818cf8',
            }}
          />
          <span style={{ fontSize: 11, color: '#6b7280' }}>{agent.status}</span>
        </div>
        <p style={styles.subtitle}>{agent.description || 'No description'}</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 11, color: '#4b5563' }}>
            Model: {agent.model || `auto (${agent.requiredModelType ?? 'agentic'})`}
          </span>
          <span style={{ fontSize: 11, color: '#4b5563' }}>|</span>
          <span style={{ fontSize: 11, color: '#4b5563' }}>
            Temp: {agent.temperature ?? 1.0} | Max tokens: {agent.maxTokens ?? 4096}
          </span>
        </div>
      </div>

      {/* Soul / System Prompt */}
      <div style={styles.section}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <div style={styles.sectionTitle}>Soul (System Prompt)</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={styles.btnSmall} onClick={handleExport}>
              Export
            </button>
            {!editingSoul ? (
              <button
                style={styles.btnSmall}
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
                  style={{ ...styles.btnSmall, background: '#22c55e' }}
                  onClick={() => updateMut.mutate({ id: agentId, soul: soulDraft })}
                  disabled={updateMut.isPending}
                >
                  {updateMut.isPending ? 'Saving...' : 'Save'}
                </button>
                <button style={styles.btnSmall} onClick={() => setEditingSoul(false)}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
        {editingSoul ? (
          <textarea
            style={styles.textarea}
            value={soulDraft}
            onChange={(e) => setSoulDraft(e.target.value)}
            rows={8}
            placeholder="Define this agent's personality and instructions...&#10;&#10;Example: You are a senior code reviewer. Be thorough but constructive. Focus on security, performance, and maintainability."
          />
        ) : (
          <div style={styles.soulDisplay}>
            {agent.soul || (
              <span style={{ color: '#4b5563', fontStyle: 'italic' }}>
                No soul configured. Click Edit to define this agent&apos;s personality.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Configuration */}
      <div style={styles.section}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <div style={styles.sectionTitle}>Configuration</div>
          {!editingConfig ? (
            <button style={styles.btnSmall} onClick={() => setEditingConfig(true)}>
              Edit
            </button>
          ) : (
            <button
              style={{ ...styles.btnSmall, background: '#22c55e' }}
              onClick={() => setEditingConfig(false)}
            >
              Done
            </button>
          )}
        </div>
        <div style={styles.configGrid}>
          <div style={styles.configItem}>
            <label style={styles.configLabel}>Model</label>
            {editingConfig ? (
              <select
                style={styles.configSelect}
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
              <span style={styles.configValue}>{agent.model || 'Auto'}</span>
            )}
          </div>
          <div style={styles.configItem}>
            <label style={styles.configLabel}>Temperature</label>
            {editingConfig ? (
              <input
                type="number"
                style={styles.configInput}
                value={agent.temperature ?? 1.0}
                min={0}
                max={2}
                step={0.1}
                onChange={(e) =>
                  updateMut.mutate({ id: agentId, temperature: parseFloat(e.target.value) })
                }
              />
            ) : (
              <span style={styles.configValue}>{agent.temperature ?? 1.0}</span>
            )}
          </div>
          <div style={styles.configItem}>
            <label style={styles.configLabel}>Max Tokens</label>
            {editingConfig ? (
              <input
                type="number"
                style={styles.configInput}
                value={agent.maxTokens ?? 4096}
                min={1}
                max={200000}
                step={256}
                onChange={(e) =>
                  updateMut.mutate({ id: agentId, maxTokens: parseInt(e.target.value) })
                }
              />
            ) : (
              <span style={styles.configValue}>{agent.maxTokens ?? 4096}</span>
            )}
          </div>
          <div style={styles.configItem}>
            <label style={styles.configLabel}>Capability</label>
            <span style={styles.configValue}>{agent.requiredModelType ?? 'agentic'}</span>
          </div>
        </div>
      </div>

      {/* Skills & Tags */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Skills & Tags</div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Skills</div>
            <div style={styles.tagList}>
              {agent.skills?.length ? (
                agent.skills.map((s) => (
                  <span key={s} style={styles.tag}>
                    {s}
                  </span>
                ))
              ) : (
                <span style={{ color: '#4b5563', fontSize: 12 }}>None</span>
              )}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Tags</div>
            <div style={styles.tagList}>
              {agent.tags?.length ? (
                agent.tags.map((t) => (
                  <span key={t} style={styles.tagAlt}>
                    {t}
                  </span>
                ))
              ) : (
                <span style={{ color: '#4b5563', fontSize: 12 }}>None</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Recent Activity ({agent.recentTraces.length})</div>
        {agent.recentTraces.length === 0 ? (
          <div
            style={{ color: '#4b5563', fontSize: 13, padding: 16, textAlign: 'center' as const }}
          >
            No activity recorded yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
            {agent.recentTraces.map((trace) => (
              <div key={trace.spanId} style={styles.traceRow}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background:
                      trace.status === 'ok'
                        ? '#22c55e'
                        : trace.status === 'error'
                          ? '#ef4444'
                          : '#6b7280',
                  }}
                />
                <span style={{ fontSize: 12, fontFamily: 'monospace', flex: 1 }}>
                  {trace.operation}
                </span>
                {trace.durationMs != null && (
                  <span style={{ fontSize: 10, color: '#4b5563' }}>{trace.durationMs}ms</span>
                )}
                <span style={{ fontSize: 10, color: '#4b5563' }}>
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

const styles = {
  page: { padding: 24, fontFamily: 'sans-serif', color: '#f9fafb', maxWidth: 800 },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#818cf8',
    cursor: 'pointer',
    fontSize: 13,
    padding: 0,
    marginBottom: 16,
  },
  header: { marginBottom: 24 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#9ca3af' },
  badge: {
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
  statusDot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
  section: {
    background: '#1f2937',
    borderRadius: 8,
    padding: 16,
    border: '1px solid #374151',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  btnSmall: {
    background: '#374151',
    color: '#d1d5db',
    border: 'none',
    borderRadius: 4,
    padding: '4px 10px',
    fontSize: 11,
    cursor: 'pointer',
  },
  textarea: {
    width: '100%',
    background: '#111827',
    color: '#f9fafb',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '10px 12px',
    fontSize: 13,
    fontFamily: 'monospace',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
  },
  soulDisplay: {
    background: '#111827',
    borderRadius: 6,
    padding: '12px 14px',
    fontSize: 13,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap' as const,
    minHeight: 60,
    color: '#d1d5db',
  },
  configGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  configItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  configLabel: { fontSize: 11, color: '#6b7280' },
  configValue: { fontSize: 13, color: '#d1d5db', fontFamily: 'monospace' },
  configSelect: {
    background: '#111827',
    color: '#f9fafb',
    border: '1px solid #374151',
    borderRadius: 4,
    padding: '4px 8px',
    fontSize: 12,
  },
  configInput: {
    background: '#111827',
    color: '#f9fafb',
    border: '1px solid #374151',
    borderRadius: 4,
    padding: '4px 8px',
    fontSize: 12,
    width: 100,
  },
  tagList: { display: 'flex', flexWrap: 'wrap' as const, gap: 4 },
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
  traceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    background: '#111827',
    borderRadius: 4,
  },
}
