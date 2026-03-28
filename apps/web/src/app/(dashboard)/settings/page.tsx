'use client'

/**
 * Settings — configure brain identity, feature flags, API keys, and system preferences.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { trpc } from '../../../utils/trpc'

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
          <div className="text-[13px]">Fetching settings</div>
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
    <div className="p-6 text-slate-50">
      <div className="mb-5">
        <h2 className="m-0 text-[22px] font-bold font-orbitron">Settings</h2>
        <p className="mt-1 mb-0 text-[13px] text-slate-500">
          Configure brain identity, API keys, LLM providers, and system preferences.
        </p>
      </div>
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2.5">
          <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide font-orbitron">
            LLM Providers
          </div>
          <button
            className="cyber-btn-primary text-[11px] px-3 py-1"
            onClick={() => setShowKeyForm(!showKeyForm)}
          >
            {showKeyForm ? 'Cancel' : '+ Add API Key'}
          </button>
        </div>

        {showKeyForm && (
          <div className="cyber-card bg-bg-deep rounded-lg p-3.5 border border-border-dim mb-3">
            <div className="flex flex-col gap-2">
              <select
                className="cyber-select"
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
                  className="cyber-input font-mono"
                  type="text"
                  placeholder="https://ollama.com/api (Ollama Cloud) or http://localhost:11434 (local)"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                />
              )}
              <input
                className="cyber-input font-mono"
                type="password"
                placeholder={
                  keyProvider === 'ollama' ? 'Bearer token / API key' : 'sk-... or API key'
                }
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <div className="flex gap-2 items-center">
                <button
                  className="cyber-btn-primary text-[12px] px-3.5 py-1.5 font-semibold"
                  onClick={handleStoreKey}
                  disabled={storeKeyMut.isPending || !apiKey.trim()}
                >
                  {storeKeyMut.isPending ? 'Storing...' : 'Store Key (Encrypted)'}
                </button>
                {storeKeyMut.error && (
                  <span className="text-neon-red text-[11px]">
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
          <div className="flex flex-col gap-1">
            {providers
              .filter((p) => p.provider !== 'ollama_url')
              .map((p) => (
                <div
                  key={p.provider}
                  className="flex items-center gap-2 px-3 py-2 bg-bg-surface rounded-md border border-border-dim"
                >
                  <span className="w-2 h-2 rounded-full bg-neon-green shrink-0" />
                  <span className="text-[13px] font-mono flex-1">{p.provider}</span>
                  <span className="text-[10px] text-slate-600">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    className="cyber-btn-danger bg-transparent border-none text-slate-500 cursor-pointer text-sm px-1"
                    onClick={() => deleteKeyMut.mutate({ provider: p.provider })}
                    title="Remove key"
                  >
                    ×
                  </button>
                </div>
              ))}
          </div>
        ) : (
          <div className="text-center text-slate-500 p-5 text-[13px]">
            No providers configured. Click &quot;+ Add API Key&quot; above to get started.
          </div>
        )}
      </div>

      <div className="mb-6">
        <div className="flex justify-between items-center mb-2.5">
          <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide font-orbitron">
            Ollama Cloud Models
          </div>
        </div>
        <div className="flex gap-2 mb-3">
          <input
            className="cyber-input font-mono flex-1"
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
            className="cyber-btn-primary text-[12px] px-3.5 py-1.5 font-semibold"
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
          <div className="bg-bg-deep border border-neon-red rounded-md px-3 py-2 mb-2 text-[12px] text-neon-red">
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
              <div className="text-center text-slate-500 p-5 text-[13px]">
                No Ollama models configured. Enter a model name above and click &quot;Pull &amp; Add
                Model&quot;.
              </div>
            )
          }
          return (
            <div className="flex flex-col gap-1">
              {models.map((m) => {
                const isAvailable =
                  availableNames.has(m.name) ||
                  availableNames.has(m.name + ':latest') ||
                  [...availableNames].some((n) => n.startsWith(m.name))
                const status = pullStatus[m.name]
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 px-3 py-2 bg-bg-surface rounded-md border border-border-dim"
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${isAvailable ? 'bg-neon-green' : 'bg-neon-yellow'}`}
                      title={isAvailable ? 'Available' : 'Not yet pulled'}
                    />
                    <span className="text-[13px] font-mono flex-1">{m.name}</span>
                    {status === 'pulling' && (
                      <span className="text-[10px] text-neon-purple">pulling...</span>
                    )}
                    {status === 'success' && (
                      <span className="text-[10px] text-neon-green">ready</span>
                    )}
                    {!isAvailable && status !== 'pulling' && (
                      <button
                        className="cyber-btn-secondary bg-bg-elevated border-none rounded text-neon-purple cursor-pointer text-[10px] px-2 py-0.5 font-semibold"
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
                      className="bg-transparent border-none text-slate-500 cursor-pointer text-sm"
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

      <div className="mb-6">
        <div className="text-[13px] font-bold text-slate-400 mb-2.5 uppercase tracking-wide font-orbitron">
          Feature Flags ({features ? Object.keys(features).length : 0})
        </div>
        {features && Object.keys(features).length > 0 ? (
          <div className="flex flex-col gap-1">
            {Object.entries(features).map(([key, val]) => (
              <div
                key={key}
                className="flex justify-between items-center px-3 py-2 bg-bg-surface rounded-md border border-border-dim"
              >
                <span className="text-[12px] font-mono">{key}</span>
                <span
                  className={`font-semibold text-[11px] ${val ? 'text-neon-green' : 'text-neon-red'}`}
                >
                  {val ? 'ON' : 'OFF'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-slate-500 p-5 text-[13px]">
            No feature flags configured.
          </div>
        )}
      </div>

      <div className="mb-6">
        <div className="text-[13px] font-bold text-slate-400 mb-2.5 uppercase tracking-wide font-orbitron">
          System Policies ({policies ? Object.keys(policies).length : 0})
        </div>
        {policies && Object.keys(policies).length > 0 ? (
          <div className="flex flex-col gap-1">
            {Object.entries(policies).map(([key, val]) => (
              <div
                key={key}
                className="flex justify-between items-center px-3 py-2 bg-bg-surface rounded-md border border-border-dim"
              >
                <span className="text-[12px] font-mono">{key}</span>
                <span className="text-[11px] font-mono text-slate-500 max-w-[50%] overflow-hidden text-ellipsis">
                  {JSON.stringify(val)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-slate-500 p-5 text-[13px]">No policies defined.</div>
        )}
      </div>

      {cognition && (
        <div className="mb-6">
          <div className="text-[13px] font-bold text-slate-400 mb-2.5 uppercase tracking-wide font-orbitron">
            Cognition State
          </div>
          <div className="cyber-card bg-bg-surface rounded-lg p-3.5 border border-border-dim">
            <div className="text-[12px] text-slate-500">
              Last updated:{' '}
              {cognition.updatedAt ? new Date(cognition.updatedAt).toLocaleString() : 'unknown'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
