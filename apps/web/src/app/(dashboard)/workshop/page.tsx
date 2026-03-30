'use client'

/**
 * Workshop — project queue with prioritization and deployment.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { OrgBadge } from '../../../components/ui/org-badge'
import { trpc } from '../../../utils/trpc'

export default function WorkshopPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')

  const projectsQuery = trpc.projects.list.useQuery({ limit: 50, offset: 0 })
  const ticketsQuery = trpc.tickets.list.useQuery({ limit: 50, offset: 0 })
  const utils = trpc.useUtils()

  const createMut = trpc.projects.create.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate()
      setShowCreate(false)
      setNewTitle('')
      setNewDescription('')
    },
  })

  const createTicketMut = trpc.tickets.create.useMutation({
    onSuccess: () => utils.tickets.list.invalidate(),
  })

  if (projectsQuery.error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={projectsQuery.error} />
      </div>
    )
  }

  const projects = (projectsQuery.data ?? []) as Array<{
    id: string
    name: string
    goal: string | null
    status: string
    createdAt: Date
  }>

  const tickets = (ticketsQuery.data ?? []) as Array<{
    id: string
    title: string
    status: string
    projectId: string | null
  }>

  const getProjectTickets = (projectId: string) => tickets.filter((t) => t.projectId === projectId)

  const getCompletion = (projectId: string) => {
    const pts = getProjectTickets(projectId)
    if (pts.length === 0) return 0
    return Math.round((pts.filter((t) => t.status === 'done').length / pts.length) * 100)
  }

  const activeProjects = projects.filter((p) => p.status === 'active')
  const completedProjects = projects.filter((p) => p.status === 'completed')

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h1 className="text-2xl font-orbitron text-neon-teal">Workshop</h1>
            <OrgBadge />
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Automate with agents &mdash; {projects.length} projects
          </p>
        </div>
        <button
          className="cyber-btn-primary text-sm px-3 py-1.5"
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? 'Cancel' : '+ New Project'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="cyber-card p-4 space-y-3">
          <input
            className="cyber-input w-full"
            placeholder="Project name..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <textarea
            className="cyber-input w-full resize-none"
            rows={3}
            placeholder="Describe what you want built..."
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
          <button
            className="cyber-btn-primary text-sm px-4 py-1.5"
            disabled={!newTitle.trim() || createMut.isPending}
            onClick={() =>
              createMut.mutate({ name: newTitle.trim(), goal: newDescription.trim() || undefined })
            }
          >
            {createMut.isPending ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="cyber-card p-3 text-center">
          <div className="text-xl font-bold font-orbitron text-neon-green">
            {activeProjects.length}
          </div>
          <div className="text-[10px] text-slate-500">Active</div>
        </div>
        <div className="cyber-card p-3 text-center">
          <div className="text-xl font-bold font-orbitron text-neon-blue">
            {tickets.filter((t) => t.status === 'in_progress').length}
          </div>
          <div className="text-[10px] text-slate-500">In Progress</div>
        </div>
        <div className="cyber-card p-3 text-center">
          <div className="text-xl font-bold font-orbitron text-slate-600">
            {completedProjects.length}
          </div>
          <div className="text-[10px] text-slate-500">Completed</div>
        </div>
      </div>

      {/* Active Projects */}
      {projectsQuery.isLoading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="text-lg font-orbitron text-slate-500">Loading projects...</div>
        </div>
      ) : activeProjects.length === 0 && completedProjects.length === 0 ? (
        <div className="cyber-card p-8 text-center text-slate-500">
          No projects yet. Create one to start building with your agents.
        </div>
      ) : (
        <div className="space-y-3">
          {activeProjects.map((project) => {
            const pts = getProjectTickets(project.id)
            const completion = getCompletion(project.id)
            return (
              <div key={project.id} className="cyber-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="neon-dot neon-dot-green" />
                    <span className="text-sm font-medium text-slate-200">{project.name}</span>
                    <span className="cyber-badge text-[9px] text-neon-green border-neon-green/20">
                      active
                    </span>
                  </div>
                  <button
                    className="cyber-btn-primary cyber-btn-xs"
                    onClick={() =>
                      createTicketMut.mutate({
                        title: `Task for ${project.name}`,
                        description: project.goal ?? '',
                        priority: 'medium',
                        projectId: project.id,
                      })
                    }
                    disabled={createTicketMut.isPending}
                  >
                    + Deploy Task
                  </button>
                </div>
                {project.goal && <p className="text-xs text-slate-400 mb-2">{project.goal}</p>}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-bg-deep rounded-full overflow-hidden">
                    <div
                      className="h-full bg-neon-teal rounded-full transition-all"
                      style={{ width: `${completion}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {completion}% &middot; {pts.length} tasks
                  </span>
                </div>
              </div>
            )
          })}

          {/* Completed projects */}
          {completedProjects.length > 0 && (
            <>
              <h3 className="text-sm font-orbitron text-slate-400 mt-4">Completed</h3>
              {completedProjects.map((project) => (
                <div key={project.id} className="cyber-card p-3 opacity-60">
                  <div className="flex items-center gap-2">
                    <span className="text-neon-green text-xs">&#10003;</span>
                    <span className="text-sm text-slate-300">{project.name}</span>
                    <span className="text-[10px] text-slate-600">
                      {getProjectTickets(project.id).length} tasks
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
