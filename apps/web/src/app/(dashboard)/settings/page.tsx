'use client'

/**
 * Settings — configure system identity, feature flags, API keys, and system preferences.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
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
      setNewModelName('')
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
      <div className="p-6 text-slate-50">
        <LoadingState message="Loading settings..." />
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
      <PageHeader
        title="Settings"
        subtitle="Configure LLM providers, feature flags, and system policies"
        showOrgBadge={false}
      />
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
      {/* OpenClaw Gateway Status */}
      <div className="mb-6">
        <div className="text-[13px] font-bold text-slate-400 mb-2.5 uppercase tracking-wide font-orbitron">
          OpenClaw Gateway
        </div>
        <OpenClawStatus />
      </div>
    </div>
  )
}

function OpenClawStatus() {
  const statusQuery = trpc.entities.openclawHealth.useQuery(undefined, {
    staleTime: 30_000,
    retry: false,
  })
  const status = statusQuery.data as {
    connected: boolean
    version?: string | null
    lastSeen?: string | null
    capabilities?: {
      providers?: number
      channels?: number
      skills?: number
      mcpServers?: number
    }
  } | null

  if (statusQuery.isLoading) {
    return <div className="cyber-card p-3.5 text-[12px] text-slate-500">Checking OpenClaw...</div>
  }

  if (!status || !status.connected) {
    return (
      <div className="cyber-card p-3.5 border-neon-yellow/20">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-500" />
          <span className="text-[12px] text-slate-400">Not connected</span>
        </div>
        <div className="text-[10px] text-slate-600">
          Set <code className="text-slate-500">OPENCLAW_WS</code> environment variable to enable.
          Install with: <code className="text-slate-500">npm install -g openclaw@latest</code>
        </div>
      </div>
    )
  }

  const caps = status.capabilities
  return (
    <div className="cyber-card p-3.5 border-neon-green/20">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full bg-neon-green" />
        <span className="text-[12px] text-neon-green font-medium">Connected</span>
        {status.version && (
          <span className="text-[10px] text-slate-500 ml-auto">v{status.version}</span>
        )}
      </div>
      {caps && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div>
            <div className="text-[14px] font-bold text-neon-blue">{caps.providers ?? 0}</div>
            <div className="text-[9px] text-slate-500">Providers</div>
          </div>
          <div>
            <div className="text-[14px] font-bold text-neon-purple">{caps.channels ?? 0}</div>
            <div className="text-[9px] text-slate-500">Channels</div>
          </div>
          <div>
            <div className="text-[14px] font-bold text-neon-teal">{caps.skills ?? 0}</div>
            <div className="text-[9px] text-slate-500">Skills</div>
          </div>
          <div>
            <div className="text-[14px] font-bold text-neon-green">{caps.mcpServers ?? 0}</div>
            <div className="text-[9px] text-slate-500">MCP Servers</div>
          </div>
        </div>
      )}
      {status.lastSeen && (
        <div className="text-[10px] text-slate-600 mt-2">
          Last seen: {new Date(status.lastSeen).toLocaleString()}
        </div>
      )}
    </div>
  )
}
