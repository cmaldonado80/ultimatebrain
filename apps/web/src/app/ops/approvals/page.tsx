'use client'

/**
 * Approvals — view and decide on pending approval gates.
 */

import { DbErrorBanner } from '../../../components/db-error-banner'
import { EmptyState } from '../../../components/ui/empty-state'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { trpc } from '../../../utils/trpc'

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

  const decideMutation = trpc.approvals.decide.useMutation()
  const utils = trpc.useUtils()

  if (error) {
    return (
      <div className="p-6 text-slate-50">
        <DbErrorBanner error={error} />
      </div>
    )
  }

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
    return <LoadingState message="Loading approvals..." />
  }

  const gates: ApprovalGate[] = (data as ApprovalGate[]) ?? []

  return (
    <div className="p-6 text-slate-50">
      <PageHeader title="Approvals" />
      {gates.length === 0 ? (
        <EmptyState title="No pending approvals" message="All clear." />
      ) : (
        <div className="flex flex-col gap-3">
          {gates.map((g) => (
            <div key={g.id} className="cyber-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold font-mono">{g.action}</span>
                {g.risk && (
                  <span
                    className={`text-[11px] font-semibold ${
                      g.risk === 'high'
                        ? 'text-neon-red'
                        : g.risk === 'medium'
                          ? 'text-orange-500'
                          : 'text-neon-green'
                    }`}
                  >
                    {g.risk} risk
                  </span>
                )}
              </div>
              <div className="flex gap-4 text-[11px] text-slate-500 mb-3">
                {g.agentId && <span>Agent: {g.agentId.slice(0, 8)}</span>}
                <span>Requested: {new Date(g.requestedAt).toLocaleString()}</span>
                {g.expiresAt && <span>Expires: {new Date(g.expiresAt).toLocaleString()}</span>}
              </div>
              <div className="flex gap-2">
                <button
                  className="cyber-btn-primary text-xs font-semibold px-4 py-1.5"
                  onClick={() => handleDecide(g.id, 'approved')}
                  disabled={decideMutation.isPending}
                >
                  Approve
                </button>
                <button
                  className="cyber-btn-danger text-xs font-semibold px-4 py-1.5"
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
