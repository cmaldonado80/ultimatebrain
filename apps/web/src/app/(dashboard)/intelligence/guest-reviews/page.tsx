'use client'

/**
 * Guest Review Analyzer — search online reviews for any hotel/property,
 * analyze sentiment & themes via LLM, and generate improvement plans.
 * Agents can also invoke this via the guest_review_analyze tool.
 */

import { useState } from 'react'

import { LoadingState } from '../../../../components/ui/loading-state'
import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

// ── Helpers ──────────────────────────────────────────────────────────────

function sentimentColor(s: string): 'green' | 'red' | 'yellow' | 'blue' {
  if (s === 'positive') return 'green'
  if (s === 'negative') return 'red'
  if (s === 'mixed') return 'yellow'
  return 'blue'
}

function severityColor(s: string): 'red' | 'yellow' | 'green' | 'blue' {
  if (s === 'critical' || s === 'high') return 'red'
  if (s === 'medium') return 'yellow'
  return 'green'
}

function costBadge(c: string): 'green' | 'yellow' | 'red' {
  if (c === 'low') return 'green'
  if (c === 'medium') return 'yellow'
  return 'red'
}

function timeAgo(d: Date | string): string {
  const diff = Date.now() - new Date(d).getTime()
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function ratingColor(r: number): string {
  if (r >= 8.5) return 'text-neon-green'
  if (r >= 7) return 'text-neon-blue'
  if (r >= 5) return 'text-neon-yellow'
  return 'text-neon-red'
}

// ── Types ────────────────────────────────────────────────────────────────

type Theme = { category: string; sentiment: string; frequency: string; quotes: string[] }
type Strength = { area: string; description: string; quotes: string[] }
type Weakness = { area: string; description: string; severity: string; quotes: string[] }
type Action = { action: string; problem: string; kpiTarget: string; cost: string }
type Phase = { phase: string; timeframe: string; actions: Action[] }
type Analysis = {
  id: string
  propertyName: string
  location: string | null
  sourceCount: number
  overallRating: number | null
  sentimentBreakdown: { positive: number; neutral: number; negative: number }
  themes: Theme[]
  strengths: Strength[]
  weaknesses: Weakness[]
  improvementPlan: Phase[]
  rawSummary: string | null
  createdAt: Date | string
}

// ── Component ────────────────────────────────────────────────────────────

export default function GuestReviewsPage() {
  const [propertyName, setPropertyName] = useState('')
  const [location, setLocation] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expandedTheme, setExpandedTheme] = useState<number | null>(null)

  const historyQuery = trpc.intelligence.guestReviewHistory.useQuery({ limit: 50 })
  const detailQuery = trpc.intelligence.guestReviewById.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId },
  )
  const utils = trpc.useUtils()

  const analyzeMut = trpc.intelligence.analyzeGuestReviews.useMutation({
    onSuccess: (data) => {
      utils.intelligence.guestReviewHistory.invalidate()
      setSelectedId(data.id)
      setPropertyName('')
      setLocation('')
    },
  })

  const deleteMut = trpc.intelligence.deleteGuestReview.useMutation({
    onSuccess: () => {
      utils.intelligence.guestReviewHistory.invalidate()
      setSelectedId(null)
    },
  })

  const history = (historyQuery.data ?? []) as Analysis[]
  const detail = (selectedId ? (detailQuery.data as Analysis | null) : null) ?? null

  const sentTotal = detail
    ? detail.sentimentBreakdown.positive +
      detail.sentimentBreakdown.neutral +
      detail.sentimentBreakdown.negative
    : 0

  const posPct =
    sentTotal > 0 ? Math.round(((detail?.sentimentBreakdown.positive ?? 0) / sentTotal) * 100) : 0
  const neuPct =
    sentTotal > 0 ? Math.round(((detail?.sentimentBreakdown.neutral ?? 0) / sentTotal) * 100) : 0
  const negPct =
    sentTotal > 0 ? Math.round(((detail?.sentimentBreakdown.negative ?? 0) / sentTotal) * 100) : 0

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Guest Review Analyzer"
        subtitle="Search online reviews for any hotel or property — AI-powered sentiment analysis, theme extraction, and improvement plans"
        count={history.length}
      />

      {/* ── Analyze Form ────────────────────────────────────────────────── */}
      <SectionCard title="Analyze Property" className="mb-6">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-[10px] text-slate-500 block mb-1">Property Name</label>
            <input
              className="cyber-input cyber-input-sm w-full"
              placeholder="e.g. Crowne Plaza Monterrey Centro"
              value={propertyName}
              onChange={(e) => setPropertyName(e.target.value)}
            />
          </div>
          <div className="w-48">
            <label className="text-[10px] text-slate-500 block mb-1">Location (optional)</label>
            <input
              className="cyber-input cyber-input-sm w-full"
              placeholder="e.g. Monterrey, Mexico"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <button
            className="cyber-btn-primary cyber-btn-sm flex-shrink-0"
            disabled={!propertyName.trim() || analyzeMut.isPending}
            onClick={() =>
              analyzeMut.mutate({
                propertyName: propertyName.trim(),
                location: location.trim() || undefined,
              })
            }
          >
            {analyzeMut.isPending ? 'Analyzing...' : 'Analyze Reviews'}
          </button>
        </div>
        {analyzeMut.isPending && (
          <div className="mt-3 text-xs text-neon-blue animate-pulse">
            Searching 11 queries across review platforms, scraping pages, running AI analysis...
            This takes 30-90 seconds.
          </div>
        )}
        {analyzeMut.error && (
          <div className="mt-3 text-xs text-neon-red">
            Analysis failed: {analyzeMut.error.message}
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ── History Sidebar ──────────────────────────────────────────── */}
        <div className="lg:col-span-1">
          <SectionCard title="Analysis History">
            {historyQuery.isLoading ? (
              <LoadingState message="Loading..." />
            ) : history.length === 0 ? (
              <div className="text-xs text-slate-600 py-6 text-center">
                No analyses yet. Enter a property name above to start.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[700px] overflow-y-auto">
                {history.map((a) => (
                  <div
                    key={a.id}
                    className={`group relative bg-bg-deep rounded px-3 py-2 border transition-colors ${
                      selectedId === a.id
                        ? 'border-neon-blue bg-neon-blue/5'
                        : 'border-border-dim hover:border-white/10'
                    }`}
                  >
                    <button
                      onClick={() => setSelectedId(a.id)}
                      className="w-full text-left cursor-pointer"
                    >
                      <div className="text-[11px] text-slate-200 truncate font-medium pr-5">
                        {a.propertyName}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {a.overallRating ? (
                          <span
                            className={`text-[10px] font-mono font-bold ${ratingColor(a.overallRating)}`}
                          >
                            {a.overallRating}/10
                          </span>
                        ) : null}
                        <span className="text-[10px] text-slate-500">
                          {a.sourceCount} src &middot; {a.themes.length} themes
                        </span>
                        <span className="text-[10px] text-slate-600 ml-auto">
                          {timeAgo(a.createdAt)}
                        </span>
                      </div>
                      {a.location && (
                        <div className="text-[9px] text-slate-600 mt-0.5 truncate">
                          {a.location}
                        </div>
                      )}
                    </button>
                    {/* Delete button */}
                    <button
                      className="absolute top-2 right-2 text-[10px] text-slate-700 hover:text-neon-red opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      title="Delete analysis"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Delete analysis for "${a.propertyName}"?`)) {
                          deleteMut.mutate({ id: a.id })
                        }
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── Analysis Detail ─────────────────────────────────────────── */}
        <div className="lg:col-span-3">
          {!detail ? (
            <SectionCard title="Analysis Results">
              <div className="text-xs text-slate-600 py-12 text-center">
                {analyzeMut.isPending
                  ? 'Analysis in progress...'
                  : 'Select an analysis from the history or run a new one'}
              </div>
            </SectionCard>
          ) : (
            <div className="space-y-4">
              {/* Header with property name + delete */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-100">{detail.propertyName}</h2>
                  {detail.location && (
                    <div className="text-xs text-slate-500">{detail.location}</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    className="cyber-btn-primary cyber-btn-xs"
                    disabled={analyzeMut.isPending}
                    onClick={() =>
                      analyzeMut.mutate({
                        propertyName: detail.propertyName,
                        location: detail.location ?? undefined,
                      })
                    }
                  >
                    Re-analyze
                  </button>
                  <button
                    className="cyber-btn-secondary cyber-btn-xs text-neon-red"
                    onClick={() => {
                      if (confirm(`Delete analysis for "${detail.propertyName}"?`)) {
                        deleteMut.mutate({ id: detail.id })
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Stats row */}
              <PageGrid cols="4">
                <StatCard
                  label="Overall Rating"
                  value={detail.overallRating ? `${detail.overallRating}/10` : 'N/A'}
                  color={
                    detail.overallRating && detail.overallRating >= 7
                      ? 'green'
                      : detail.overallRating
                        ? 'yellow'
                        : 'blue'
                  }
                  sub={`${detail.sourceCount} sources analyzed`}
                />
                <StatCard
                  label="Positive"
                  value={detail.sentimentBreakdown.positive}
                  color="green"
                  sub={sentTotal > 0 ? `${posPct}% of reviews` : '—'}
                />
                <StatCard
                  label="Negative"
                  value={detail.sentimentBreakdown.negative}
                  color="red"
                  sub={sentTotal > 0 ? `${negPct}% of reviews` : '—'}
                />
                <StatCard
                  label="Findings"
                  value={detail.themes.length}
                  color="purple"
                  sub={`${detail.strengths.length} strengths, ${detail.weaknesses.length} issues`}
                />
              </PageGrid>

              {/* Sentiment breakdown bar */}
              <SectionCard title="Sentiment Distribution">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-6 bg-bg-elevated rounded-full overflow-hidden flex">
                    {posPct > 0 && (
                      <div
                        className="bg-neon-green h-full transition-all flex items-center justify-center"
                        style={{ width: `${posPct}%` }}
                      >
                        <span className="text-[9px] font-mono font-bold text-black">{posPct}%</span>
                      </div>
                    )}
                    {neuPct > 0 && (
                      <div
                        className="bg-slate-500 h-full transition-all flex items-center justify-center"
                        style={{ width: `${neuPct}%` }}
                      >
                        <span className="text-[9px] font-mono font-bold text-white">{neuPct}%</span>
                      </div>
                    )}
                    {negPct > 0 && (
                      <div
                        className="bg-neon-red h-full transition-all flex items-center justify-center"
                        style={{ width: `${negPct}%` }}
                      >
                        <span className="text-[9px] font-mono font-bold text-white">{negPct}%</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-4 mt-2 text-[10px]">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-neon-green inline-block" /> Positive (
                    {detail.sentimentBreakdown.positive})
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" /> Neutral (
                    {detail.sentimentBreakdown.neutral})
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-neon-red inline-block" /> Negative (
                    {detail.sentimentBreakdown.negative})
                  </span>
                </div>
              </SectionCard>

              {/* Themes — expandable cards */}
              <SectionCard title={`Review Themes (${detail.themes.length})`}>
                {detail.themes.length === 0 ? (
                  <div className="text-xs text-slate-600 py-4 text-center">No themes extracted</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {detail.themes.map((theme, i) => (
                      <button
                        key={i}
                        onClick={() => setExpandedTheme(expandedTheme === i ? null : i)}
                        className="w-full text-left bg-bg-deep rounded px-3 py-2 border border-border-dim hover:border-white/10 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <StatusBadge
                            label={theme.sentiment}
                            color={sentimentColor(theme.sentiment)}
                          />
                          <span className="text-[11px] text-slate-200 font-medium">
                            {theme.category}
                          </span>
                          <span className="text-[10px] text-slate-500 ml-auto">
                            {theme.frequency} freq.
                          </span>
                        </div>
                        {/* Show first quote always */}
                        {theme.quotes.length > 0 && (
                          <div className="text-[10px] text-slate-400 italic">
                            &ldquo;{theme.quotes[0]}&rdquo;
                          </div>
                        )}
                        {/* Expanded: show all quotes */}
                        {expandedTheme === i && theme.quotes.length > 1 && (
                          <div className="mt-1 space-y-1 border-t border-border-dim pt-1">
                            {theme.quotes.slice(1).map((q, qi) => (
                              <div key={qi} className="text-[10px] text-slate-500 italic">
                                &ldquo;{q}&rdquo;
                              </div>
                            ))}
                          </div>
                        )}
                        {theme.quotes.length > 1 && (
                          <div className="text-[9px] text-slate-600 mt-1">
                            {expandedTheme === i
                              ? 'Click to collapse'
                              : `+${theme.quotes.length - 1} more quotes`}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* Strengths & Weaknesses — side by side with all quotes */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SectionCard title={`Strengths (${detail.strengths.length})`}>
                  {detail.strengths.length === 0 ? (
                    <div className="text-xs text-slate-600 py-4 text-center">None identified</div>
                  ) : (
                    <div className="space-y-2">
                      {detail.strengths.map((s, i) => (
                        <div
                          key={i}
                          className="bg-bg-deep rounded px-3 py-2.5 border border-border-dim"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="neon-dot neon-dot-green" />
                            <span className="text-[11px] text-slate-200 font-medium">{s.area}</span>
                          </div>
                          <div className="text-[10px] text-slate-300 leading-relaxed">
                            {s.description}
                          </div>
                          {s.quotes.length > 0 && (
                            <div className="mt-1.5 space-y-1 border-t border-border-dim pt-1.5">
                              {s.quotes.map((q, qi) => (
                                <div key={qi} className="text-[10px] text-slate-500 italic">
                                  &ldquo;{q}&rdquo;
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard title={`Weaknesses (${detail.weaknesses.length})`}>
                  {detail.weaknesses.length === 0 ? (
                    <div className="text-xs text-slate-600 py-4 text-center">None identified</div>
                  ) : (
                    <div className="space-y-2">
                      {detail.weaknesses.map((w, i) => (
                        <div
                          key={i}
                          className="bg-bg-deep rounded px-3 py-2.5 border border-border-dim"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <StatusBadge label={w.severity} color={severityColor(w.severity)} />
                            <span className="text-[11px] text-slate-200 font-medium">{w.area}</span>
                          </div>
                          <div className="text-[10px] text-slate-300 leading-relaxed">
                            {w.description}
                          </div>
                          {w.quotes.length > 0 && (
                            <div className="mt-1.5 space-y-1 border-t border-border-dim pt-1.5">
                              {w.quotes.map((q, qi) => (
                                <div key={qi} className="text-[10px] text-slate-500 italic">
                                  &ldquo;{q}&rdquo;
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>

              {/* Improvement Plan — with action count per phase */}
              <SectionCard title="Improvement Plan">
                {detail.improvementPlan.length === 0 ? (
                  <div className="text-xs text-slate-600 py-4 text-center">
                    No improvement plan generated
                  </div>
                ) : (
                  <div className="space-y-5">
                    {detail.improvementPlan.map((phase, pi) => (
                      <div key={pi}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-6 h-6 rounded-full bg-neon-blue/20 text-neon-blue text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                            {pi + 1}
                          </span>
                          <span className="text-xs font-mono font-bold text-neon-blue">
                            {phase.phase}
                          </span>
                          <span className="text-[10px] text-slate-500">{phase.timeframe}</span>
                          <span className="text-[10px] text-slate-600 ml-auto">
                            {phase.actions.length} actions
                          </span>
                        </div>
                        <div className="space-y-1.5 ml-3 border-l-2 border-neon-blue/20 pl-3">
                          {phase.actions.map((action, ai) => (
                            <div
                              key={ai}
                              className="bg-bg-deep rounded px-3 py-2.5 border border-border-dim"
                            >
                              <div className="flex items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-[11px] text-slate-200 font-medium">
                                    {action.action}
                                  </div>
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    <span className="text-slate-500">Problem:</span>{' '}
                                    {action.problem}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    <span className="text-slate-500">Target:</span>{' '}
                                    {action.kpiTarget}
                                  </div>
                                </div>
                                <StatusBadge
                                  label={`${action.cost} cost`}
                                  color={costBadge(action.cost)}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* Executive Summary */}
              {detail.rawSummary && (
                <SectionCard title="Executive Summary">
                  <div className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {detail.rawSummary}
                  </div>
                </SectionCard>
              )}

              {/* Meta info */}
              <div className="text-[9px] text-slate-700 text-right">
                Analyzed {new Date(detail.createdAt).toLocaleString()} &middot; {detail.sourceCount}{' '}
                sources &middot; {detail.themes.length} themes &middot;{' '}
                {detail.improvementPlan.reduce((a, p) => a + p.actions.length, 0)} improvement
                actions
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
