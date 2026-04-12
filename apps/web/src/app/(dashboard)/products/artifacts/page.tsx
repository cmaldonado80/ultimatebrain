'use client'

/**
 * Artifact Studio — create, preview, iterate, and manage corporation artifacts.
 *
 * The AI Corporation's product studio. Browse artifacts, see live previews,
 * and request improvements through the ticket system.
 */

import { useState } from 'react'

import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

const REFRESH = 15_000

export default function ArtifactStudioPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [improveText, setImproveText] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [projectFilter, setProjectFilter] = useState<string>('all')

  const artifactsQuery = trpc.integrations.allArtifacts.useQuery(
    { limit: 100 },
    { refetchInterval: REFRESH },
  )
  const projectsQuery = trpc.builder.listBuilderProjects.useQuery({ limit: 50 })
  const createArtifactMut = trpc.integrations.createArtifact.useMutation({
    onSuccess: () => artifactsQuery.refetch(),
  })
  const deleteArtifactMut = trpc.builder.deleteArtifact.useMutation({
    onSuccess: () => {
      artifactsQuery.refetch()
      if (selectedId) setSelectedId(null)
    },
  })
  const createTicketMut = trpc.tickets.create.useMutation({
    onSuccess: () => {
      setImproveText('')
    },
  })

  const rawArtifacts = (artifactsQuery.data ?? []) as Array<{
    id: string
    name: string
    content: string | null
    type: string | null
    agentId: string | null
    ticketId: string | null
    projectId: string | null
    workspaceId: string | null
    createdAt: Date
    updatedAt: Date | null
  }>

  // Filter by project
  const allArtifacts =
    projectFilter === 'all'
      ? rawArtifacts
      : projectFilter === 'unlinked'
        ? rawArtifacts.filter((a) => !a.projectId)
        : rawArtifacts.filter((a) => a.projectId === projectFilter)

  const projectList = (projectsQuery.data ?? []) as Array<{ id: string; name: string }>
  // Get unique project IDs from artifacts
  const artifactProjectIds = [...new Set(rawArtifacts.map((a) => a.projectId).filter(Boolean))]

  const htmlArtifacts = allArtifacts.filter(
    (a) =>
      a.content &&
      (a.type?.startsWith('html') || a.type?.startsWith('preview') || a.content?.includes('<')),
  )
  const codeArtifacts = allArtifacts.filter(
    (a) => a.type === 'code' || a.type === 'typescript' || a.type === 'javascript',
  )
  const selected = allArtifacts.find((a) => a.id === selectedId)

  function getTypeColor(type: string | null): 'blue' | 'green' | 'purple' | 'yellow' {
    if (type?.startsWith('html') || type?.startsWith('preview')) return 'blue'
    if (type === 'code' || type === 'typescript') return 'purple'
    if (type === 'document' || type === 'markdown') return 'green'
    return 'yellow'
  }

  function handleImprove() {
    if (!selected || !improveText.trim()) return
    // Create a ticket for the corporation to improve this artifact
    createTicketMut.mutate(
      {
        title: `[Artifact Improvement] ${selected.name}`,
        description: [
          `## Improve Artifact: ${selected.name}`,
          `**Artifact ID:** ${selected.id}`,
          `**Type:** ${selected.type ?? 'unknown'}`,
          '',
          `## Requested Change`,
          improveText,
          '',
          `## Current Content (first 500 chars)`,
          '```',
          selected.content?.slice(0, 500) ?? '',
          '```',
          '',
          `## Instructions`,
          `1. Read the full artifact using workspace_files or the artifact ID`,
          `2. Make the requested improvement`,
          `3. Save the updated artifact`,
          `4. Verify the change looks correct`,
        ].join('\n'),
        priority: 'medium',
      },
      {
        onSuccess: () => {
          setFeedback('Improvement ticket created! The corporation will work on it.')
          setTimeout(() => setFeedback(null), 5000)
        },
        onError: () => {
          setFeedback('Failed to create improvement ticket')
          setTimeout(() => setFeedback(null), 5000)
        },
      },
    )
  }

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Artifact Studio"
        subtitle="Create and iterate on webpages, components, and documents"
      />

      {feedback && (
        <div className="mb-4 px-4 py-2 rounded bg-bg-elevated border border-neon-blue/30 text-xs text-slate-300">
          {feedback}
        </div>
      )}

      {/* Stats */}
      <PageGrid cols="4" className="mb-6">
        <StatCard label="Total Artifacts" value={allArtifacts.length} color="blue" />
        <StatCard label="HTML / Pages" value={htmlArtifacts.length} color="green" />
        <StatCard label="Code" value={codeArtifacts.length} color="purple" />
        <StatCard
          label="Last Updated"
          value={allArtifacts[0] ? new Date(allArtifacts[0].createdAt).toLocaleDateString() : '—'}
          color="yellow"
        />
      </PageGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Artifact List */}
        <div className="lg:col-span-1">
          <SectionCard title={`Artifacts (${allArtifacts.length})`}>
            {/* Project filter */}
            <div className="mb-3">
              <select
                className="cyber-input cyber-input-sm w-full text-[10px]"
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
              >
                <option value="all">All Projects ({rawArtifacts.length})</option>
                <option value="unlinked">Unlinked (no project)</option>
                {projectList
                  .filter((p) => artifactProjectIds.includes(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({rawArtifacts.filter((a) => a.projectId === p.id).length})
                    </option>
                  ))}
              </select>
            </div>

            {allArtifacts.length === 0 ? (
              <div className="text-xs text-slate-600 py-8 text-center">
                {projectFilter !== 'all'
                  ? 'No artifacts for this filter.'
                  : 'No artifacts yet. Agents will create them when working on tickets.'}
              </div>
            ) : (
              <div className="space-y-1 max-h-[600px] overflow-y-auto">
                {allArtifacts.map((a) => (
                  <div key={a.id} className="group flex items-center gap-1">
                    <button
                      onClick={() => setSelectedId(a.id)}
                      className={`flex-1 text-left px-3 py-2 rounded text-[11px] transition-colors ${
                        selectedId === a.id
                          ? 'bg-neon-teal/10 border border-neon-teal/30'
                          : 'hover:bg-bg-elevated border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <StatusBadge
                          label={a.type?.split('|')[0] ?? 'file'}
                          color={getTypeColor(a.type)}
                        />
                        <span className="text-slate-200 truncate flex-1">{a.name}</span>
                      </div>
                      <div className="text-[9px] text-slate-600 mt-0.5">
                        {new Date(a.createdAt).toLocaleString()}
                        {a.agentId && <span className="ml-2">by agent</span>}
                      </div>
                    </button>
                    <button
                      className="text-[10px] text-slate-700 hover:text-neon-red opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex-shrink-0 px-1"
                      title="Delete"
                      onClick={() => {
                        if (confirm(`Delete "${a.name}"?`)) deleteArtifactMut.mutate({ id: a.id })
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Quick create */}
            <div className="border-t border-border-dim mt-3 pt-3">
              <button
                onClick={() =>
                  createArtifactMut.mutate({
                    name: `Untitled Page ${allArtifacts.length + 1}`,
                    type: 'html',
                    content:
                      '<div class="p-8 text-center"><h1 class="text-3xl font-bold text-white mb-4">New Page</h1><p class="text-slate-400">Edit this artifact to build something amazing.</p></div>',
                  })
                }
                className="cyber-btn-primary w-full text-[11px] py-1.5"
              >
                + Create New Page
              </button>
            </div>
          </SectionCard>
        </div>

        {/* Right: Preview + Improve */}
        <div className="lg:col-span-2">
          {selected ? (
            <>
              {/* Live Preview */}
              <SectionCard title={selected.name} className="mb-4">
                <div className="rounded overflow-hidden border border-border-dim bg-white">
                  <iframe
                    src={`/api/artifacts/${selected.id}/view`}
                    className="w-full h-[400px]"
                    title={selected.name}
                    sandbox="allow-scripts allow-same-origin"
                  />
                </div>
                <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-500">
                  <StatusBadge
                    label={selected.type?.split('|')[0] ?? 'file'}
                    color={getTypeColor(selected.type)}
                  />
                  <span>ID: {selected.id.slice(0, 8)}</span>
                  <span>
                    &middot; Updated:{' '}
                    {new Date(selected.updatedAt ?? selected.createdAt).toLocaleString()}
                  </span>
                  <a
                    href={`/api/artifacts/${selected.id}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-neon-teal hover:underline"
                  >
                    Open in new tab
                  </a>
                </div>
              </SectionCard>

              {/* Improve This */}
              <SectionCard title="Improve This Artifact">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={improveText}
                    onChange={(e) => setImproveText(e.target.value)}
                    placeholder="Describe what to change... (e.g. 'make the header blue', 'add a contact form')"
                    className="flex-1 bg-bg-elevated border border-border-dim rounded px-3 py-1.5 text-sm text-slate-200 focus:border-neon-teal focus:outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && handleImprove()}
                  />
                  <button
                    onClick={handleImprove}
                    disabled={!improveText.trim()}
                    className="cyber-btn-primary cyber-btn-sm disabled:opacity-50"
                  >
                    Improve
                  </button>
                </div>
                <p className="text-[9px] text-slate-600 mt-1">
                  Creates a ticket for the corporation. An agent will read the artifact, make the
                  change, and update it.
                </p>
              </SectionCard>

              {/* Raw Content */}
              <SectionCard title="Source" className="mt-4">
                <pre className="bg-bg-deep rounded px-3 py-2 text-[10px] text-slate-400 overflow-auto max-h-48 font-mono">
                  {selected.content?.slice(0, 3000) ?? '(empty)'}
                  {(selected.content?.length ?? 0) > 3000 && '\n... (truncated)'}
                </pre>
              </SectionCard>
            </>
          ) : (
            <SectionCard title="Select an Artifact">
              <div className="text-xs text-slate-600 py-16 text-center">
                Click an artifact from the list to preview it.
                <br />
                <span className="text-[10px] text-slate-700 mt-2 block">
                  Agents create artifacts when working on tickets. You can also create one manually.
                </span>
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  )
}
