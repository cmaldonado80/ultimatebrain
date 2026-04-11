'use client'

/**
 * Project Builder — describe what you want, the system decomposes it into
 * a DAG of tasks, forms an agent swarm, executes autonomously, and delivers
 * reviewable artifacts with live preview.
 */

import { useEffect, useState } from 'react'

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
  'Build an astrology website with natal chart calculator, daily horoscopes, and compatibility reports',
  'Build a landing page for a coffee shop with hero, menu, testimonials, and contact form',
  'Create a hotel management dashboard with guest reviews, room status, and booking analytics',
  'Design a SaaS pricing page with 3 tiers, feature comparison, and FAQ section',
]

const DOMAIN_TEMPLATES = [
  {
    value: 'astrology',
    label: 'Astrology',
    icon: '☉',
    desc: 'Swiss Ephemeris + charts + horoscopes',
  },
  {
    value: 'hospitality',
    label: 'Hospitality',
    icon: '🏨',
    desc: 'Hotels, restaurants, guest management',
  },
  { value: 'healthcare', label: 'Healthcare', icon: '🏥', desc: 'Medical, wellness, telemedicine' },
  { value: 'marketing', label: 'Marketing', icon: '📣', desc: 'Campaigns, content, analytics' },
  { value: 'engineering', label: 'Engineering', icon: '⚙', desc: 'Software, APIs, infrastructure' },
  { value: 'design', label: 'Design', icon: '◈', desc: 'UI/UX, branding, prototyping' },
] as const

// ── DAG Visualization ────────────────────────────────────────────────────

interface DAGTask {
  id: string
  title: string
  status: string
  agentName: string | null
  dagNodeType: string | null
  dependsOn: string[]
  metadata: Record<string, unknown> | null
}

const NODE_W = 190
const NODE_H = 82
const GAP_X = 40
const GAP_Y = 30
const PAD = 20

function nodeStatusColor(s: string): string {
  if (s === 'done') return '#22c55e'
  if (s === 'in_progress') return '#3b82f6'
  if (s === 'failed') return '#ef4444'
  if (s === 'queued') return '#eab308'
  return '#475569' // blocked/backlog
}

function nodeStatusBg(s: string): string {
  if (s === 'done') return 'rgba(34,197,94,0.08)'
  if (s === 'in_progress') return 'rgba(59,130,246,0.12)'
  if (s === 'failed') return 'rgba(239,68,68,0.08)'
  if (s === 'queued') return 'rgba(234,179,8,0.06)'
  return 'rgba(71,85,105,0.05)'
}

function layoutDAG(tasks: DAGTask[]): {
  nodes: Array<DAGTask & { x: number; y: number; wave: number }>
  width: number
  height: number
} {
  if (tasks.length === 0) return { nodes: [], width: 0, height: 0 }

  // Assign waves via topological layering
  const taskMap = new Map(tasks.map((t) => [t.id, t]))
  const waveMap = new Map<string, number>()

  function getWave(id: string, visited = new Set<string>()): number {
    if (waveMap.has(id)) return waveMap.get(id)!
    if (visited.has(id)) return 0
    visited.add(id)
    const task = taskMap.get(id)
    if (!task || task.dependsOn.length === 0) {
      waveMap.set(id, 0)
      return 0
    }
    const maxParent = Math.max(...task.dependsOn.map((d) => getWave(d, visited)))
    const w = maxParent + 1
    waveMap.set(id, w)
    return w
  }

  for (const t of tasks) getWave(t.id)

  // Group by wave
  const waves = new Map<number, DAGTask[]>()
  for (const t of tasks) {
    const w = waveMap.get(t.id) ?? 0
    const arr = waves.get(w) ?? []
    arr.push(t)
    waves.set(w, arr)
  }

  const maxWave = Math.max(...waves.keys())
  const nodes: Array<DAGTask & { x: number; y: number; wave: number }> = []

  for (let w = 0; w <= maxWave; w++) {
    const waveTasks = waves.get(w) ?? []
    const totalWaveWidth = waveTasks.length * NODE_W + (waveTasks.length - 1) * GAP_X
    const maxTotalWidth = (maxWave + 1) * NODE_W + maxWave * GAP_X
    const startX = PAD + Math.max(0, (Math.max(totalWaveWidth, maxTotalWidth) - totalWaveWidth) / 2)

    for (let i = 0; i < waveTasks.length; i++) {
      nodes.push({
        ...waveTasks[i]!,
        x: startX + i * (NODE_W + GAP_X),
        y: PAD + w * (NODE_H + GAP_Y),
        wave: w,
      })
    }
  }

  const maxX = Math.max(...nodes.map((n) => n.x + NODE_W)) + PAD
  const maxY = Math.max(...nodes.map((n) => n.y + NODE_H)) + PAD

  return { nodes, width: Math.max(maxX, 400), height: Math.max(maxY, 200) }
}

function formatElapsed(startIso: string): string {
  const elapsed = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000)
  if (elapsed < 60) return `${elapsed}s`
  return `${Math.floor(elapsed / 60)}m${elapsed % 60}s`
}

function NodeProgressBar({ node }: { node: DAGTask & { x: number; y: number } }) {
  const pct = node.status === 'done' ? 100 : ((node.metadata?.executionProgress as number) ?? 0)
  const barW = NODE_W - 28
  const fillColor = node.status === 'done' ? '#22c55e' : '#3b82f6'
  return (
    <g>
      <rect x={node.x + 14} y={node.y + 55} width={barW} height={4} rx={2} fill="#1e293b" />
      <rect
        x={node.x + 14}
        y={node.y + 55}
        width={Math.max(barW * (pct / 100), 2)}
        height={4}
        rx={2}
        fill={fillColor}
      />
      {pct > 0 && pct < 100 && (
        <text
          x={node.x + 14 + barW + 2}
          y={node.y + 59}
          fill={fillColor}
          fontSize={7}
          fontFamily="monospace"
        >
          {pct}%
        </text>
      )}
      {node.metadata?.lastTool != null && node.status === 'in_progress' && (
        <text x={node.x + 14} y={node.y + 68} fill="#475569" fontSize={7} fontFamily="monospace">
          {String(node.metadata.lastTool as string).slice(0, 28)}
        </text>
      )}
    </g>
  )
}

function ProjectDAG({ tasks, onRetry }: { tasks: DAGTask[]; onRetry: (id: string) => void }) {
  const { nodes, width, height } = layoutDAG(tasks)
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  if (nodes.length === 0) {
    return <div className="text-xs text-slate-600 py-6 text-center">No tasks yet</div>
  }

  // Build edges
  const edges: Array<{
    from: { x: number; y: number }
    to: { x: number; y: number }
    done: boolean
  }> = []
  for (const node of nodes) {
    for (const depId of node.dependsOn) {
      const parent = nodeMap.get(depId)
      if (parent) {
        edges.push({
          from: { x: parent.x + NODE_W / 2, y: parent.y + NODE_H },
          to: { x: node.x + NODE_W / 2, y: node.y },
          done: parent.status === 'done',
        })
      }
    }
  }

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} className="min-w-full">
        {/* Edges */}
        {edges.map((e, i) => {
          const midY = (e.from.y + e.to.y) / 2
          return (
            <path
              key={i}
              d={`M${e.from.x},${e.from.y} C${e.from.x},${midY} ${e.to.x},${midY} ${e.to.x},${e.to.y}`}
              fill="none"
              stroke={e.done ? '#22c55e40' : '#475569'}
              strokeWidth={2}
              strokeDasharray={e.done ? 'none' : '4 4'}
            />
          )
        })}

        {/* Nodes */}
        {nodes.map((node) => (
          <g key={node.id}>
            {/* Node background */}
            <rect
              x={node.x}
              y={node.y}
              width={NODE_W}
              height={NODE_H}
              rx={8}
              fill={nodeStatusBg(node.status)}
              stroke={nodeStatusColor(node.status)}
              strokeWidth={node.status === 'in_progress' ? 2 : 1}
              opacity={node.status === 'in_progress' ? 1 : 0.9}
            />

            {/* Pulsing ring for in_progress */}
            {node.status === 'in_progress' && (
              <rect
                x={node.x}
                y={node.y}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={2}
                opacity={0.4}
              >
                <animate
                  attributeName="opacity"
                  values="0.4;0;0.4"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </rect>
            )}

            {/* Status dot */}
            <circle cx={node.x + 14} cy={node.y + 16} r={4} fill={nodeStatusColor(node.status)} />

            {/* Title */}
            <text
              x={node.x + 26}
              y={node.y + 19}
              fill="#e2e8f0"
              fontSize={11}
              fontWeight={600}
              fontFamily="monospace"
            >
              {node.title.length > 18 ? node.title.slice(0, 18) + '...' : node.title}
            </text>

            {/* Status label + elapsed time */}
            <text
              x={node.x + 14}
              y={node.y + 36}
              fill={nodeStatusColor(node.status)}
              fontSize={9}
              fontFamily="monospace"
            >
              {node.status}
              {node.metadata?.expectedArtifact
                ? ` → ${String(node.metadata.expectedArtifact).slice(0, 15)}`
                : ''}
            </text>
            {node.metadata?.executionStartedAt != null &&
              (node.status === 'in_progress' || node.status === 'done') && (
                <text
                  x={node.x + NODE_W - 14}
                  y={node.y + 36}
                  fill="#64748b"
                  fontSize={8}
                  fontFamily="monospace"
                  textAnchor="end"
                >
                  {formatElapsed(String(node.metadata.executionStartedAt))}
                </text>
              )}

            {/* Agent name */}
            {node.agentName && (
              <text
                x={node.x + 14}
                y={node.y + 50}
                fill="#64748b"
                fontSize={9}
                fontFamily="monospace"
              >
                ⬡{' '}
                {node.agentName.length > 20 ? node.agentName.slice(0, 20) + '...' : node.agentName}
              </text>
            )}

            {/* Progress bar */}
            {(node.status === 'in_progress' || node.status === 'done') && (
              <NodeProgressBar node={node} />
            )}

            {/* Wave label */}
            <text
              x={node.x + NODE_W - 12}
              y={node.y + 74}
              fill="#334155"
              fontSize={8}
              textAnchor="end"
              fontFamily="monospace"
            >
              W{node.wave + 1}
            </text>

            {/* Retry button for failed */}
            {node.status === 'failed' && (
              <g onClick={() => onRetry(node.id)} className="cursor-pointer">
                <rect
                  x={node.x + NODE_W - 42}
                  y={node.y + 4}
                  width={36}
                  height={16}
                  rx={4}
                  fill="#ef444420"
                  stroke="#ef4444"
                  strokeWidth={0.5}
                />
                <text
                  x={node.x + NODE_W - 24}
                  y={node.y + 15}
                  fill="#ef4444"
                  fontSize={8}
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  retry
                </text>
              </g>
            )}
          </g>
        ))}

        {/* Wave labels on left */}
        {[...new Set(nodes.map((n) => n.wave))].map((w) => {
          const firstNode = nodes.find((n) => n.wave === w)!
          return (
            <text
              key={`wave-${w}`}
              x={4}
              y={firstNode.y + NODE_H / 2 + 3}
              fill="#1e293b"
              fontSize={9}
              fontFamily="monospace"
              fontWeight={700}
            >
              W{w + 1}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────

export default function ProjectBuilderPage() {
  const [brief, setBrief] = useState('')
  const [projectType, setProjectType] = useState<ProjectType>('landing-page')
  const [workspaceId, setWorkspaceId] = useState<string>('')
  const [domainTemplate, setDomainTemplate] = useState<string>('')
  const [launchMode, setLaunchMode] = useState<'project' | 'domain'>('domain')
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const [changeRequest, setChangeRequest] = useState('')
  const [launchInfo, setLaunchInfo] = useState<{
    entityId: string | null
    workspaceName: string
    agentCount: number
    template: string | null
  } | null>(null)

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

  // Domain App Launch (unified: detect template → create department → build)
  const launchMut = trpc.builder.launchDomainApp.useMutation({
    onSuccess: (data) => {
      setActiveProjectId(data.projectId)
      setBrief('')
      setLaunchInfo({
        entityId: data.entityId,
        workspaceName: data.workspaceName,
        agentCount: data.agentCount,
        template: data.template,
      })
      utils.builder.listBuilderProjects.invalidate()
    },
  })

  // Simple project creation (no department)
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

  // Auto-execute next task when current one finishes
  useEffect(() => {
    if (hasReadyWork && activeProjectId && !executeWaveMut.isPending) {
      executeWaveMut.mutate({ projectId: activeProjectId })
    }
  }, [hasReadyWork, activeProjectId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Project Builder"
        subtitle="Describe what you want to build — AI agents create the department, assemble a team, and build it autonomously"
      />

      {/* ── Brief Input + Recent Projects ──────────────────────────────── */}
      {!activeProjectId && (
        <>
          <SectionCard title="What do you want to build?" className="mb-6">
            <textarea
              className="cyber-input w-full h-28 resize-none mb-3"
              placeholder="e.g. Build an astrology website with natal chart calculator, daily horoscopes, and compatibility reports"
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

            {/* Mode toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setLaunchMode('domain')}
                className={`text-[11px] px-4 py-2 rounded border transition-colors cursor-pointer ${
                  launchMode === 'domain'
                    ? 'border-neon-green bg-neon-green/10 text-neon-green'
                    : 'border-border-dim text-slate-400 hover:border-white/10'
                }`}
              >
                Launch Domain App
                <span className="text-[9px] text-slate-500 block">
                  Creates department + agents + project
                </span>
              </button>
              <button
                onClick={() => setLaunchMode('project')}
                className={`text-[11px] px-4 py-2 rounded border transition-colors cursor-pointer ${
                  launchMode === 'project'
                    ? 'border-neon-blue bg-neon-blue/10 text-neon-blue'
                    : 'border-border-dim text-slate-400 hover:border-white/10'
                }`}
              >
                Simple Project
                <span className="text-[9px] text-slate-500 block">Uses existing agents</span>
              </button>
            </div>

            {/* Domain App Launch mode */}
            {launchMode === 'domain' && (
              <div className="mb-4">
                <div className="text-[10px] text-slate-500 mb-2">
                  Domain (auto-detected from brief, or select):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setDomainTemplate('')}
                    className={`text-[11px] px-3 py-1.5 rounded border transition-colors cursor-pointer ${
                      !domainTemplate
                        ? 'border-neon-green bg-neon-green/10 text-neon-green'
                        : 'border-border-dim text-slate-400 hover:border-white/10'
                    }`}
                  >
                    Auto-detect
                  </button>
                  {DOMAIN_TEMPLATES.map((dt) => (
                    <button
                      key={dt.value}
                      onClick={() => setDomainTemplate(dt.value)}
                      className={`text-[11px] px-3 py-1.5 rounded border transition-colors cursor-pointer ${
                        domainTemplate === dt.value
                          ? 'border-neon-green bg-neon-green/10 text-neon-green'
                          : 'border-border-dim text-slate-400 hover:border-white/10'
                      }`}
                      title={dt.desc}
                    >
                      {dt.icon} {dt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Simple project mode */}
            {launchMode === 'project' && (
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
            )}

            {/* Launch / Build buttons */}
            {launchMode === 'domain' ? (
              <button
                className="cyber-btn-primary cyber-btn-sm"
                disabled={!brief.trim() || launchMut.isPending}
                onClick={() =>
                  launchMut.mutate({
                    brief: brief.trim(),
                    template: (domainTemplate || undefined) as
                      | 'astrology'
                      | 'hospitality'
                      | 'healthcare'
                      | 'marketing'
                      | 'soc-ops'
                      | 'design'
                      | 'engineering'
                      | undefined,
                  })
                }
              >
                {launchMut.isPending ? 'Launching Domain App...' : 'Launch Domain App'}
              </button>
            ) : (
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
                {createMut.isPending ? 'Building...' : 'Build Project'}
              </button>
            )}

            {/* Status messages */}
            {launchMut.isPending && (
              <div className="mt-3 text-xs text-neon-green animate-pulse">
                Detecting domain... creating department + agents... decomposing into tasks...
                starting autonomous execution...
              </div>
            )}
            {createMut.isPending && (
              <div className="mt-3 text-xs text-neon-blue animate-pulse">
                Decomposing into tasks, creating project DAG, starting execution...
              </div>
            )}
            {(launchMut.error ?? createMut.error) && (
              <div className="mt-3 text-xs text-neon-red">
                Failed: {(launchMut.error ?? createMut.error)?.message}
              </div>
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
              {launchInfo && (
                <div className="flex gap-3 mt-1 ml-16 text-[10px]">
                  {launchInfo.template && (
                    <span className="text-neon-green">Domain: {launchInfo.template}</span>
                  )}
                  <span className="text-slate-500">Workspace: {launchInfo.workspaceName}</span>
                  <span className="text-slate-500">{launchInfo.agentCount} agents</span>
                  {launchInfo.entityId && (
                    <span className="text-neon-purple">Department created</span>
                  )}
                </div>
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

          {/* ── DAG Visualization ──────────────────────────────────────── */}
          <SectionCard title={`Execution DAG (${project.tasks.length} tasks)`}>
            <ProjectDAG
              tasks={project.tasks}
              onRetry={(ticketId) => retryMut.mutate({ ticketId })}
            />
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
