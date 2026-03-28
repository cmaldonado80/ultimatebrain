'use client'

/**
 * Integrations — manage channels and webhooks.
 */

import { useState } from 'react'
import { trpc } from '../../../utils/trpc'
import { DbErrorBanner } from '../../../components/db-error-banner'

interface Channel {
  id: string
  type: string
  config: unknown
  enabled: boolean | null
  createdAt: Date
}

interface Webhook {
  id: string
  source: string | null
  url: string
  secret: string | null
  enabled: boolean | null
  createdAt: Date
}

export default function IntegrationsPage() {
  const [showChannelForm, setShowChannelForm] = useState(false)
  const [showWebhookForm, setShowWebhookForm] = useState(false)
  const [channelType, setChannelType] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookSource, setWebhookSource] = useState('')
  const channelsQuery = trpc.integrations.channels.useQuery()
  const webhooksQuery = trpc.integrations.webhooks.useQuery()
  const toggleChannelMut = trpc.integrations.toggleChannel.useMutation()
  const toggleWebhookMut = trpc.integrations.toggleWebhook.useMutation()
  const createChannelMut = trpc.integrations.createChannel.useMutation()
  const createWebhookMut = trpc.integrations.createWebhook.useMutation()
  const utils = trpc.useUtils()

  const error = channelsQuery.error || webhooksQuery.error

  if (error) {
    return (
      <div className="p-6 text-slate-50">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  const isLoading = channelsQuery.isLoading || webhooksQuery.isLoading

  const handleToggleChannel = async (id: string, enabled: boolean) => {
    await toggleChannelMut.mutateAsync({ id, enabled })
    utils.integrations.channels.invalidate()
  }

  const handleToggleWebhook = async (id: string, enabled: boolean) => {
    await toggleWebhookMut.mutateAsync({ id, enabled })
    utils.integrations.webhooks.invalidate()
  }

  if (isLoading) {
    return (
      <div className="p-6 text-slate-50 flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-500">
          <div className="text-2xl mb-2">Loading...</div>
          <div className="text-[13px]">Fetching integrations</div>
        </div>
      </div>
    )
  }

  const channels: Channel[] = (channelsQuery.data as Channel[]) ?? []
  const webhooks: Webhook[] = (webhooksQuery.data as Webhook[]) ?? []

  return (
    <div className="p-6 text-slate-50">
      <div className="mb-5">
        <h2 className="m-0 text-[22px] font-bold font-orbitron">Integrations</h2>
        <p className="mt-1 mb-0 text-[13px] text-slate-500">
          Connect third-party services — GitHub, Slack, Jira, and custom webhooks.
        </p>
      </div>

      {/* Channels */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2.5">
          <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide">
            Channels ({channels.length})
          </div>
          <button
            className="cyber-btn-primary cyber-btn-sm"
            onClick={() => setShowChannelForm(!showChannelForm)}
          >
            {showChannelForm ? 'Cancel' : '+ Add Channel'}
          </button>
        </div>

        {showChannelForm && (
          <div className="bg-bg-elevated rounded-lg p-3.5 border border-border mb-3">
            <div className="flex gap-2 items-center">
              <select
                className="cyber-select text-xs"
                value={channelType}
                onChange={(e) => setChannelType(e.target.value)}
              >
                <option value="">Select type...</option>
                <option value="slack">Slack</option>
                <option value="discord">Discord</option>
                <option value="github">GitHub</option>
                <option value="jira">Jira</option>
                <option value="webhook">Webhook</option>
              </select>
              <button
                className="bg-green-600 hover:bg-green-700 text-white border-none rounded-md px-3.5 py-1.5 text-xs font-semibold cursor-pointer transition-colors"
                onClick={() => {
                  if (!channelType) return
                  createChannelMut.mutate(
                    { type: channelType, enabled: true },
                    {
                      onSuccess: () => {
                        utils.integrations.channels.invalidate()
                        setShowChannelForm(false)
                        setChannelType('')
                      },
                    },
                  )
                }}
                disabled={createChannelMut.isPending || !channelType}
              >
                {createChannelMut.isPending ? 'Adding...' : 'Add'}
              </button>
              {createChannelMut.error && (
                <span className="text-neon-red text-[11px]">{createChannelMut.error.message}</span>
              )}
            </div>
          </div>
        )}

        {channels.length === 0 ? (
          <div className="text-center text-slate-500 py-5 text-[13px]">No channels configured.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {channels.map((ch) => (
              <div key={ch.id} className="cyber-card p-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-bold">{ch.type}</span>
                  <button
                    className={`border-none rounded px-2.5 py-0.5 text-[11px] cursor-pointer ${
                      ch.enabled ? 'bg-green-900 text-slate-50' : 'bg-slate-700 text-slate-400'
                    }`}
                    onClick={() => handleToggleChannel(ch.id, !ch.enabled)}
                  >
                    {ch.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                <div className="text-[10px] text-slate-600">ID: {ch.id.slice(0, 8)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Webhooks */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2.5">
          <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide">
            Webhooks ({webhooks.length})
          </div>
          <button
            className="cyber-btn-primary cyber-btn-sm"
            onClick={() => setShowWebhookForm(!showWebhookForm)}
          >
            {showWebhookForm ? 'Cancel' : '+ Add Webhook'}
          </button>
        </div>

        {showWebhookForm && (
          <div className="bg-bg-elevated rounded-lg p-3.5 border border-border mb-3">
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  className="cyber-input text-xs flex-1"
                  placeholder="Source (e.g. github, custom)..."
                  value={webhookSource}
                  onChange={(e) => setWebhookSource(e.target.value)}
                />
                <input
                  className="cyber-input text-xs flex-[2] font-mono"
                  placeholder="https://..."
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                />
              </div>
              <div className="flex gap-2 items-center">
                <button
                  className="bg-green-600 hover:bg-green-700 text-white border-none rounded-md px-3.5 py-1.5 text-xs font-semibold cursor-pointer transition-colors"
                  onClick={() => {
                    if (!webhookUrl.trim()) return
                    createWebhookMut.mutate(
                      {
                        url: webhookUrl.trim(),
                        source: webhookSource.trim() || undefined,
                        enabled: true,
                      },
                      {
                        onSuccess: () => {
                          utils.integrations.webhooks.invalidate()
                          setShowWebhookForm(false)
                          setWebhookUrl('')
                          setWebhookSource('')
                        },
                      },
                    )
                  }}
                  disabled={createWebhookMut.isPending || !webhookUrl.trim()}
                >
                  {createWebhookMut.isPending ? 'Adding...' : 'Add Webhook'}
                </button>
                {createWebhookMut.error && (
                  <span className="text-neon-red text-[11px]">
                    {createWebhookMut.error.message}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {webhooks.length === 0 ? (
          <div className="text-center text-slate-500 py-5 text-[13px]">No webhooks configured.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {webhooks.map((wh) => (
              <div key={wh.id} className="cyber-card p-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-bold">{wh.source}</span>
                  <button
                    className={`border-none rounded px-2.5 py-0.5 text-[11px] cursor-pointer ${
                      wh.enabled ? 'bg-green-900 text-slate-50' : 'bg-slate-700 text-slate-400'
                    }`}
                    onClick={() => handleToggleWebhook(wh.id, !wh.enabled)}
                  >
                    {wh.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                <div className="text-[11px] font-mono text-slate-500">{wh.url}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
