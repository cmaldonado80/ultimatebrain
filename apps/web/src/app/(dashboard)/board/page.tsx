'use client'

/**
 * Project Board — Kanban view of tickets flowing through the corporation.
 *
 * Columns: Backlog → Queued → In Progress → Review → Done
 * Cards show: title, priority, assigned agent, workspace
 */

import Link from 'next/link'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

const COLUMNS = [
  { status: 'backlog', label: 'Backlog', color: 'slate' as const },
  { status: 'queued', label: 'Queued', color: 'blue' as const },
  { status: 'in_progress', label: 'In Progress', color: 'yellow' as const },
  { status: 'review', label: 'Review', color: 'purple' as const },
  { status: 'done', label: 'Done', color: 'green' as const },
]

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'border-l-neon-red',
  high: 'border-l-neon-yellow',
  medium: 'border-l-neon-blue',
  low: 'border-l-slate-600',
}

export default function BoardPage() {
  const ticketsQuery = trpc.tickets.list.useQuery({ limit: 200, offset: 0 })
  const agentsQuery = trpc.agents.list.useQuery({ limit: 500, offset: 0 })
  const workspacesQuery = trpc.workspaces.list.useQuery({ limit: 100, offset: 0 })
  const orgQuery = trpc.org.chart.useQuery()

  if (ticketsQuery.isLoading) return <LoadingState message="Loading Project Board..." />
  if (ticketsQuery.error)
    return (
      <div className="p-6">
        <DbErrorBanner error={ticketsQuery.error} />
      </div>
    )

  const allTickets = (ticketsQuery.data ?? []) as Array<{
    id: string
    title: string
    status: string
    priority: string
    assignedAgentId: string | null
    workspaceId: string | null
  }>
  const agents = (agentsQuery.data ?? []) as Array<{ id: string; name: string }>
  const workspaces = (workspacesQuery.data ?? []) as Array<{ id: string; name: string }>

  const agentMap = new Map(agents.map((a) => [a.id, a.name]))
  const wsMap = new Map(workspaces.map((w) => [w.id, w.name]))

  // Map agent → department from org chart
  const agentDeptMap = new Map<string, string>()
  if (orgQuery.data) {
    const orgData = orgQuery.data as {
      departments: Array<{ name: string; employees: Array<{ id: string }> }>
    }
    for (const dept of orgData.departments) {
      for (const emp of dept.employees) {
        agentDeptMap.set(emp.id, dept.name)
      }
    }
  }

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Project Board"
        subtitle={`${allTickets.length} tickets across ${COLUMNS.length} stages`}
      />

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const columnTickets = allTickets.filter((t) => t.status === col.status)

          return (
            <div key={col.status} className="flex-shrink-0 w-72">
              {/* Column Header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <StatusBadge label={col.label} color={col.color} />
                <span className="text-[10px] text-slate-500">{columnTickets.length}</span>
              </div>

              {/* Column Body */}
              <div className="space-y-2 min-h-[200px] bg-bg-deep/50 rounded-lg p-2">
                {columnTickets.length === 0 ? (
                  <div className="text-[10px] text-slate-700 text-center py-8">
                    No tickets yet.{' '}
                    <a href="/tickets" className="text-neon-teal hover:underline">
                      Create one
                    </a>
                  </div>
                ) : (
                  columnTickets.map((ticket) => (
                    <Link
                      key={ticket.id}
                      href={`/tickets`}
                      className={`block bg-bg-surface border border-border-dim rounded-lg p-3 hover:border-neon-teal/30 transition-colors no-underline border-l-2 ${PRIORITY_COLORS[ticket.priority] ?? 'border-l-slate-700'}`}
                    >
                      <div className="text-[11px] text-slate-200 font-medium mb-1 line-clamp-2">
                        {ticket.title}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge
                          label={ticket.priority}
                          color={
                            ticket.priority === 'critical'
                              ? 'red'
                              : ticket.priority === 'high'
                                ? 'yellow'
                                : 'slate'
                          }
                        />
                        {ticket.assignedAgentId && (
                          <span className="text-[9px] text-neon-purple">
                            {agentMap.get(ticket.assignedAgentId) ?? 'Agent'}
                          </span>
                        )}
                        {ticket.assignedAgentId && agentDeptMap.get(ticket.assignedAgentId) && (
                          <span className="text-[9px] text-neon-teal/60">
                            {agentDeptMap.get(ticket.assignedAgentId)}
                          </span>
                        )}
                        {ticket.workspaceId && (
                          <span className="text-[9px] text-slate-600">
                            {wsMap.get(ticket.workspaceId) ?? ''}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
