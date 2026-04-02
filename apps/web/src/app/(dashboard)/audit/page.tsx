'use client'

/**
 * Audit Log — governance event history.
 *
 * Shows who did what, on which resource, when.
 * Filterable by action type and resource type.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { EmptyState } from '../../../components/ui/empty-state'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { trpc } from '../../../utils/trpc'

const ACTION_LABELS: Record<string, string> = {
  create_mini_brain: 'Created Mini Brain',
  rotate_key: 'Rotated API Key',
  assign_role: 'Assigned Role',
  remove_role: 'Removed Role',
  add_workspace_member: 'Added Member',
  remove_workspace_member: 'Removed Member',
  update_member_role: 'Changed Member Role',
  delete_workspace: 'Deleted Workspace',
  change_autonomy: 'Changed Autonomy',
}

const RESOURCE_TYPES = ['brain_entity', 'workspace', 'user', 'agent']

export default function AuditPage() {
  const [actionFilter, setActionFilter] = useState('')
  const [resourceFilter, setResourceFilter] = useState('')
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const PAGE_SIZE = 20

  const query = trpc.governance.getAuditEvents.useQuery(
    {
      action: actionFilter || undefined,
      resourceType: resourceFilter || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    { staleTime: 10_000 },
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader title="Audit Log" />

      {query.error && <DbErrorBanner error={{ message: query.error.message }} />}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <select
          className="cyber-input text-xs py-1.5 px-2 w-48"
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value)
            setPage(0)
          }}
        >
          <option value="">All actions</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <select
          className="cyber-input text-xs py-1.5 px-2 w-40"
          value={resourceFilter}
          onChange={(e) => {
            setResourceFilter(e.target.value)
            setPage(0)
          }}
        >
          <option value="">All resources</option>
          {RESOURCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {(actionFilter || resourceFilter) && (
          <button
            className="text-xs text-slate-500 hover:text-slate-300"
            onClick={() => {
              setActionFilter('')
              setResourceFilter('')
              setPage(0)
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Event List */}
      {query.isLoading ? (
        <LoadingState message="Loading audit events..." fullHeight={false} />
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState title="No audit events found" />
      ) : (
        <SectionCard padding="sm">
          <div className="space-y-1">
            {(query.data ?? []).map((event) => (
              <div
                key={event.id}
                className="cyber-card hover:border-neon-teal/20 transition-colors"
              >
                <button
                  onClick={() => setExpanded(expanded === event.id ? null : event.id)}
                  className="w-full text-left p-3"
                >
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-600 font-mono w-36 flex-shrink-0">
                      {new Date(event.createdAt).toLocaleString()}
                    </span>
                    <span className="text-slate-400 w-32 truncate">{event.userEmail}</span>
                    <span className="text-neon-teal font-medium">
                      {ACTION_LABELS[event.action] ?? event.action}
                    </span>
                    <span className="text-slate-500">
                      {event.resourceType}
                      {event.resourceId ? ` ${event.resourceId.slice(0, 8)}...` : ''}
                    </span>
                    <span className="ml-auto text-slate-700">
                      {expanded === event.id ? '▾' : '▸'}
                    </span>
                  </div>
                </button>

                {expanded === event.id && event.metadata != null && (
                  <div className="px-3 pb-3 border-t border-border-dim">
                    <pre className="text-[10px] text-slate-500 font-mono mt-2 overflow-x-auto">
                      {JSON.stringify(event.metadata as Record<string, unknown>, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <button
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
          className="cyber-btn-sm cyber-btn-secondary text-xs disabled:opacity-30"
        >
          Previous
        </button>
        <span className="text-xs text-slate-500">Page {page + 1}</span>
        <button
          disabled={(query.data ?? []).length < PAGE_SIZE}
          onClick={() => setPage(page + 1)}
          className="cyber-btn-sm cyber-btn-secondary text-xs disabled:opacity-30"
        >
          Next
        </button>
      </div>
    </div>
  )
}
