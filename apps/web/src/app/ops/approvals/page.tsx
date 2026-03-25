'use client'

/**
 * Approvals — view and decide on pending approval gates.
 */

import { trpc } from '../../../utils/trpc'
import { DbErrorBanner } from '../../../components/db-error-banner'

interface ApprovalGate {
  id: string
  action: string
  agentId: string | null
  risk: string | null
  status: string
  requestedAt: Date
  decidedAt: Date | null
  expiresAt: Date | null
  decidedBy: string | null
  reason: string | null
  metadata: unknown
}

export default function ApprovalsPage() {
  const { data, isLoading, error } = trpc.approvals.pending.useQuery()

  if (error) {
    return (
      <div style={styles.page}>
        <DbErrorBanner error={error} />
      </div>
    )
  }
  const decideMutation = trpc.approvals.decide.useMutation()
  const utils = trpc.useUtils()

  const handleDecide = async (id: string, decision: 'approved' | 'denied') => {
    await decideMutation.mutateAsync({
      id,
      status: decision,
      decidedBy: 'anonymous',
      reason: `${decision} via UI`,
    })
    utils.approvals.pending.invalidate()
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
          <div style={{ fontSize: 13 }}>Fetching approvals</div>
        </div>
      </div>
    )
  }

  const gates: ApprovalGate[] = (data as ApprovalGate[]) ?? []

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Approvals</h2>
        <p style={styles.subtitle}>
          Review and approve pending agent actions that require human-in-the-loop authorization.
        </p>
      </div>
      {gates.length === 0 ? (
        <div style={styles.empty}>No pending approvals. All clear.</div>
      ) : (
        <div style={styles.list}>
          {gates.map((g) => (
            <div key={g.id} style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.action}>{g.action}</span>
                {g.risk && (
                  <span
                    style={{
                      ...styles.riskBadge,
                      color:
                        g.risk === 'high' ? '#ef4444' : g.risk === 'medium' ? '#f97316' : '#22c55e',
                    }}
                  >
                    {g.risk} risk
                  </span>
                )}
              </div>
              <div style={styles.meta}>
                {g.agentId && <span>Agent: {g.agentId.slice(0, 8)}</span>}
                <span>Requested: {new Date(g.requestedAt).toLocaleString()}</span>
                {g.expiresAt && <span>Expires: {new Date(g.expiresAt).toLocaleString()}</span>}
              </div>
              <div style={styles.actions}>
                <button
                  style={styles.approveBtn}
                  onClick={() => handleDecide(g.id, 'approved')}
                  disabled={decideMutation.isPending}
                >
                  Approve
                </button>
                <button
                  style={styles.denyBtn}
                  onClick={() => handleDecide(g.id, 'denied')}
                  disabled={decideMutation.isPending}
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
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
  empty: { textAlign: 'center' as const, color: '#6b7280', padding: 40, fontSize: 14 },
  list: { display: 'flex', flexDirection: 'column' as const, gap: 12 },
  card: { background: '#1f2937', borderRadius: 8, padding: 16, border: '1px solid #374151' },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  action: { fontSize: 14, fontWeight: 700, fontFamily: 'monospace' },
  riskBadge: { fontSize: 11, fontWeight: 600 },
  meta: { display: 'flex', gap: 16, fontSize: 11, color: '#6b7280', marginBottom: 12 },
  actions: { display: 'flex', gap: 8 },
  approveBtn: {
    background: '#166534',
    color: '#f9fafb',
    border: 'none',
    borderRadius: 6,
    padding: '6px 16px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  denyBtn: {
    background: '#7f1d1d',
    color: '#f9fafb',
    border: 'none',
    borderRadius: 6,
    padding: '6px 16px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
}
