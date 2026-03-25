'use client'

/**
 * Settings — configure brain identity, feature flags, API keys, and system preferences.
 */

import { useState } from 'react'
import { trpc } from '../../../utils/trpc'
import { DbErrorBanner } from '../../../components/db-error-banner'

export default function SettingsPage() {
  const [showKeyForm, setShowKeyForm] = useState(false)
  const [keyProvider, setKeyProvider] = useState('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [ollamaUrl, setOllamaUrl] = useState('')
  const [newModelName, setNewModelName] = useState('')
  const featuresQuery = trpc.intelligence.features.useQuery()
  const policiesQuery = trpc.intelligence.policies.useQuery()
  const cognitionQuery = trpc.intelligence.cognitionState.useQuery()
  const providersQuery = trpc.gateway.listProviders.useQuery()
  const utils = trpc.useUtils()
  const [pullStatus, setPullStatus] = useState<Record<string, string>>({})
  const ollamaModelsQuery = trpc.gateway.ollamaModels.useQuery()
  const ollamaAvailableQuery = trpc.gateway.listOllamaAvailable.useQuery()
  const removeOllamaModelMut = trpc.gateway.removeOllamaModel.useMutation({
    onSuccess: () => utils.gateway.ollamaModels.invalidate(),
  })
  const pullOllamaModelMut = trpc.gateway.pullOllamaModel.useMutation({
    onSuccess: (data) => {
      setPullStatus((prev) => ({ ...prev, [data.model]: 'success' }))
      utils.gateway.ollamaModels.invalidate()
      utils.gateway.listOllamaAvailable.invalidate()
    },
    onError: (err) => {
      setPullStatus((prev) => ({ ...prev, [newModelName]: err.message }))
    },
  })
  const deleteKeyMut = trpc.gateway.deleteKey.useMutation({
    onSuccess: () => utils.gateway.listProviders.invalidate(),
  })
  const storeKeyMut = trpc.gateway.storeKey.useMutation({
    onSuccess: () => {
      utils.gateway.listProviders.invalidate()
      setShowKeyForm(false)
      setApiKey('')
      setOllamaUrl('')
    },
  })

  const handleStoreKey = async () => {
    if (!apiKey.trim()) return
    // Store the API key
    await storeKeyMut.mutateAsync({ provider: keyProvider, apiKey: apiKey.trim() })
    // If Ollama, also store the URL
    if (keyProvider === 'ollama' && ollamaUrl.trim()) {
      await storeKeyMut.mutateAsync({ provider: 'ollama_url', apiKey: ollamaUrl.trim() })
    }
  }

  const isLoading =
    featuresQuery.isLoading ||
    policiesQuery.isLoading ||
    cognitionQuery.isLoading ||
    providersQuery.isLoading
  const error =
    featuresQuery.error || policiesQuery.error || cognitionQuery.error || providersQuery.error

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
          <div style={{ fontSize: 13 }}>Fetching settings</div>
        </div>
      </div>
    )
  }

  const features = featuresQuery.data as Record<string, boolean> | undefined
  const policies = policiesQuery.data as Record<string, unknown> | undefined
  const cognition = cognitionQuery.data as
    | { features?: Record<string, boolean>; policies?: Record<string, unknown>; updatedAt?: Date }
    | undefined
  const providers = providersQuery.data as Array<{ provider: string; createdAt: Date }> | undefined

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Settings</h2>
        <p style={styles.subtitle}>
          Configure brain identity, API keys, LLM providers, and system preferences.
        </p>
      </div>

      {error && <DbErrorBanner error={error} />}
      <div style={styles.section}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <div style={styles.sectionTitle}>LLM Providers</div>
          <button
            style={{
              background: '#818cf8',
              color: '#f9fafb',
              border: 'none',
              borderRadius: 6,
              padding: '4px 12px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => setShowKeyForm(!showKeyForm)}
          >
            {showKeyForm ? 'Cancel' : '+ Add API Key'}
          </button>
        </div>

        {showKeyForm && (
          <div
            style={{
              background: '#111827',
              borderRadius: 8,
              padding: 14,
              border: '1px solid #374151',
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
              <select
                style={{
                  background: '#1f2937',
                  color: '#f9fafb',
                  border: '1px solid #374151',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                }}
                value={keyProvider}
                onChange={(e) => setKeyProvider(e.target.value)}
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="google">Google</option>
                <option value="ollama">Ollama (Cloud)</option>
              </select>
              {keyProvider === 'ollama' && (
                <input
                  style={{
                    background: '#1f2937',
                    color: '#f9fafb',
                    border: '1px solid #374151',
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontSize: 13,
                    fontFamily: 'monospace',
                  }}
                  type="text"
                  placeholder="https://ollama.com/api (Ollama Cloud) or http://localhost:11434 (local)"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                />
              )}
              <input
                style={{
                  background: '#1f2937',
                  color: '#f9fafb',
                  border: '1px solid #374151',
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 13,
                  fontFamily: 'monospace',
                }}
                type="password"
                placeholder={
                  keyProvider === 'ollama' ? 'Bearer token / API key' : 'sk-... or API key'
                }
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  style={{
                    background: '#22c55e',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  onClick={handleStoreKey}
                  disabled={storeKeyMut.isPending || !apiKey.trim()}
                >
                  {storeKeyMut.isPending ? 'Storing...' : 'Store Key (Encrypted)'}
                </button>
                {storeKeyMut.error && (
                  <span style={{ color: '#fca5a5', fontSize: 11 }}>
                    {storeKeyMut.error.message.includes('does not exist')
                      ? 'Database tables not provisioned — run migrations first.'
                      : storeKeyMut.error.message}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {providers && providers.filter((p) => p.provider !== 'ollama_url').length > 0 ? (
          <div style={styles.providerList}>
            {providers
              .filter((p) => p.provider !== 'ollama_url')
              .map((p) => (
                <div key={p.provider} style={styles.providerRow}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#22c55e',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ ...styles.providerName, flex: 1 }}>{p.provider}</span>
                  <span style={{ fontSize: 10, color: '#4b5563' }}>
                    {new Date(p.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#6b7280',
                      cursor: 'pointer',
                      fontSize: 14,
                      padding: '0 4px',
                    }}
                    onClick={() => deleteKeyMut.mutate({ provider: p.provider })}
                    title="Remove key"
                  >
                    ×
                  </button>
                </div>
              ))}
          </div>
        ) : (
          <div style={styles.empty}>
            No providers configured. Click "+ Add API Key" above to get started.
          </div>
        )}
      </div>

      <div style={styles.section}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <div style={styles.sectionTitle}>Ollama Cloud Models</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            style={{
              flex: 1,
              background: '#1f2937',
              color: '#f9fafb',
              border: '1px solid #374151',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 13,
              fontFamily: 'monospace',
            }}
            type="text"
            placeholder="Model name (e.g. kimi-k2.5:cloud, qwen3:8b)"
            value={newModelName}
            onChange={(e) => setNewModelName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newModelName.trim()) {
                setPullStatus((prev) => ({ ...prev, [newModelName.trim()]: 'pulling' }))
                pullOllamaModelMut.mutate({ name: newModelName.trim() })
              }
            }}
          />
          <button
            style={{
              background: '#818cf8',
              color: '#f9fafb',
              border: 'none',
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => {
              if (!newModelName.trim()) return
              setPullStatus((prev) => ({ ...prev, [newModelName.trim()]: 'pulling' }))
              pullOllamaModelMut.mutate({ name: newModelName.trim() })
            }}
            disabled={pullOllamaModelMut.isPending || !newModelName.trim()}
          >
            {pullOllamaModelMut.isPending ? 'Pulling...' : 'Pull & Add Model'}
          </button>
        </div>
        {pullOllamaModelMut.error && (
          <div
            style={{
              background: '#1e1b4b',
              border: '1px solid #ef4444',
              borderRadius: 6,
              padding: '8px 12px',
              marginBottom: 8,
              fontSize: 12,
              color: '#fca5a5',
            }}
          >
            {pullOllamaModelMut.error.message}
          </div>
        )}
        {(() => {
          const availableNames = new Set(
            (
              ollamaAvailableQuery.data as
                | Array<{ name: string; size: number; modifiedAt: string }>
                | undefined
            )?.map((m) => m.name) ?? [],
          )
          const models = ollamaModelsQuery.data as
            | Array<{ id: string; name: string; addedAt: Date }>
            | undefined
          if (!models?.length) {
            return (
              <div style={styles.empty}>
                No Ollama models configured. Enter a model name above and click "Pull & Add Model".
              </div>
            )
          }
          return (
            <div style={styles.providerList}>
              {models.map((m) => {
                const isAvailable =
                  availableNames.has(m.name) ||
                  availableNames.has(m.name + ':latest') ||
                  [...availableNames].some((n) => n.startsWith(m.name))
                const status = pullStatus[m.name]
                return (
                  <div key={m.id} style={styles.providerRow}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: isAvailable ? '#22c55e' : '#f59e0b',
                        flexShrink: 0,
                      }}
                      title={isAvailable ? 'Available' : 'Not yet pulled'}
                    />
                    <span style={{ ...styles.providerName, flex: 1 }}>{m.name}</span>
                    {status === 'pulling' && (
                      <span style={{ fontSize: 10, color: '#818cf8' }}>pulling...</span>
                    )}
                    {status === 'success' && (
                      <span style={{ fontSize: 10, color: '#22c55e' }}>ready</span>
                    )}
                    {!isAvailable && status !== 'pulling' && (
                      <button
                        style={{
                          background: '#374151',
                          border: 'none',
                          borderRadius: 4,
                          color: '#818cf8',
                          cursor: 'pointer',
                          fontSize: 10,
                          padding: '2px 8px',
                          fontWeight: 600,
                        }}
                        onClick={() => {
                          setPullStatus((prev) => ({ ...prev, [m.name]: 'pulling' }))
                          pullOllamaModelMut.mutate({ name: m.name })
                        }}
                        title="Pull this model from Ollama registry"
                      >
                        Pull
                      </button>
                    )}
                    <button
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#6b7280',
                        cursor: 'pointer',
                        fontSize: 14,
                      }}
                      onClick={() => removeOllamaModelMut.mutate({ id: m.id })}
                      title="Remove model"
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>
          Feature Flags ({features ? Object.keys(features).length : 0})
        </div>
        {features && Object.keys(features).length > 0 ? (
          <div style={styles.kvList}>
            {Object.entries(features).map(([key, val]) => (
              <div key={key} style={styles.kvRow}>
                <span style={styles.kvKey}>{key}</span>
                <span style={{ color: val ? '#22c55e' : '#ef4444', fontWeight: 600, fontSize: 11 }}>
                  {val ? 'ON' : 'OFF'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.empty}>No feature flags configured.</div>
        )}
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>
          System Policies ({policies ? Object.keys(policies).length : 0})
        </div>
        {policies && Object.keys(policies).length > 0 ? (
          <div style={styles.kvList}>
            {Object.entries(policies).map(([key, val]) => (
              <div key={key} style={styles.kvRow}>
                <span style={styles.kvKey}>{key}</span>
                <span style={styles.kvVal}>{JSON.stringify(val)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.empty}>No policies defined.</div>
        )}
      </div>

      {cognition && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Cognition State</div>
          <div style={styles.cognitionCard}>
            <div style={styles.meta}>
              Last updated:{' '}
              {cognition.updatedAt ? new Date(cognition.updatedAt).toLocaleString() : 'unknown'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: { padding: 24, fontFamily: 'sans-serif', color: '#f9fafb' },
  header: { marginBottom: 20 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  empty: { textAlign: 'center' as const, color: '#6b7280', padding: 20, fontSize: 13 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#9ca3af',
    marginBottom: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  providerList: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  providerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: '#1f2937',
    borderRadius: 6,
    border: '1px solid #374151',
  },
  providerName: { fontSize: 13, fontFamily: 'monospace' },
  kvList: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  kvRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: '#1f2937',
    borderRadius: 6,
    border: '1px solid #374151',
  },
  kvKey: { fontSize: 12, fontFamily: 'monospace' },
  kvVal: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#6b7280',
    maxWidth: '50%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cognitionCard: {
    background: '#1f2937',
    borderRadius: 8,
    padding: 14,
    border: '1px solid #374151',
  },
  meta: { fontSize: 12, color: '#6b7280' },
}
