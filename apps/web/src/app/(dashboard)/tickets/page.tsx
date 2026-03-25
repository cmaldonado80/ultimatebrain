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

const STATUS_COLORS: Record<string, string> = {
  backlog: '#6b7280',
  queued: '#eab308',
  in_progress: '#818cf8',
  review: '#f97316',
  done: '#22c55e',
  failed: '#ef4444',
  cancelled: '#9ca3af',
}

const PRIORITY_COLORS: Record<string, string> = {
  low: '#6b7280',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
}

export default function TicketsPage() {
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [executing, setExecuting] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const { data, isLoading, error } = trpc.tickets.list.useQuery()

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
      <div style={styles.page}>
        <DbErrorBanner error={error} />
      </div>
    )
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
          <div style={{ fontSize: 13 }}>Fetching tickets</div>
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
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={styles.title}>Tickets ({allTickets.length})</h2>
          <button
            style={{
              background: '#818cf8',
              color: '#f9fafb',
              border: 'none',
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancel' : '+ New Ticket'}
          </button>
        </div>
        <p style={styles.subtitle}>
          Track execution tickets through the pipeline — backlog, queued, in progress, review, done.
        </p>
      </div>

      <input
        style={{
          width: '100%',
          background: '#1f2937',
          color: '#f9fafb',
          border: '1px solid #374151',
          borderRadius: 6,
          padding: '8px 12px',
          fontSize: 13,
          boxSizing: 'border-box' as const,
          marginBottom: 10,
        }}
        placeholder="Search tickets..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' as const }}>
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            style={{
              background: statusFilter === s ? '#374151' : 'transparent',
              color: statusFilter === s ? '#f9fafb' : '#6b7280',
              border: '1px solid #374151',
              borderRadius: 4,
              padding: '3px 10px',
              fontSize: 11,
              cursor: 'pointer',
              fontWeight: statusFilter === s ? 600 : 400,
            }}
            onClick={() => setStatusFilter(s)}
          >
            {s === 'all' ? 'All' : s.replace('_', ' ')}
            {s !== 'all' && ` (${allTickets.filter((t) => t.status === s).length})`}
          </button>
        ))}
      </div>

      {showForm && (
        <div
          style={{
            background: '#1f2937',
            borderRadius: 8,
            padding: 16,
            border: '1px solid #374151',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            <input
              style={{
                background: '#111827',
                color: '#f9fafb',
                border: '1px solid #374151',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 13,
              }}
              placeholder="Ticket title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              style={{
                background: '#111827',
                color: '#f9fafb',
                border: '1px solid #374151',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 13,
                minHeight: 60,
                resize: 'vertical' as const,
              }}
              placeholder="Description (optional)..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                style={{
                  background: '#111827',
                  color: '#f9fafb',
                  border: '1px solid #374151',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                }}
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
              <button
                style={{
                  background: '#22c55e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onClick={() =>
                  title.trim() &&
                  createMut.mutate({
                    title: title.trim(),
                    description: description.trim() || undefined,
                    priority,
                  })
                }
                disabled={createMut.isPending || !title.trim()}
              >
                {createMut.isPending ? 'Creating...' : 'Create'}
              </button>
              {createMut.error && (
                <span style={{ color: '#fca5a5', fontSize: 11 }}>{createMut.error.message}</span>
              )}
            </div>
          </div>
        </div>
      )}
      {tickets.length === 0 ? (
        <div style={styles.empty}>No tickets found. Create one to get started.</div>
      ) : (
        <div style={styles.table}>
          <div style={styles.tableHeader}>
            <span style={{ ...styles.th, flex: 2 }}>Title</span>
            <span style={styles.th}>Status</span>
            <span style={styles.th}>Priority</span>
            <span style={styles.th}>Complexity</span>
            <span style={styles.th}>Actions</span>
          </div>
          {tickets.map((t) => (
            <div key={t.id} style={styles.tableRow}>
              <span style={{ ...styles.td, flex: 2, fontWeight: 600 }}>{t.title}</span>
              <span style={styles.td}>
                <span style={{ ...styles.badge, color: STATUS_COLORS[t.status] || '#6b7280' }}>
                  {t.status}
                </span>
              </span>
              <span style={styles.td}>
                <span style={{ ...styles.badge, color: PRIORITY_COLORS[t.priority] || '#6b7280' }}>
                  {t.priority}
                </span>
              </span>
              <span style={styles.td}>{t.complexity}</span>
              <span style={styles.td}>
                {['backlog', 'queued', 'failed'].includes(t.status) ? (
                  <button
                    style={{
                      background: '#818cf8',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      padding: '3px 10px',
                      fontSize: 11,
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                    disabled={executing === t.id}
                    onClick={() => {
                      setExecuting(t.id)
                      executeMut.mutate({ ticketId: t.id, prompt: t.title })
                    }}
                  >
                    {executing === t.id ? 'Running...' : 'Execute'}
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{t.executionMode || '—'}</span>
                )}
                <button
                  style={{
                    background: 'transparent',
                    color: '#6b7280',
                    border: 'none',
                    fontSize: 11,
                    cursor: 'pointer',
                    marginLeft: 6,
                  }}
                  onClick={() => setDeleteTarget(t.id)}
                >
                  Del
                </button>
              </span>
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

const styles = {
  page: { padding: 24, fontFamily: 'sans-serif', color: '#f9fafb' },
  header: { marginBottom: 20 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  empty: { textAlign: 'center' as const, color: '#6b7280', padding: 40, fontSize: 14 },
  table: {
    background: '#1f2937',
    borderRadius: 8,
    border: '1px solid #374151',
    overflow: 'hidden',
  },
  tableHeader: {
    display: 'flex',
    padding: '10px 16px',
    background: '#111827',
    borderBottom: '1px solid #374151',
  },
  th: {
    flex: 1,
    fontSize: 11,
    fontWeight: 700,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  tableRow: {
    display: 'flex',
    padding: '10px 16px',
    borderBottom: '1px solid #1f2937',
    alignItems: 'center',
  },
  td: { flex: 1, fontSize: 13 },
  badge: { fontSize: 11, fontWeight: 600 },
}
