'use client'

/**
 * Settings — configure brain identity, feature flags, API keys, and system preferences.
 */

import { trpc } from '../../../utils/trpc'

export default function SettingsPage() {
  const featuresQuery = trpc.intelligence.features.useQuery()
  const policiesQuery = trpc.intelligence.policies.useQuery()
  const cognitionQuery = trpc.intelligence.cognitionState.useQuery()
  const providersQuery = trpc.gateway.listProviders.useQuery()

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
  const providers = providersQuery.data as string[] | undefined

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Settings</h2>
        <p style={styles.subtitle}>
          Configure brain identity, API keys, LLM providers, and system preferences.
        </p>
      </div>

      {error && (
        <div
          style={{
            background: '#1e1b4b',
            border: '1px solid #4338ca',
            borderRadius: 8,
            padding: '10px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ color: '#818cf8', fontSize: 14 }}>
            Database tables not yet provisioned.
          </span>
          <span style={{ color: '#6b7280', fontSize: 12 }}>
            Run the migration to populate data.
          </span>
        </div>
      )}

      <div style={styles.section}>
        <div style={styles.sectionTitle}>LLM Providers</div>
        {providers && providers.length > 0 ? (
          <div style={styles.providerList}>
            {providers.map((p) => (
              <div key={p} style={styles.providerRow}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#22c55e',
                    flexShrink: 0,
                  }}
                />
                <span style={styles.providerName}>{p}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.empty}>
            No providers configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env.
          </div>
        )}
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
