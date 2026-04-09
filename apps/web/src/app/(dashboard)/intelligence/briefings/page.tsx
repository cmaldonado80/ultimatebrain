'use client'

/**
 * Briefing Archive — persistent daily briefings with metrics trends
 * and manual generation trigger.
 */

import { useState } from 'react'

import { LoadingState } from '../../../../components/ui/loading-state'
import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

export default function BriefingArchivePage() {
  const archiveQuery = trpc.intelligence.briefingArchive.useQuery({ limit: 30 })
  const utils = trpc.useUtils()

  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const generateMut = trpc.intelligence.generateBriefingNow.useMutation({
    onSuccess: () => utils.intelligence.briefingArchive.invalidate(),
  })

  if (archiveQuery.isLoading) return <LoadingState message="Loading Briefing Archive..." />

  const briefings = (archiveQuery.data ?? []) as Array<{
    id: string
    date: string
    content: string
    metrics: {
      completed: number
      failed: number
      healing: number
      promoted: number
      observations: number
      successRate: number
      obsByType?: Record<string, number>
    }
    generatedAt: Date
  }>

  const selected = selectedDate ? briefings.find((b) => b.date === selectedDate) : briefings[0]

  // Compute trends from available briefings
  const avgCompleted =
    briefings.length > 0
      ? Math.round(briefings.reduce((a, b) => a + (b.metrics.completed ?? 0), 0) / briefings.length)
      : 0
  const avgHealing =
    briefings.length > 0
      ? Math.round(briefings.reduce((a, b) => a + (b.metrics.healing ?? 0), 0) / briefings.length)
      : 0
  const avgSuccessRate =
    briefings.length > 0
      ? Math.round(
          briefings.reduce((a, b) => a + (b.metrics.successRate ?? 0), 0) / briefings.length,
        )
      : 0

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Briefing Archive"
        subtitle="Daily organizational reports — trends, metrics, and historical comparison"
        count={briefings.length}
      />

      {/* Stats */}
      <PageGrid cols="4" className="mb-6">
        <StatCard label="Briefings" value={briefings.length} color="blue" sub="in archive" />
        <StatCard label="Avg Completed" value={avgCompleted} color="green" sub="tickets/day" />
        <StatCard label="Avg Healing" value={avgHealing} color="red" sub="actions/day" />
        <StatCard
          label="Success Rate"
          value={`${avgSuccessRate}%`}
          color={avgSuccessRate > 80 ? 'green' : avgSuccessRate > 50 ? 'yellow' : 'red'}
          sub="avg across briefings"
        />
      </PageGrid>

      {/* Generate Now */}
      <SectionCard title="Generate Briefing" className="mb-6">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Manually trigger a briefing for today. Normally runs automatically at 08:00 UTC.
          </div>
          <button
            className="cyber-btn-primary cyber-btn-sm flex-shrink-0 ml-4"
            disabled={generateMut.isPending}
            onClick={() => generateMut.mutate()}
          >
            {generateMut.isPending ? 'Generating...' : 'Generate Now'}
          </button>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Calendar / Date List */}
        <SectionCard title="Archive">
          {briefings.length === 0 ? (
            <div className="text-xs text-slate-600 py-6 text-center">
              No briefings yet. Click &quot;Generate Now&quot; above or wait for the daily 08:00 UTC
              generation.
            </div>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {briefings.map((b) => {
                const isSelected = selected?.date === b.date
                return (
                  <button
                    key={b.id}
                    className={`w-full text-left rounded px-3 py-2 border transition-colors ${
                      isSelected
                        ? 'bg-neon-blue/10 border-neon-blue/30'
                        : 'bg-bg-deep border-border-dim hover:border-border'
                    }`}
                    onClick={() => setSelectedDate(b.date)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-200 font-mono">{b.date}</span>
                      <StatusBadge
                        label={
                          b.metrics.successRate > 80
                            ? 'healthy'
                            : b.metrics.successRate > 50
                              ? 'warning'
                              : b.metrics.failed > 0
                                ? 'degraded'
                                : 'nominal'
                        }
                        color={
                          b.metrics.successRate > 80
                            ? 'green'
                            : b.metrics.successRate > 50
                              ? 'yellow'
                              : b.metrics.failed > 0
                                ? 'red'
                                : 'blue'
                        }
                      />
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {b.metrics.completed} completed &middot; {b.metrics.healing} healing &middot;{' '}
                      {b.metrics.promoted} instincts
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </SectionCard>

        {/* Briefing Content */}
        <div className="lg:col-span-2">
          <SectionCard title={selected ? `Briefing — ${selected.date}` : 'Select a Briefing'}>
            {!selected ? (
              <div className="text-xs text-slate-600 py-6 text-center">
                Select a date from the archive to view its briefing.
              </div>
            ) : (
              <div>
                {/* Metrics Row */}
                <div className="grid grid-cols-5 gap-2 mb-4">
                  <div className="bg-bg-elevated rounded px-2 py-1.5 text-center border border-border-dim">
                    <div className="text-sm font-mono text-neon-green">
                      {selected.metrics.completed}
                    </div>
                    <div className="text-[9px] text-slate-500">Completed</div>
                  </div>
                  <div className="bg-bg-elevated rounded px-2 py-1.5 text-center border border-border-dim">
                    <div className="text-sm font-mono text-neon-red">{selected.metrics.failed}</div>
                    <div className="text-[9px] text-slate-500">Failed</div>
                  </div>
                  <div className="bg-bg-elevated rounded px-2 py-1.5 text-center border border-border-dim">
                    <div className="text-sm font-mono text-neon-yellow">
                      {selected.metrics.healing}
                    </div>
                    <div className="text-[9px] text-slate-500">Healing</div>
                  </div>
                  <div className="bg-bg-elevated rounded px-2 py-1.5 text-center border border-border-dim">
                    <div className="text-sm font-mono text-neon-purple">
                      {selected.metrics.promoted}
                    </div>
                    <div className="text-[9px] text-slate-500">Instincts</div>
                  </div>
                  <div className="bg-bg-elevated rounded px-2 py-1.5 text-center border border-border-dim">
                    <div className="text-sm font-mono text-neon-blue">
                      {selected.metrics.successRate}%
                    </div>
                    <div className="text-[9px] text-slate-500">Success</div>
                  </div>
                </div>

                {/* Markdown Content */}
                <div className="bg-bg-deep rounded p-4 border border-border-dim font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                  {selected.content}
                </div>

                {/* Learning loops */}
                {selected.metrics.obsByType &&
                  Object.keys(selected.metrics.obsByType).length > 0 && (
                    <div className="mt-3">
                      <div className="text-[10px] text-slate-500 mb-1">Active Learning Loops</div>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(selected.metrics.obsByType).map(([type, count]) => (
                          <span
                            key={type}
                            className="text-[10px] font-mono bg-neon-purple/10 text-neon-purple border border-neon-purple/20 rounded px-1.5 py-0.5"
                          >
                            {type}: {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                <div className="text-[10px] text-slate-600 mt-2">
                  Generated at {new Date(selected.generatedAt).toLocaleString()}
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Trend Bars */}
      {briefings.length > 1 && (
        <SectionCard title="Metrics Trend (last 7 days)">
          <div className="space-y-3">
            {/* Completed trend */}
            <div>
              <div className="text-[10px] text-slate-500 mb-1">Tickets Completed</div>
              <div className="flex items-end gap-1 h-12">
                {briefings
                  .slice(0, 7)
                  .reverse()
                  .map((b) => {
                    const max = Math.max(
                      ...briefings.slice(0, 7).map((x) => x.metrics.completed),
                      1,
                    )
                    const pct = Math.round((b.metrics.completed / max) * 100)
                    return (
                      <div
                        key={b.id}
                        className="flex-1 bg-neon-green/30 rounded-t transition-all"
                        style={{ height: `${Math.max(pct, 4)}%` }}
                        title={`${b.date}: ${b.metrics.completed}`}
                      />
                    )
                  })}
              </div>
              <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
                {briefings.length > 6 && <span>{briefings[6]?.date.slice(5)}</span>}
                <span className="ml-auto">{briefings[0]?.date.slice(5)}</span>
              </div>
            </div>

            {/* Healing trend */}
            <div>
              <div className="text-[10px] text-slate-500 mb-1">Healing Actions</div>
              <div className="flex items-end gap-1 h-12">
                {briefings
                  .slice(0, 7)
                  .reverse()
                  .map((b) => {
                    const max = Math.max(...briefings.slice(0, 7).map((x) => x.metrics.healing), 1)
                    const pct = Math.round((b.metrics.healing / max) * 100)
                    return (
                      <div
                        key={b.id}
                        className="flex-1 bg-neon-yellow/30 rounded-t transition-all"
                        style={{ height: `${Math.max(pct, 4)}%` }}
                        title={`${b.date}: ${b.metrics.healing}`}
                      />
                    )
                  })}
              </div>
            </div>

            {/* Success rate trend */}
            <div>
              <div className="text-[10px] text-slate-500 mb-1">Success Rate (%)</div>
              <div className="flex items-end gap-1 h-12">
                {briefings
                  .slice(0, 7)
                  .reverse()
                  .map((b) => {
                    const pct = b.metrics.successRate ?? 0
                    return (
                      <div
                        key={b.id}
                        className={`flex-1 rounded-t transition-all ${pct > 80 ? 'bg-neon-green/30' : pct > 50 ? 'bg-neon-yellow/30' : 'bg-neon-red/30'}`}
                        style={{ height: `${Math.max(pct, 4)}%` }}
                        title={`${b.date}: ${pct}%`}
                      />
                    )
                  })}
              </div>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  )
}
