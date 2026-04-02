'use client'

/**
 * Projects — list all projects from the database.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { EmptyState } from '../../../components/ui/empty-state'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import type { StatusColor } from '../../../components/ui/status-badge'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

interface Project {
  id: string
  name: string
  goal: string | null
  status: string
  deadline: Date | null
  healthScore: number | null
  healthDiagnosis: string | null
  synthesis: string | null
  cancelled: boolean | null
  createdAt: Date
  updatedAt: Date
}

const STATUS_BADGE_COLOR: Record<string, StatusColor> = {
  planning: 'blue',
  active: 'green',
  completed: 'green',
  cancelled: 'slate',
}

export default function ProjectsPage() {
  const [showForm, setShowForm] = useState(false)
  const [expandedProject, setExpandedProject] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [search, setSearch] = useState('')
  const { data, isLoading, error } = trpc.projects.list.useQuery({ limit: 100, offset: 0 })

  const utils = trpc.useUtils()
  const createMut = trpc.projects.create.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate()
      setShowForm(false)
      setName('')
      setGoal('')
    },
  })
  const deleteMut = trpc.projects.delete.useMutation({
    onSuccess: () => utils.projects.list.invalidate(),
  })
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  if (error) {
    return (
      <div className="p-6 text-slate-50">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 text-slate-50">
        <LoadingState message="Loading projects..." />
      </div>
    )
  }

  const allProjects: Project[] = (data as Project[]) ?? []
  const projects = search
    ? allProjects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : allProjects

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Projects"
        subtitle="Organize agents, tickets, and resources into scoped project groups."
        count={allProjects.length}
        actions={
          <button className="cyber-btn-primary text-xs" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ New Project'}
          </button>
        }
      />

      <input
        className="cyber-input w-full mb-4"
        placeholder="Search projects..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {showForm && (
        <div className="cyber-card mb-4">
          <div className="flex flex-col gap-2">
            <input
              className="cyber-input"
              placeholder="Project name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="cyber-input"
              placeholder="Goal (optional)..."
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
            <div className="flex gap-2 items-center">
              <button
                className="cyber-btn-primary text-xs"
                onClick={() =>
                  name.trim() &&
                  createMut.mutate({ name: name.trim(), goal: goal.trim() || undefined })
                }
                disabled={createMut.isPending || !name.trim()}
              >
                {createMut.isPending ? 'Creating...' : 'Create Project'}
              </button>
              {createMut.error && (
                <span className="text-neon-red text-[11px]">{createMut.error.message}</span>
              )}
            </div>
          </div>
        </div>
      )}
      {projects.length === 0 ? (
        <EmptyState title="No projects found" message="Create one to get started." />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
          {projects.map((p) => (
            <div key={p.id} className="cyber-card">
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-[15px] font-bold cursor-pointer border-b border-dashed border-gray-600"
                  onClick={() => setExpandedProject(expandedProject === p.id ? null : p.id)}
                  title="Click to expand"
                >
                  {p.name}
                </span>
                <div className="flex items-center gap-2">
                  <StatusBadge label={p.status} color={STATUS_BADGE_COLOR[p.status] ?? 'slate'} />
                  <button
                    className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                      deleteConfirm === p.id
                        ? 'bg-neon-red/20 text-neon-red'
                        : 'text-slate-600 hover:text-neon-red'
                    }`}
                    onClick={() => {
                      if (deleteConfirm === p.id) {
                        deleteMut.mutate({ id: p.id })
                        setDeleteConfirm(null)
                      } else {
                        setDeleteConfirm(p.id)
                      }
                    }}
                    disabled={deleteMut.isPending}
                  >
                    {deleteConfirm === p.id ? 'Confirm?' : 'x'}
                  </button>
                </div>
              </div>
              {p.goal && (
                <div className="text-xs text-slate-400 mb-2 leading-relaxed">{p.goal}</div>
              )}
              <div className="flex gap-4 text-[11px] text-slate-500">
                {p.deadline && <span>Deadline: {new Date(p.deadline).toLocaleDateString()}</span>}
                {p.healthScore && <span>Health: {p.healthScore}</span>}
              </div>
              {p.synthesis && (
                <div className="text-[11px] text-slate-600 mt-2 italic">{p.synthesis}</div>
              )}
              {expandedProject === p.id && (
                <div className="mt-2 pt-2 border-t border-border-dim text-xs text-slate-400">
                  <div>
                    <strong>ID:</strong> <span className="font-mono">{p.id}</span>
                  </div>
                  {p.healthDiagnosis && (
                    <div className="mt-1">
                      <strong>Diagnosis:</strong> {p.healthDiagnosis}
                    </div>
                  )}
                  <div className="mt-1">
                    <strong>Created:</strong> {new Date(p.createdAt).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
