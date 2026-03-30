'use client'

/**
 * Intelligence Hub — knowledge accumulation, chat sessions, memory, and agent insights.
 */

import Link from 'next/link'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatCard } from '../../../components/ui/stat-card'
import { trpc } from '../../../utils/trpc'

export default function IntelligencePage() {
  const sessionsQuery = trpc.intelligence.chatSessions.useQuery()
  const memoryQuery = trpc.memory.list.useQuery({ limit: 10, offset: 0 })
  const agentsQuery = trpc.agents.list.useQuery({ limit: 500, offset: 0 })

  const error = sessionsQuery.error || memoryQuery.error
  if (error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  const isLoading = sessionsQuery.isLoading
  if (isLoading) {
    return <LoadingState message="Loading Intelligence Hub..." />
  }

  const sessions = (sessionsQuery.data ?? []) as Array<{
    id: string
    agentId: string | null
    createdAt: Date
  }>
  const memories = (memoryQuery.data ?? []) as Array<{
    id: string
    content: string
    tier: string
    createdAt: Date
  }>
  const agents = (agentsQuery.data ?? []) as Array<{
    id: string
    name: string
    type: string | null
    model: string | null
    soul: string | null
  }>

  const agentsByType: Record<string, number> = {}
  for (const a of agents) {
    const t = a.type ?? 'untyped'
    agentsByType[t] = (agentsByType[t] ?? 0) + 1
  }

  const agentsWithSouls = agents.filter((a) => a.soul && a.soul.length > 10).length
  const recentSessions = sessions.slice(0, 10)

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Intelligence Hub"
        subtitle="Knowledge, conversations, and agent capabilities"
      />

      {/* Stats */}
      <PageGrid cols="4">
        <StatCard label="Chat Sessions" value={sessions.length} color="blue" />
        <StatCard label="Memory Entries" value={`${memories.length}+`} color="purple" />
        <StatCard label="Total Agents" value={agents.length} color="green" />
        <StatCard label="Agents with Souls" value={agentsWithSouls} color="blue" />
      </PageGrid>

      <PageGrid cols="2">
        {/* The Hub — Recent Sessions */}
        <SectionCard variant="intelligence">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-orbitron text-white">The Hub</h3>
            <Link href="/chat" className="cyber-btn-primary cyber-btn-xs no-underline">
              New Chat
            </Link>
          </div>
          {recentSessions.length === 0 ? (
            <div className="text-xs text-slate-600 py-4 text-center">
              No conversations yet. Start a chat to build knowledge.
            </div>
          ) : (
            <div className="space-y-2">
              {recentSessions.map((s) => {
                const agent = agents.find((a) => a.id === s.agentId)
                return (
                  <Link
                    key={s.id}
                    href="/chat"
                    className="flex items-center gap-2 py-1.5 border-b border-border-dim last:border-0 no-underline hover:bg-bg-elevated/50 rounded px-1 -mx-1 transition-colors"
                  >
                    <div className="neon-dot neon-dot-blue" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-200">
                        {agent ? agent.name : 'Direct Chat'}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </SectionCard>

        {/* The Architect — Agent Capabilities */}
        <SectionCard variant="intelligence">
          <h3 className="text-sm font-orbitron text-white mb-3">The Architect</h3>
          <p className="text-xs text-slate-400 mb-3">
            Agent fleet by type &mdash; {agents.length} total agents
          </p>
          <div className="space-y-2">
            {Object.entries(agentsByType)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 10)
              .map(([type, count]) => (
                <div key={type} className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-slate-300">{type}</span>
                      <span className="text-[10px] text-slate-500">{count}</span>
                    </div>
                    <div className="h-1 bg-bg-deep rounded-full overflow-hidden">
                      <div
                        className="h-full bg-neon-purple rounded-full"
                        style={{ width: `${(count / agents.length) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </SectionCard>
      </PageGrid>

      {/* Memory Timeline */}
      <SectionCard variant="intelligence">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-orbitron text-white">Recent Memory</h3>
          <Link
            href="/memory"
            className="text-[10px] text-neon-blue hover:text-neon-blue/80 no-underline"
          >
            View all →
          </Link>
        </div>
        {memories.length === 0 ? (
          <div className="text-xs text-slate-600 py-4 text-center">
            No memories stored yet. Agent conversations will accumulate knowledge here.
          </div>
        ) : (
          <div className="space-y-2">
            {memories.map((m) => (
              <div
                key={m.id}
                className="flex items-start gap-2 py-1.5 border-b border-border-dim last:border-0"
              >
                <span className="cyber-badge text-[9px] bg-neon-purple/20 text-neon-purple mt-0.5">
                  {m.tier}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-200 line-clamp-2">{m.content}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Document Upload Placeholder */}
      <div className="cyber-card p-6 text-center border-dashed">
        <div className="text-slate-500 text-sm mb-2">Document Ingestion</div>
        <p className="text-xs text-slate-600 mb-3">
          Upload PDFs and documents for your agents to learn from.
        </p>
        <button className="cyber-btn-secondary cyber-btn-sm" disabled>
          Coming Soon
        </button>
      </div>
    </div>
  )
}
