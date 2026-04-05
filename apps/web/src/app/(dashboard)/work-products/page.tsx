'use client'

/**
 * Work Products — View and review agent deliverables across tickets.
 */

import { useState } from 'react'

import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

export default function WorkProductsPage() {
  const [ticketId, setTicketId] = useState('')
  const [submitted, setSubmitted] = useState('')

  const utils = trpc.useUtils()
  const productsQuery = trpc.orchestration.workProductsList.useQuery(
    { ticketId: submitted },
    { enabled: !!submitted },
  )
  const reviewMutation = trpc.orchestration.workProductReview.useMutation({
    onSuccess: () => utils.orchestration.workProductsList.invalidate(),
  })

  const products = (productsQuery.data ?? []) as unknown as Array<{
    id: string
    name: string
    type: string
    content: string | null
    reviewState: string
    isPrimary: boolean
    agentId: string | null
    createdAt: string
  }>

  const reviewColors: Record<string, 'green' | 'yellow' | 'red' | 'blue' | 'slate'> = {
    approved: 'green',
    needs_revision: 'yellow',
    rejected: 'red',
    pending: 'blue',
  }

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Work Products"
        subtitle="Agent deliverables — code, documents, reports, data"
      />

      <SectionCard title="Load Work Products by Ticket" className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={ticketId}
            onChange={(e) => setTicketId(e.target.value)}
            placeholder="Enter ticket ID (UUID)..."
            className="flex-1 bg-bg-elevated border border-border-dim rounded px-3 py-1.5 text-sm text-slate-200 focus:border-neon-teal focus:outline-none"
          />
          <button
            onClick={() => setSubmitted(ticketId.trim())}
            disabled={!ticketId.trim()}
            className="cyber-btn-primary cyber-btn-sm disabled:opacity-50"
          >
            Load
          </button>
        </div>
      </SectionCard>

      {submitted && productsQuery.error && (
        <div className="text-neon-red text-sm mb-4">
          Failed to load work products. Please retry.
        </div>
      )}

      {submitted && !productsQuery.error && (
        <SectionCard title={`Deliverables (${products.length})`}>
          {productsQuery.isLoading ? (
            <div className="text-xs text-slate-500 py-6 text-center">Loading...</div>
          ) : products.length === 0 ? (
            <div className="text-xs text-slate-600 py-6 text-center">
              No work products for this ticket.
            </div>
          ) : (
            <div className="space-y-3">
              {products.map((p) => (
                <div key={p.id} className="cyber-card p-3">
                  <div className="flex items-center gap-2 mb-2">
                    {p.isPrimary && <StatusBadge label="primary" color="green" />}
                    <span className="text-sm font-medium">{p.name}</span>
                    <StatusBadge label={p.type} color="blue" />
                    <StatusBadge
                      label={p.reviewState}
                      color={reviewColors[p.reviewState] ?? 'slate'}
                    />
                    <span className="text-[9px] text-slate-600 ml-auto">
                      {new Date(p.createdAt).toLocaleString()}
                    </span>
                  </div>

                  {p.content && (
                    <pre className="bg-bg-deep rounded px-3 py-2 text-[10px] text-slate-300 overflow-auto max-h-48 mb-2">
                      {p.content.slice(0, 3000)}
                      {(p.content?.length ?? 0) > 3000 && '\n... (truncated)'}
                    </pre>
                  )}

                  <div className="flex gap-1">
                    {(['approved', 'needs_revision', 'rejected'] as const).map((state) => (
                      <button
                        key={state}
                        onClick={() =>
                          reviewMutation.mutate({ artifactId: p.id, reviewState: state })
                        }
                        disabled={reviewMutation.isPending || p.reviewState === state}
                        className={`text-[9px] px-2 py-0.5 rounded border ${
                          p.reviewState === state
                            ? 'border-neon-teal text-neon-teal'
                            : 'border-border-dim text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {state.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  )
}
