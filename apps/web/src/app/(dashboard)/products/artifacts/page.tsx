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

  const artifactsQuery = trpc.integrations.allArtifacts.useQuery(
    { limit: 50 },
    { refetchInterval: REFRESH },
  )
  const createArtifactMut = trpc.integrations.createArtifact.useMutation({
    onSuccess: () => artifactsQuery.refetch(),
  })

  const allArtifacts = (artifactsQuery.data ?? []) as Array<{
    id: string
    name: string
    content: string | null
    type: string | null
    agentId: string | null
    ticketId: string | null
    createdAt: Date
    updatedAt: Date | null
  }>

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

  async function handleImprove() {
    if (!selected || !improveText.trim()) return
    // Create a ticket for the corporation to improve this artifact
    try {
      await fetch('/api/trpc/tickets.create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          json: {
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
            status: 'queued',
          },
        }),
      })
      setImproveText('')
      alert('Improvement ticket created! The corporation will work on it.')
    } catch {
      alert('Failed to create improvement ticket')
    }
  }

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Artifact Studio"
        subtitle="Create and iterate on webpages, components, and documents"
      />

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
            {allArtifacts.length === 0 ? (
              <div className="text-xs text-slate-600 py-8 text-center">
                No artifacts yet. Agents will create them when working on tickets.
              </div>
            ) : (
              <div className="space-y-1 max-h-[600px] overflow-y-auto">
                {allArtifacts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`w-full text-left px-3 py-2 rounded text-[11px] transition-colors ${
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
                ))}
              </div>
            )}

            {/* Quick create */}
            <div className="border-t border-border-dim mt-3 pt-3">
              <button
                onClick={() =>
                  createArtifactMut.mutate({
                    name: `Untitled Page`,
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
