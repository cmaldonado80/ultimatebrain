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
  if (s === 'critical') return 'red'
  if (s === 'high') return 'red'
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

// ── Types ────────────────────────────────────────────────────────────────

type Theme = {
  category: string
  sentiment: string
  frequency: string
  quotes: string[]
}
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

  const historyQuery = trpc.intelligence.guestReviewHistory.useQuery({ limit: 20 })
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

  const history = (historyQuery.data ?? []) as Analysis[]
  const detail = (selectedId ? (detailQuery.data as Analysis | null) : null) ?? null

  const sentTotal = detail
    ? detail.sentimentBreakdown.positive +
      detail.sentimentBreakdown.neutral +
      detail.sentimentBreakdown.negative
    : 0

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
            Searching review sites, extracting themes, generating improvement plan... This may take
            30-60 seconds.
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
              <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
                {history.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`w-full text-left bg-bg-deep rounded px-3 py-2 border transition-colors cursor-pointer ${
                      selectedId === a.id
                        ? 'border-neon-blue bg-neon-blue/5'
                        : 'border-border-dim hover:border-white/10'
                    }`}
                  >
                    <div className="text-[11px] text-slate-200 truncate font-medium">
                      {a.propertyName}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {a.overallRating && (
                        <span className="text-[10px] text-neon-green font-mono">
                          {a.overallRating}/10
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500">{a.sourceCount} sources</span>
                      <span className="text-[10px] text-slate-600 ml-auto">
                        {timeAgo(a.createdAt)}
                      </span>
                    </div>
                  </button>
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
              {/* Stats */}
              <PageGrid cols="4">
                <StatCard
                  label="Overall Rating"
                  value={detail.overallRating ? `${detail.overallRating}/10` : 'N/A'}
                  color="blue"
                  sub={`${detail.sourceCount} sources`}
                />
                <StatCard
                  label="Positive"
                  value={detail.sentimentBreakdown.positive}
                  color="green"
                  sub={
                    sentTotal > 0
                      ? `${Math.round((detail.sentimentBreakdown.positive / sentTotal) * 100)}%`
                      : '—'
                  }
                />
                <StatCard
                  label="Negative"
                  value={detail.sentimentBreakdown.negative}
                  color="red"
                  sub={
                    sentTotal > 0
                      ? `${Math.round((detail.sentimentBreakdown.negative / sentTotal) * 100)}%`
                      : '—'
                  }
                />
                <StatCard
                  label="Themes Found"
                  value={detail.themes.length}
                  color="purple"
                  sub={`${detail.strengths.length} strengths, ${detail.weaknesses.length} weaknesses`}
                />
              </PageGrid>

              {/* Themes */}
              <SectionCard title={`Review Themes — ${detail.propertyName}`}>
                {detail.themes.length === 0 ? (
                  <div className="text-xs text-slate-600 py-4 text-center">No themes extracted</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {detail.themes.map((theme, i) => (
                      <div
                        key={i}
                        className="bg-bg-deep rounded px-3 py-2 border border-border-dim"
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
                        {theme.quotes.length > 0 && (
                          <div className="text-[10px] text-slate-400 italic truncate">
                            &ldquo;{theme.quotes[0]}&rdquo;
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* Strengths & Weaknesses */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SectionCard title="Strengths">
                  {detail.strengths.length === 0 ? (
                    <div className="text-xs text-slate-600 py-4 text-center">None identified</div>
                  ) : (
                    <div className="space-y-2">
                      {detail.strengths.map((s, i) => (
                        <div
                          key={i}
                          className="bg-bg-deep rounded px-3 py-2 border border-border-dim"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="neon-dot neon-dot-green" />
                            <span className="text-[11px] text-slate-200 font-medium">{s.area}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">{s.description}</div>
                          {s.quotes.length > 0 && (
                            <div className="text-[10px] text-slate-500 italic mt-1 truncate">
                              &ldquo;{s.quotes[0]}&rdquo;
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="Weaknesses">
                  {detail.weaknesses.length === 0 ? (
                    <div className="text-xs text-slate-600 py-4 text-center">None identified</div>
                  ) : (
                    <div className="space-y-2">
                      {detail.weaknesses.map((w, i) => (
                        <div
                          key={i}
                          className="bg-bg-deep rounded px-3 py-2 border border-border-dim"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <StatusBadge label={w.severity} color={severityColor(w.severity)} />
                            <span className="text-[11px] text-slate-200 font-medium">{w.area}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">{w.description}</div>
                          {w.quotes.length > 0 && (
                            <div className="text-[10px] text-slate-500 italic mt-1 truncate">
                              &ldquo;{w.quotes[0]}&rdquo;
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>

              {/* Improvement Plan */}
              <SectionCard title="Improvement Plan">
                {detail.improvementPlan.length === 0 ? (
                  <div className="text-xs text-slate-600 py-4 text-center">
                    No improvement plan generated
                  </div>
                ) : (
                  <div className="space-y-4">
                    {detail.improvementPlan.map((phase, pi) => (
                      <div key={pi}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-mono font-bold text-neon-blue">
                            {phase.phase}
                          </span>
                          <span className="text-[10px] text-slate-500">{phase.timeframe}</span>
                        </div>
                        <div className="space-y-1.5 ml-3 border-l border-border pl-3">
                          {phase.actions.map((action, ai) => (
                            <div
                              key={ai}
                              className="bg-bg-deep rounded px-3 py-2 border border-border-dim"
                            >
                              <div className="flex items-start gap-2">
                                <div className="flex-1">
                                  <div className="text-[11px] text-slate-200">{action.action}</div>
                                  <div className="text-[10px] text-slate-500 mt-0.5">
                                    Fixes: {action.problem}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    KPI: {action.kpiTarget}
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
                  <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {detail.rawSummary}
                  </div>
                </SectionCard>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
