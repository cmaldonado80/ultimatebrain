'use client'

/**
 * Database Management — provision and manage per-mini-brain Neon databases.
 */

import { useState } from 'react'
import { trpc } from '../../../../utils/trpc'

export default function DatabasesPage() {
  // Fetch all mini-brain entities
  const entitiesQuery = trpc.platform.entitiesByTier.useQuery({ tier: 'mini_brain' })
  const provisionMut = trpc.factory.provisionDatabase.useMutation()
  const deprovisionMut = trpc.factory.deprovisionDatabase.useMutation()

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const entities = entitiesQuery.data ?? []

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Databases</h2>
        <p style={styles.subtitle}>
          Provision dedicated PostgreSQL databases for mini-brains via Neon
        </p>
      </div>

      {/* Entity database cards */}
      <div style={styles.grid}>
        {entities.map((entity) => (
          <DatabaseCard
            key={entity.id}
            entity={entity}
            provisionMut={provisionMut}
            deprovisionMut={deprovisionMut}
            confirmDelete={confirmDelete}
            setConfirmDelete={setConfirmDelete}
            onRefresh={() => entitiesQuery.refetch()}
          />
        ))}
      </div>

      {entities.length === 0 && !entitiesQuery.isLoading && (
        <div style={styles.empty}>
          No mini-brains found. Create one from the Brain Manager first.
        </div>
      )}

      {entitiesQuery.isLoading && <div style={styles.empty}>Loading mini-brains...</div>}
    </div>
  )
}

function DatabaseCard({
  entity,
  provisionMut,
  deprovisionMut,
  confirmDelete,
  setConfirmDelete,
  onRefresh,
}: {
  entity: {
    id: string
    name: string
    domain: string | null
    status: string
    databaseUrl?: string | null
    config?: unknown
  }
  provisionMut: ReturnType<typeof trpc.factory.provisionDatabase.useMutation>
  deprovisionMut: ReturnType<typeof trpc.factory.deprovisionDatabase.useMutation>
  confirmDelete: string | null
  setConfirmDelete: (id: string | null) => void
  onRefresh: () => void
}) {
  const dbStatus = trpc.factory.databaseStatus.useQuery({ entityId: entity.id })
  const data = dbStatus.data
  const provisioned = data?.provisioned ?? false
  const neonAvailable = data?.neonAvailable ?? false

  const [provisionResult, setProvisionResult] = useState<string | null>(null)

  async function handleProvision() {
    setProvisionResult(null)
    try {
      const result = await provisionMut.mutateAsync({ entityId: entity.id })
      setProvisionResult(`Database provisioned at ${result.host}`)
      dbStatus.refetch()
      onRefresh()
    } catch (err) {
      setProvisionResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleDeprovision() {
    try {
      await deprovisionMut.mutateAsync({ entityId: entity.id })
      setConfirmDelete(null)
      setProvisionResult(null)
      dbStatus.refetch()
      onRefresh()
    } catch (err) {
      setProvisionResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <span
          style={{
            ...styles.statusDot,
            background: provisioned ? '#22c55e' : '#6b7280',
          }}
        />
        <span style={styles.cardName}>{entity.name}</span>
        {entity.domain && <span style={styles.domainBadge}>{entity.domain}</span>}
      </div>

      <div style={styles.cardBody}>
        {provisioned && data?.host && (
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Host</span>
            <code style={styles.infoValue}>{data.host}</code>
          </div>
        )}

        {provisioned && data?.branchId && (
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Branch</span>
            <code style={styles.infoValue}>{data.branchId}</code>
          </div>
        )}

        {!provisioned && (
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
            No database provisioned
          </div>
        )}

        {!neonAvailable && (
          <div style={styles.warning}>
            Neon API not configured. Set NEON_API_KEY and NEON_PROJECT_ID in Vercel env vars.
          </div>
        )}

        {provisionResult && (
          <div
            style={{
              ...styles.resultBanner,
              borderColor: provisionResult.startsWith('Error') ? '#ef4444' : '#22c55e',
              color: provisionResult.startsWith('Error') ? '#fca5a5' : '#86efac',
            }}
          >
            {provisionResult}
          </div>
        )}
      </div>

      <div style={styles.cardFooter}>
        {!provisioned && neonAvailable && (
          <button
            style={styles.btnPrimary}
            onClick={handleProvision}
            disabled={provisionMut.isPending}
          >
            {provisionMut.isPending ? 'Provisioning...' : 'Provision Database'}
          </button>
        )}

        {provisioned && neonAvailable && (
          <>
            {confirmDelete === entity.id ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={styles.btnDanger} onClick={handleDeprovision}>
                  Confirm Delete
                </button>
                <button style={styles.btnSecondary} onClick={() => setConfirmDelete(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button style={styles.btnSecondary} onClick={() => setConfirmDelete(entity.id)}>
                Deprovision
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: { padding: 24, fontFamily: 'sans-serif', color: '#f9fafb', maxWidth: 1000 },
  header: { marginBottom: 24 },
  title: { margin: 0, fontSize: 20, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320, 1fr))',
    gap: 16,
  },
  card: {
    background: '#1f2937',
    borderRadius: 8,
    border: '1px solid #374151',
    padding: 16,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  cardName: { fontWeight: 700, fontSize: 14, flex: 1 },
  domainBadge: {
    fontSize: 10,
    background: '#818cf820',
    color: '#818cf8',
    padding: '2px 8px',
    borderRadius: 4,
    fontWeight: 600,
  },
  cardBody: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  infoRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'baseline',
  },
  infoLabel: {
    fontSize: 11,
    color: '#6b7280',
    minWidth: 50,
  },
  infoValue: {
    fontSize: 11,
    color: '#a5f3fc',
    background: '#111827',
    padding: '2px 6px',
    borderRadius: 4,
    wordBreak: 'break-all' as const,
  },
  warning: {
    fontSize: 11,
    color: '#f59e0b',
    background: '#f59e0b10',
    padding: '6px 10px',
    borderRadius: 4,
    border: '1px solid #f59e0b30',
  },
  resultBanner: {
    fontSize: 11,
    padding: '6px 10px',
    borderRadius: 4,
    border: '1px solid',
    marginTop: 4,
  },
  cardFooter: {
    display: 'flex',
    gap: 8,
    marginTop: 4,
  },
  btnPrimary: {
    background: '#818cf8',
    color: '#f9fafb',
    border: 'none',
    borderRadius: 6,
    padding: '7px 16px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnSecondary: {
    background: '#374151',
    color: '#d1d5db',
    border: '1px solid #4b5563',
    borderRadius: 6,
    padding: '7px 16px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnDanger: {
    background: '#dc2626',
    color: '#f9fafb',
    border: 'none',
    borderRadius: 6,
    padding: '7px 16px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  empty: {
    textAlign: 'center' as const,
    color: '#6b7280',
    padding: 40,
    fontSize: 13,
  },
}
