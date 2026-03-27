'use client'

/**
 * Tickets — list all tickets from the database.
 */

import { useState } from 'react'
import { trpc } from '../../../utils/trpc'
import ConfirmDialog from '../../../components/ui/confirm-dialog'
import { DbErrorBanner } from '../../../components/db-error-banner'

interface Ticket {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  complexity: string
  executionMode: string | null
  workspaceId: string | null
  assignedAgentId: string | null
  projectId: string | null
  createdAt: Date
  updatedAt: Date
}

const STATUS_CLASSES: Record<string, string> = {
  backlog: 'text-gray-500',
  queued: 'text-neon-yellow',
  in_progress: 'text-neon-purple',
  review: 'text-orange-400',
  done: 'text-neon-green',
  failed: 'text-neon-red',
  cancelled: 'text-gray-400',
}

const PRIORITY_CLASSES: Record<string, string> = {
  low: 'text-gray-500',
  medium: 'text-neon-yellow',
  high: 'text-orange-400',
  critical: 'text-neon-red',
}

export default function TicketsPage() {
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [wsId, setWsId] = useState('')
  const [agentId, setAgentId] = useState('')
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null)
  const [executing, setExecuting] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const { data, isLoading, error } = trpc.tickets.list.useQuery()
  const wsQuery = trpc.workspaces.list.useQuery({ limit: 100, offset: 0 })
  const agentsQuery = trpc.agents.list.useQuery({ limit: 100, offset: 0 })
  const allWorkspaces = (wsQuery.data ?? []) as Array<{ id: string; name: string }>
  const allAgents = (agentsQuery.data ?? []) as Array<{
    id: string
    name: string
    workspaceId: string | null
  }>

  const utils = trpc.useUtils()
  const createMut = trpc.tickets.create.useMutation({
    onSuccess: () => {
      utils.tickets.list.invalidate()
      setShowForm(false)
      setTitle('')
      setDescription('')
    },
  })
  const executeMut = trpc.taskRunner.route.useMutation({
    onSuccess: () => {
      utils.tickets.list.invalidate()
      setExecuting(null)
    },
    onError: () => {
      setExecuting(null)
    },
  })
  const deleteMut = trpc.tickets.delete.useMutation({
    onSuccess: () => {
      utils.tickets.list.invalidate()
    },
  })

  if (error) {
    return (
      <div className="p-6 text-gray-50">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 text-gray-50 flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-gray-500">
          <div className="text-2xl mb-2">Loading...</div>
          <div className="text-[13px]">Fetching tickets</div>
        </div>
      </div>
    )
  }

  const allTickets: Ticket[] = (data as Ticket[]) ?? []
  const tickets = allTickets
    .filter((t) => statusFilter === 'all' || t.status === statusFilter)
    .filter((t) => !search || t.title.toLowerCase().includes(search.toLowerCase()))

  const STATUS_TABS = ['all', 'backlog', 'queued', 'in_progress', 'review', 'done', 'failed']

  return (
    <div className="p-6 text-gray-50">
      <div className="mb-5">
        <div className="flex justify-between items-center">
          <h2 className="m-0 text-[22px] font-bold font-orbitron">Tickets ({allTickets.length})</h2>
          <button className="cyber-btn-primary text-xs" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ New Ticket'}
          </button>
        </div>
        <p className="mt-1 mb-0 text-[13px] text-gray-500">
          Track execution tickets through the pipeline — backlog, queued, in progress, review, done.
        </p>
      </div>

      <input
        className="cyber-input w-full mb-2.5 text-[13px]"
        placeholder="Search tickets..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="flex gap-1 mb-4 flex-wrap">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            className={`border border-border-dim rounded px-2.5 py-0.5 text-[11px] cursor-pointer transition-colors ${
              statusFilter === s
                ? 'bg-bg-elevated text-gray-50 font-semibold'
                : 'bg-transparent text-gray-500 font-normal'
            }`}
            onClick={() => setStatusFilter(s)}
          >
            {s === 'all' ? 'All' : s.replace('_', ' ')}
            {s !== 'all' && ` (${allTickets.filter((t) => t.status === s).length})`}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="cyber-card p-4 mb-4">
          <div className="flex flex-col gap-2">
            <input
              className="cyber-input text-[13px]"
              placeholder="Ticket title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="cyber-input text-[13px] min-h-[60px] resize-y"
              placeholder="Description (optional)..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex gap-2 items-center flex-wrap">
              <select
                className="cyber-select text-xs"
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as 'low' | 'medium' | 'high' | 'critical')
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
              <select
                className="cyber-select text-xs"
                value={wsId}
                onChange={(e) => setWsId(e.target.value)}
              >
                <option value="">Workspace (optional)</option>
                {allWorkspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <select
                className="cyber-select text-xs"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
              >
                <option value="">Agent (optional)</option>
                {(wsId ? allAgents.filter((a) => a.workspaceId === wsId) : allAgents).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <button
                className="cyber-btn-primary text-xs"
                onClick={() =>
                  title.trim() &&
                  createMut.mutate({
                    title: title.trim(),
                    description: description.trim() || undefined,
                    priority,
                    workspaceId: wsId || undefined,
                    assignedAgentId: agentId || undefined,
                  })
                }
                disabled={createMut.isPending || !title.trim()}
              >
                {createMut.isPending ? 'Creating...' : 'Create'}
              </button>
              {createMut.error && (
                <span className="text-neon-red text-[11px]">{createMut.error.message}</span>
              )}
            </div>
          </div>
        </div>
      )}
      {tickets.length === 0 ? (
        <div className="text-center text-gray-500 py-10 text-sm">
          No tickets found. Create one to get started.
        </div>
      ) : (
        <div className="cyber-card overflow-hidden">
          <div className="flex px-4 py-2.5 bg-bg-deep border-b border-border-dim">
            <span className="flex-[2] text-[11px] font-bold text-gray-500 uppercase tracking-wide">
              Title
            </span>
            <span className="flex-1 text-[11px] font-bold text-gray-500 uppercase tracking-wide">
              Status
            </span>
            <span className="flex-1 text-[11px] font-bold text-gray-500 uppercase tracking-wide">
              Priority
            </span>
            <span className="flex-1 text-[11px] font-bold text-gray-500 uppercase tracking-wide">
              Complexity
            </span>
            <span className="flex-1 text-[11px] font-bold text-gray-500 uppercase tracking-wide">
              Actions
            </span>
          </div>
          {tickets.map((t) => (
            <div key={t.id}>
              <div className="flex px-4 py-2.5 border-b border-border-dim items-center">
                <span
                  className="flex-[2] text-[13px] font-semibold cursor-pointer border-b border-dashed border-gray-600"
                  onClick={() => setExpandedTicket(expandedTicket === t.id ? null : t.id)}
                  title="Click to expand"
                >
                  {t.title}
                </span>
                <span className="flex-1 text-[13px]">
                  <span className={`cyber-badge ${STATUS_CLASSES[t.status] || 'text-gray-500'}`}>
                    {t.status}
                  </span>
                </span>
                <span className="flex-1 text-[13px]">
                  <span
                    className={`cyber-badge ${PRIORITY_CLASSES[t.priority] || 'text-gray-500'}`}
                  >
                    {t.priority}
                  </span>
                </span>
                <span className="flex-1 text-[13px]">{t.complexity}</span>
                <span className="flex-1 text-[13px]">
                  {['backlog', 'queued', 'failed'].includes(t.status) ? (
                    <button
                      className="cyber-btn-primary text-[11px] px-2.5 py-0.5"
                      disabled={executing === t.id}
                      onClick={() => {
                        setExecuting(t.id)
                        executeMut.mutate({ ticketId: t.id, prompt: t.title })
                      }}
                    >
                      {executing === t.id ? 'Running...' : 'Execute'}
                    </button>
                  ) : (
                    <span className="text-[11px] text-gray-500">{t.executionMode || '\u2014'}</span>
                  )}
                  <button
                    className="cyber-btn-danger text-[11px] ml-1.5 bg-transparent border-none"
                    onClick={() => setDeleteTarget(t.id)}
                  >
                    Del
                  </button>
                </span>
              </div>
              {expandedTicket === t.id && (
                <div className="px-4 py-2 pb-3 bg-bg-deep border-b border-border-dim text-xs text-gray-400">
                  <div className="mb-1">
                    <strong>Description:</strong> {t.description || 'None'}
                  </div>
                  <div className="flex gap-4">
                    <span>
                      Workspace:{' '}
                      {t.workspaceId
                        ? (allWorkspaces.find((w) => w.id === t.workspaceId)?.name ??
                          t.workspaceId.slice(0, 8))
                        : 'Unassigned'}
                    </span>
                    <span>
                      Agent:{' '}
                      {t.assignedAgentId
                        ? (allAgents.find((a) => a.id === t.assignedAgentId)?.name ??
                          t.assignedAgentId.slice(0, 8))
                        : 'Unassigned'}
                    </span>
                    <span>Mode: {t.executionMode ?? 'auto'}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Ticket"
        message="Are you sure you want to delete this ticket? This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteTarget) deleteMut.mutate({ id: deleteTarget })
          setDeleteTarget(null)
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
