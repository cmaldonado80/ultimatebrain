'use client'

/**
 * Project Builder — describe what you want, the system decomposes it into
 * a DAG of tasks, forms an agent swarm, executes autonomously, and delivers
 * reviewable artifacts with live preview.
 */

import { useState } from 'react'

import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

// ── Helpers ──────────────────────────────────────────────────────────────

function statusColor(s: string): 'green' | 'blue' | 'yellow' | 'red' | 'purple' {
  if (s === 'done' || s === 'completed') return 'green'
  if (s === 'in_progress' || s === 'active') return 'blue'
  if (s === 'queued') return 'yellow'
  if (s === 'failed' || s === 'cancelled') return 'red'
  return 'purple'
}

function statusIcon(s: string): string {
  if (s === 'done') return '✓'
  if (s === 'in_progress') return '●'
  if (s === 'queued') return '○'
  if (s === 'failed') return '✗'
  return '◌'
}

function timeAgo(d: Date | string): string {
  const diff = Date.now() - new Date(d).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

// ── Types ────────────────────────────────────────────────────────────────

type ProjectType = 'landing-page' | 'api' | 'full-stack' | 'general'

const PROJECT_TYPES: { value: ProjectType; label: string; icon: string }[] = [
  { value: 'landing-page', label: 'Landing Page', icon: '◈' },
  { value: 'api', label: 'API Backend', icon: '⊕' },
  { value: 'full-stack', label: 'Full Stack', icon: '▦' },
  { value: 'general', label: 'General', icon: '◆' },
]

const EXAMPLE_BRIEFS = [
  'Build a landing page for a coffee shop with hero, menu, testimonials, and contact form',
  'Create a portfolio website for a photographer with gallery, about, and booking page',
  'Design a SaaS pricing page with 3 tiers, feature comparison, and FAQ section',
]

// ── Component ────────────────────────────────────────────────────────────

export default function ProjectBuilderPage() {
  const [brief, setBrief] = useState('')
  const [projectType, setProjectType] = useState<ProjectType>('landing-page')
  const [workspaceId, setWorkspaceId] = useState<string>('')
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const [changeRequest, setChangeRequest] = useState('')

  const workspacesQuery = trpc.workspaces.list.useQuery(
    { limit: 50, offset: 0 },
    { staleTime: 60_000 },
  )
  const projectsQuery = trpc.builder.listBuilderProjects.useQuery({ limit: 20 })
  const statusQuery = trpc.builder.getProjectStatus.useQuery(
    { id: activeProjectId! },
    { enabled: !!activeProjectId, refetchInterval: activeProjectId ? 4000 : false },
  )
  const utils = trpc.useUtils()

  const createMut = trpc.builder.createProject.useMutation({
    onSuccess: (data) => {
      setActiveProjectId(data.projectId)
      setBrief('')
      utils.builder.listBuilderProjects.invalidate()
    },
  })

  const executeWaveMut = trpc.builder.executeNextWave.useMutation({
    onSuccess: () => utils.builder.getProjectStatus.invalidate(),
  })

  const reviseMut = trpc.builder.requestProjectChange.useMutation({
    onSuccess: () => {
      setChangeRequest('')
      utils.builder.getProjectStatus.invalidate()
    },
  })

  const deleteMut = trpc.builder.deleteBuilderProject.useMutation({
    onSuccess: () => {
      setActiveProjectId(null)
      utils.builder.listBuilderProjects.invalidate()
    },
  })

  const retryMut = trpc.builder.retryTask.useMutation({
    onSuccess: () => utils.builder.getProjectStatus.invalidate(),
  })

  const recentProjects = projectsQuery.data ?? []
  const project = statusQuery.data

  // Auto-advance waves when polling detects completed tasks
  const hasReadyWork =
    project &&
    project.status === 'active' &&
    project.tasks.some((t) => t.status === 'queued') &&
    !project.tasks.some((t) => t.status === 'in_progress')

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Project Builder"
        subtitle="Describe what you want to build — AI agents decompose, design, code, and deliver"
      />

      {/* ── Brief Input + Recent Projects ──────────────────────────────── */}
      {!activeProjectId && (
        <>
          <SectionCard title="What do you want to build?" className="mb-6">
            <textarea
              className="cyber-input w-full h-28 resize-none mb-3"
              placeholder="Describe your project... e.g. Build a landing page for a coffee shop with hero section, menu grid, testimonials, and contact form"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />

            {/* Example briefs */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {EXAMPLE_BRIEFS.map((ex, i) => (
                <button
                  key={i}
                  className="text-[10px] text-slate-500 hover:text-slate-300 bg-bg-elevated px-2 py-1 rounded border border-border-dim hover:border-white/10 transition-colors cursor-pointer"
                  onClick={() => setBrief(ex)}
                >
                  {ex.slice(0, 60)}...
                </button>
              ))}
            </div>

            {/* Project type + Workspace selectors */}
            <div className="flex items-center gap-4 mb-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500">Type:</span>
                {PROJECT_TYPES.map((pt) => (
                  <button
                    key={pt.value}
                    onClick={() => setProjectType(pt.value)}
                    className={`text-[11px] px-3 py-1.5 rounded border transition-colors cursor-pointer ${
                      projectType === pt.value
                        ? 'border-neon-blue bg-neon-blue/10 text-neon-blue'
                        : 'border-border-dim text-slate-400 hover:border-white/10'
                    }`}
                  >
                    {pt.icon} {pt.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500">Workspace:</span>
                <select
                  className="cyber-input cyber-input-sm w-48"
                  value={workspaceId}
                  onChange={(e) => setWorkspaceId(e.target.value)}
                >
                  <option value="">Auto (any workspace)</option>
                  {(workspacesQuery.data ?? []).map((ws: { id: string; name: string }) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              className="cyber-btn-primary cyber-btn-sm"
              disabled={!brief.trim() || createMut.isPending}
              onClick={() =>
                createMut.mutate({
                  brief: brief.trim(),
                  projectType,
                  workspaceId: workspaceId || undefined,
                })
              }
            >
              {createMut.isPending ? 'Decomposing & Building...' : 'Build Project'}
            </button>

            {createMut.isPending && (
              <div className="mt-3 text-xs text-neon-blue animate-pulse">
                AI is analyzing your brief, decomposing into tasks, creating the project DAG, and
                starting execution...
              </div>
            )}
            {createMut.error && (
              <div className="mt-3 text-xs text-neon-red">Failed: {createMut.error.message}</div>
            )}
          </SectionCard>

          {/* Recent Projects */}
          {recentProjects.length > 0 && (
            <SectionCard title="Recent Projects" className="mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {recentProjects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActiveProjectId(p.id)}
                    className="w-full text-left bg-bg-deep rounded-lg px-4 py-3 border border-border-dim hover:border-white/10 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge label={p.status} color={statusColor(p.status)} />
                      <span className="text-[11px] text-slate-200 font-medium truncate flex-1">
                        {p.name}
                      </span>
                    </div>
                    {p.goal && <div className="text-[10px] text-slate-500 truncate">{p.goal}</div>}
                    <div className="text-[9px] text-slate-600 mt-1">{timeAgo(p.createdAt)}</div>
                  </button>
                ))}
              </div>
            </SectionCard>
          )}
        </>
      )}

      {/* ── Project Dashboard ──────────────────────────────────────────── */}
      {activeProjectId && project && (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <button
                  className="text-slate-500 hover:text-slate-300 text-sm cursor-pointer"
                  onClick={() => setActiveProjectId(null)}
                >
                  ← Back
                </button>
                <h2 className="text-xl font-bold text-slate-100">{project.name}</h2>
                <StatusBadge label={project.status} color={statusColor(project.status)} />
              </div>
              {project.goal && (
                <div className="text-xs text-slate-400 mt-1 ml-16">{project.goal}</div>
              )}
            </div>
            <div className="flex gap-2">
              {hasReadyWork && (
                <button
                  className="cyber-btn-primary cyber-btn-xs"
                  disabled={executeWaveMut.isPending}
                  onClick={() => executeWaveMut.mutate({ projectId: activeProjectId })}
                >
                  {executeWaveMut.isPending ? 'Executing...' : 'Execute Next Wave'}
                </button>
              )}
              <button
                className="cyber-btn-secondary cyber-btn-xs"
                onClick={() => {
                  if (confirm(`Delete "${project.name}"?`))
                    deleteMut.mutate({ id: activeProjectId })
                }}
              >
                Delete
              </button>
            </div>
          </div>

          {/* Stats */}
          <PageGrid cols="4">
            <StatCard
              label="Progress"
              value={`${project.progress.pct}%`}
              color={
                project.progress.pct >= 100 ? 'green' : project.progress.pct > 0 ? 'blue' : 'yellow'
              }
              sub={`${project.progress.done}/${project.progress.total} tasks`}
            />
            <StatCard
              label="In Progress"
              value={project.progress.inProgress}
              color="blue"
              sub="agents working"
            />
            <StatCard
              label="Failed"
              value={project.progress.failed}
              color={project.progress.failed > 0 ? 'red' : 'green'}
              sub={project.progress.failed > 0 ? 'needs attention' : 'all good'}
            />
            <StatCard
              label="Artifacts"
              value={project.artifacts.length}
              color="purple"
              sub="deliverables"
            />
          </PageGrid>

          {/* Progress bar */}
          <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                project.progress.pct >= 100 ? 'bg-neon-green' : 'bg-neon-blue'
              }`}
              style={{ width: `${project.progress.pct}%` }}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Task List */}
            <SectionCard title={`Tasks (${project.tasks.length})`}>
              <div className="space-y-1.5">
                {project.tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center gap-3 bg-bg-deep rounded px-3 py-2.5 border border-border-dim ${
                      task.status === 'in_progress' ? 'border-neon-blue/30' : ''
                    }`}
                  >
                    <span
                      className={`text-sm flex-shrink-0 ${
                        task.status === 'done'
                          ? 'text-neon-green'
                          : task.status === 'in_progress'
                            ? 'text-neon-blue animate-pulse'
                            : task.status === 'failed'
                              ? 'text-neon-red'
                              : 'text-slate-600'
                      }`}
                    >
                      {statusIcon(task.status)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-slate-200 font-medium truncate">
                        {task.title}
                      </div>
                      <div className="text-[9px] text-slate-600">
                        {task.status}
                        {task.metadata?.expectedArtifact
                          ? ` → ${String(task.metadata.expectedArtifact)}`
                          : ''}
                      </div>
                    </div>
                    {task.status === 'failed' && (
                      <button
                        className="text-[10px] text-neon-yellow hover:text-neon-blue cursor-pointer"
                        onClick={() => retryMut.mutate({ ticketId: task.id })}
                      >
                        Retry
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Artifacts + Preview */}
            <div className="space-y-4">
              <SectionCard title={`Artifacts (${project.artifacts.length})`}>
                {project.artifacts.length === 0 ? (
                  <div className="text-xs text-slate-600 py-4 text-center">
                    Artifacts will appear here as agents complete tasks
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {project.artifacts.map((a) => (
                      <button
                        key={a.id}
                        onClick={() =>
                          setSelectedArtifactId(selectedArtifactId === a.id ? null : a.id)
                        }
                        className={`w-full text-left flex items-center gap-2 bg-bg-deep rounded px-3 py-2 border transition-colors cursor-pointer ${
                          selectedArtifactId === a.id
                            ? 'border-neon-blue bg-neon-blue/5'
                            : 'border-border-dim hover:border-white/10'
                        }`}
                      >
                        <span className="text-[10px] text-neon-green">◆</span>
                        <span className="text-[11px] text-slate-200 truncate flex-1">{a.name}</span>
                        <span className="text-[9px] text-slate-600">{a.type}</span>
                      </button>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* Live Preview */}
              {selectedArtifactId && (
                <SectionCard title="Live Preview">
                  <div className="bg-white rounded overflow-hidden" style={{ height: 400 }}>
                    <iframe
                      src={`/api/artifacts/${selectedArtifactId}/view`}
                      className="w-full h-full border-0"
                      sandbox="allow-scripts"
                      title="Artifact preview"
                    />
                  </div>
                  <div className="flex gap-2 mt-2">
                    <a
                      href={`/api/artifacts/${selectedArtifactId}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-neon-blue hover:underline"
                    >
                      Open in new tab ↗
                    </a>
                  </div>
                </SectionCard>
              )}
            </div>
          </div>

          {/* Change Request */}
          <SectionCard title="Request Changes">
            <div className="flex gap-2">
              <input
                className="cyber-input cyber-input-sm flex-1"
                placeholder="e.g. Make the hero section bigger and change colors to warm brown"
                value={changeRequest}
                onChange={(e) => setChangeRequest(e.target.value)}
              />
              <button
                className="cyber-btn-primary cyber-btn-sm flex-shrink-0"
                disabled={!changeRequest.trim() || reviseMut.isPending}
                onClick={() =>
                  reviseMut.mutate({
                    projectId: activeProjectId,
                    description: changeRequest.trim(),
                  })
                }
              >
                {reviseMut.isPending ? 'Sending...' : 'Request Change'}
              </button>
            </div>
          </SectionCard>
        </div>
      )}

      {/* Loading state for active project */}
      {activeProjectId && !project && statusQuery.isLoading && (
        <SectionCard title="Loading...">
          <div className="text-xs text-neon-blue animate-pulse py-8 text-center">
            Loading project status...
          </div>
        </SectionCard>
      )}
    </div>
  )
}
