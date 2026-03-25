'use client'

/**
 * Canvas — feature flags and system policies dashboard.
 */

import { trpc } from '../../../utils/trpc'
import { DbErrorBanner } from '../../../components/db-error-banner'

export default function CanvasPage() {
  const featuresQuery = trpc.intelligence.features.useQuery()
  const policiesQuery = trpc.intelligence.policies.useQuery()
  const setFeatureMut = trpc.intelligence.setFeature.useMutation()
  const utils = trpc.useUtils()

  const error = featuresQuery.error || policiesQuery.error

  if (error) {
    return (
      <div style={styles.page}>
        <DbErrorBanner error={error} />
      </div>
    )
  }

  const isLoading = featuresQuery.isLoading || policiesQuery.isLoading

  const handleToggleFeature = async (name: string, enabled: boolean) => {
    await setFeatureMut.mutateAsync({ name, enabled })
    utils.intelligence.features.invalidate()
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
          <div style={{ fontSize: 13 }}>Fetching canvas data</div>
        </div>
      </div>
    )
  }

  const features = featuresQuery.data as Record<string, boolean> | undefined
  const policies = policiesQuery.data as Record<string, unknown> | undefined

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Canvas</h2>
        <p style={styles.subtitle}>
          Visual workspace for orchestrating agent workflows and viewing execution graphs.
        </p>
      </div>
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Feature Flags</div>
        {features && Object.keys(features).length > 0 ? (
          <div style={styles.list}>
            {Object.entries(features).map(([name, enabled]) => (
              <div key={name} style={styles.featureRow}>
                <span style={styles.featureName}>{name}</span>
                <button
                  style={enabled ? styles.enabledBtn : styles.disabledBtn}
                  onClick={() => handleToggleFeature(name, !enabled)}
                >
                  {enabled ? 'ON' : 'OFF'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.empty}>No feature flags configured.</div>
        )}
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>System Policies</div>
        {policies && Object.keys(policies).length > 0 ? (
          <div style={styles.list}>
            {Object.entries(policies).map(([name, value]) => (
              <div key={name} style={styles.policyRow}>
                <span style={styles.policyName}>{name}</span>
                <span style={styles.policyValue}>{JSON.stringify(value)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.empty}>No system policies defined.</div>
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
  list: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  featureRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#1f2937',
    borderRadius: 6,
    padding: '10px 14px',
    border: '1px solid #374151',
  },
  featureName: { fontSize: 13, fontFamily: 'monospace' },
  enabledBtn: {
    background: '#166534',
    color: '#f9fafb',
    border: 'none',
    borderRadius: 4,
    padding: '3px 12px',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    minWidth: 40,
  },
  disabledBtn: {
    background: '#374151',
    color: '#9ca3af',
    border: 'none',
    borderRadius: 4,
    padding: '3px 12px',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    minWidth: 40,
  },
  policyRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#1f2937',
    borderRadius: 6,
    padding: '10px 14px',
    border: '1px solid #374151',
  },
  policyName: { fontSize: 13, fontFamily: 'monospace', fontWeight: 600 },
  policyValue: { fontSize: 11, fontFamily: 'monospace', color: '#6b7280' },
}
