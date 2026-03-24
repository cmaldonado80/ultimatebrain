'use client'

/**
 * Integrations — manage channels and webhooks.
 */

import { trpc } from '../../../utils/trpc'

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
  const channelsQuery = trpc.integrations.channels.useQuery()
  const webhooksQuery = trpc.integrations.webhooks.useQuery()
  const toggleChannelMut = trpc.integrations.toggleChannel.useMutation()
  const toggleWebhookMut = trpc.integrations.toggleWebhook.useMutation()
  const utils = trpc.useUtils()

  const isLoading = channelsQuery.isLoading || webhooksQuery.isLoading
  const error = channelsQuery.error || webhooksQuery.error

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
          <div style={{ fontSize: 13 }}>Fetching integrations</div>
        </div>
      </div>
    )
  }

  if (error) {
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
        <div style={{ textAlign: 'center', color: '#f87171' }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            Error loading integrations
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>{error.message}</div>
        </div>
      </div>
    )
  }

  const channels: Channel[] = channelsQuery.data ?? []
  const webhooks: Webhook[] = webhooksQuery.data ?? []

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Integrations</h2>
        <p style={styles.subtitle}>
          Connect third-party services — GitHub, Slack, Jira, and custom webhooks.
        </p>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Channels ({channels.length})</div>
        {channels.length === 0 ? (
          <div style={styles.empty}>No channels configured.</div>
        ) : (
          <div style={styles.list}>
            {channels.map((ch) => (
              <div key={ch.id} style={styles.card}>
                <div style={styles.cardTop}>
                  <span style={styles.cardName}>{ch.type}</span>
                  <button
                    style={ch.enabled ? styles.enabledBtn : styles.disabledBtn}
                    onClick={() => handleToggleChannel(ch.id, !ch.enabled)}
                  >
                    {ch.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                <div style={styles.meta}>ID: {ch.id.slice(0, 8)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Webhooks ({webhooks.length})</div>
        {webhooks.length === 0 ? (
          <div style={styles.empty}>No webhooks configured.</div>
        ) : (
          <div style={styles.list}>
            {webhooks.map((wh) => (
              <div key={wh.id} style={styles.card}>
                <div style={styles.cardTop}>
                  <span style={styles.cardName}>{wh.source}</span>
                  <button
                    style={wh.enabled ? styles.enabledBtn : styles.disabledBtn}
                    onClick={() => handleToggleWebhook(wh.id, !wh.enabled)}
                  >
                    {wh.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                <div style={styles.webhookUrl}>{wh.url}</div>
              </div>
            ))}
          </div>
        )}
      </div>
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
  list: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  card: { background: '#1f2937', borderRadius: 8, padding: 14, border: '1px solid #374151' },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardName: { fontSize: 14, fontWeight: 700 },
  meta: { fontSize: 10, color: '#4b5563' },
  webhookUrl: { fontSize: 11, fontFamily: 'monospace', color: '#6b7280' },
  enabledBtn: {
    background: '#166534',
    color: '#f9fafb',
    border: 'none',
    borderRadius: 4,
    padding: '3px 10px',
    fontSize: 11,
    cursor: 'pointer',
  },
  disabledBtn: {
    background: '#374151',
    color: '#9ca3af',
    border: 'none',
    borderRadius: 4,
    padding: '3px 10px',
    fontSize: 11,
    cursor: 'pointer',
  },
}
