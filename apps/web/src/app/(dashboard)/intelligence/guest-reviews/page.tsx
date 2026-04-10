'use client'

/**
 * Guest Review Analyzer — search online reviews for any hotel/property,
 * analyze sentiment & themes via LLM, and generate improvement plans.
 * Full-width layout with collapsible history drawer.
 */

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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

/** Extract quote text — handles both string and {text, date, source} formats */
function quoteText(
  q: string | { text: string; date?: string | null; source?: string | null },
): string {
  return typeof q === 'string' ? q : q.text
}
function quoteDate(
  q: string | { text: string; date?: string | null; source?: string | null },
): string | null {
  return typeof q === 'string' ? null : (q.date ?? null)
}
function quoteSource(
  q: string | { text: string; date?: string | null; source?: string | null },
): string | null {
  return typeof q === 'string' ? null : (q.source ?? null)
}

type QuoteItem = string | { text: string; date?: string | null; source?: string | null }

// ── Types ────────────────────────────────────────────────────────────────

type Theme = { category: string; sentiment: string; frequency: string; quotes: QuoteItem[] }
type Strength = { area: string; description: string; quotes: QuoteItem[] }
type Weakness = { area: string; description: string; severity: string; quotes: QuoteItem[] }
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

// ── Quote renderer ───────────────────────────────────────────────────────

function QuoteBlock({ quotes }: { quotes: QuoteItem[] }) {
  if (!quotes.length) return null
  return (
    <div className="mt-1.5 space-y-1.5 border-t border-border-dim pt-1.5">
      {quotes.map((q, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-[10px] text-slate-600 mt-0.5 flex-shrink-0">&ldquo;</span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-slate-400 italic">{quoteText(q)}</div>
            <div className="flex gap-2 mt-0.5">
              {quoteDate(q) && (
                <span className="text-[9px] text-neon-blue/70 font-mono">{quoteDate(q)}</span>
              )}
              {quoteSource(q) && (
                <span className="text-[9px] text-slate-600">via {quoteSource(q)}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────

export default function GuestReviewsPage() {
  const [propertyName, setPropertyName] = useState('')
  const [location, setLocation] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
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
      setShowHistory(false)
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
  const totalActions = detail?.improvementPlan.reduce((a, p) => a + p.actions.length, 0) ?? 0

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Guest Review Analyzer"
        subtitle="AI-powered hotel review intelligence — sentiment analysis, theme extraction, and improvement plans from 3+ years of guest feedback"
        count={history.length}
      />

      {/* ── Form + History Toggle ──────────────────────────────────────── */}
      <div className="flex gap-3 mb-6">
        <SectionCard title="Analyze Property" className="flex-1">
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
            <button
              className="cyber-btn-secondary cyber-btn-sm flex-shrink-0"
              onClick={() => setShowHistory(!showHistory)}
            >
              {showHistory ? 'Hide History' : `History (${history.length})`}
            </button>
          </div>
          {analyzeMut.isPending && (
            <div className="mt-3 text-xs text-neon-blue animate-pulse">
              Searching 16 queries across review platforms, scraping 8 review pages, running deep AI
              analysis... This takes 30-90 seconds.
            </div>
          )}
          {analyzeMut.error && (
            <div className="mt-3 text-xs text-neon-red">
              Analysis failed: {analyzeMut.error.message}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Collapsible History Drawer ─────────────────────────────────── */}
      {showHistory && (
        <SectionCard title="Analysis History" className="mb-6">
          {historyQuery.isLoading ? (
            <LoadingState message="Loading..." />
          ) : history.length === 0 ? (
            <div className="text-xs text-slate-600 py-4 text-center">No analyses yet.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {history.map((a) => (
                <div
                  key={a.id}
                  className={`group relative bg-bg-deep rounded px-3 py-2.5 border transition-colors ${
                    selectedId === a.id
                      ? 'border-neon-blue bg-neon-blue/5'
                      : 'border-border-dim hover:border-white/10'
                  }`}
                >
                  <button
                    onClick={() => {
                      setSelectedId(a.id)
                      setShowHistory(false)
                    }}
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
                      <span className="text-[10px] text-slate-500">{a.sourceCount} src</span>
                      <span className="text-[10px] text-slate-500">{a.themes.length} themes</span>
                    </div>
                    {a.location && (
                      <div className="text-[9px] text-slate-600 mt-0.5 truncate">{a.location}</div>
                    )}
                    <div className="text-[9px] text-slate-700 mt-0.5">{timeAgo(a.createdAt)}</div>
                  </button>
                  <button
                    className="absolute top-2 right-2 text-[10px] text-slate-700 hover:text-neon-red opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`Delete "${a.propertyName}"?`)) deleteMut.mutate({ id: a.id })
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Full-Width Analysis ────────────────────────────────────────── */}
      {!detail ? (
        <SectionCard title="Analysis Results">
          <div className="text-xs text-slate-600 py-12 text-center">
            {analyzeMut.isPending
              ? 'Analysis in progress...'
              : 'Enter a property name above or select from history to view analysis'}
          </div>
        </SectionCard>
      ) : (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-100">{detail.propertyName}</h2>
              {detail.location && <div className="text-sm text-slate-400">{detail.location}</div>}
              <div className="text-[10px] text-slate-600 mt-0.5">
                Analyzed {new Date(detail.createdAt).toLocaleDateString()} &middot;{' '}
                {detail.sourceCount} sources &middot; {detail.themes.length} themes &middot;{' '}
                {totalActions} improvement actions
              </div>
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
                className="cyber-btn-secondary cyber-btn-xs"
                onClick={() => {
                  if (confirm(`Delete "${detail.propertyName}"?`))
                    deleteMut.mutate({ id: detail.id })
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
              label="Neutral"
              value={detail.sentimentBreakdown.neutral}
              color="blue"
              sub={sentTotal > 0 ? `${neuPct}% of reviews` : '—'}
            />
            <StatCard
              label="Negative"
              value={detail.sentimentBreakdown.negative}
              color="red"
              sub={sentTotal > 0 ? `${negPct}% of reviews` : '—'}
            />
          </PageGrid>

          {/* Sentiment bar */}
          <SectionCard title="Sentiment Distribution">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-7 bg-bg-elevated rounded-full overflow-hidden flex">
                {posPct > 0 && (
                  <div
                    className="bg-neon-green h-full transition-all flex items-center justify-center"
                    style={{ width: `${posPct}%` }}
                  >
                    <span className="text-[10px] font-mono font-bold text-black">{posPct}%</span>
                  </div>
                )}
                {neuPct > 0 && (
                  <div
                    className="bg-slate-500 h-full transition-all flex items-center justify-center"
                    style={{ width: `${neuPct}%` }}
                  >
                    <span className="text-[10px] font-mono font-bold text-white">{neuPct}%</span>
                  </div>
                )}
                {negPct > 0 && (
                  <div
                    className="bg-neon-red h-full transition-all flex items-center justify-center"
                    style={{ width: `${negPct}%` }}
                  >
                    <span className="text-[10px] font-mono font-bold text-white">{negPct}%</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-5 mt-2 text-[10px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-neon-green inline-block" /> Positive (
                {detail.sentimentBreakdown.positive})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" /> Neutral (
                {detail.sentimentBreakdown.neutral})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-neon-red inline-block" /> Negative (
                {detail.sentimentBreakdown.negative})
              </span>
            </div>
          </SectionCard>

          {/* Themes — expandable with all quotes and dates */}
          <SectionCard title={`Review Themes (${detail.themes.length})`}>
            {detail.themes.length === 0 ? (
              <div className="text-xs text-slate-600 py-4 text-center">No themes extracted</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {detail.themes.map((theme, i) => (
                  <button
                    key={i}
                    onClick={() => setExpandedTheme(expandedTheme === i ? null : i)}
                    className="w-full text-left bg-bg-deep rounded-lg px-4 py-3 border border-border-dim hover:border-white/10 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <StatusBadge
                        label={theme.sentiment}
                        color={sentimentColor(theme.sentiment)}
                      />
                      <span className="text-xs text-slate-200 font-medium flex-1">
                        {theme.category}
                      </span>
                      <span className="text-[10px] text-slate-500">{theme.frequency}</span>
                    </div>
                    {/* Always show first quote */}
                    {theme.quotes.length > 0 && (
                      <div className="text-[10px] text-slate-400 italic">
                        &ldquo;{quoteText(theme.quotes[0])}&rdquo;
                        {quoteDate(theme.quotes[0]) && (
                          <span className="text-neon-blue/60 not-italic ml-1 font-mono text-[9px]">
                            {quoteDate(theme.quotes[0])}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Expanded: show all quotes with dates */}
                    {expandedTheme === i && theme.quotes.length > 1 && (
                      <QuoteBlock quotes={theme.quotes.slice(1)} />
                    )}
                    {theme.quotes.length > 1 && (
                      <div className="text-[9px] text-slate-600 mt-1.5">
                        {expandedTheme === i
                          ? 'Click to collapse'
                          : `+${theme.quotes.length - 1} more guest comments`}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Strengths & Weaknesses */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <SectionCard title={`Strengths (${detail.strengths.length})`}>
              {detail.strengths.length === 0 ? (
                <div className="text-xs text-slate-600 py-4 text-center">None identified</div>
              ) : (
                <div className="space-y-3">
                  {detail.strengths.map((s, i) => (
                    <div
                      key={i}
                      className="bg-bg-deep rounded-lg px-4 py-3 border border-border-dim"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="neon-dot neon-dot-green" />
                        <span className="text-xs text-slate-200 font-medium">{s.area}</span>
                      </div>
                      <div className="text-[11px] text-slate-300 leading-relaxed">
                        {s.description}
                      </div>
                      <QuoteBlock quotes={s.quotes} />
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title={`Weaknesses (${detail.weaknesses.length})`}>
              {detail.weaknesses.length === 0 ? (
                <div className="text-xs text-slate-600 py-4 text-center">None identified</div>
              ) : (
                <div className="space-y-3">
                  {detail.weaknesses.map((w, i) => (
                    <div
                      key={i}
                      className="bg-bg-deep rounded-lg px-4 py-3 border border-border-dim"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <StatusBadge label={w.severity} color={severityColor(w.severity)} />
                        <span className="text-xs text-slate-200 font-medium">{w.area}</span>
                      </div>
                      <div className="text-[11px] text-slate-300 leading-relaxed">
                        {w.description}
                      </div>
                      <QuoteBlock quotes={w.quotes} />
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* Improvement Plan */}
          <SectionCard title={`Improvement Plan (${totalActions} actions)`}>
            {detail.improvementPlan.length === 0 ? (
              <div className="text-xs text-slate-600 py-4 text-center">
                No improvement plan generated
              </div>
            ) : (
              <div className="space-y-6">
                {detail.improvementPlan.map((phase, pi) => (
                  <div key={pi}>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="w-7 h-7 rounded-full bg-neon-blue/20 text-neon-blue text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {pi + 1}
                      </span>
                      <div>
                        <div className="text-sm font-mono font-bold text-neon-blue">
                          {phase.phase}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {phase.timeframe} &middot; {phase.actions.length} actions
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 ml-4 border-l-2 border-neon-blue/20 pl-4">
                      {phase.actions.map((action, ai) => (
                        <div
                          key={ai}
                          className="bg-bg-deep rounded-lg px-4 py-3 border border-border-dim"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] text-slate-200 font-medium">
                                {action.action}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-1">
                                <span className="text-slate-500 font-medium">Problem:</span>{' '}
                                {action.problem}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                <span className="text-slate-500 font-medium">Target:</span>{' '}
                                {action.kpiTarget}
                              </div>
                            </div>
                            <StatusBadge label={`${action.cost}`} color={costBadge(action.cost)} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Executive Summary — rendered as rich markdown */}
          {detail.rawSummary && (
            <SectionCard title="Executive Summary">
              <div
                className="prose prose-invert prose-sm max-w-none
                prose-headings:text-slate-200 prose-headings:font-mono prose-headings:border-b prose-headings:border-border prose-headings:pb-2 prose-headings:mb-3
                prose-h2:text-sm prose-h2:text-neon-blue prose-h3:text-xs prose-h3:text-slate-300
                prose-p:text-[11px] prose-p:text-slate-300 prose-p:leading-relaxed
                prose-li:text-[11px] prose-li:text-slate-300
                prose-strong:text-slate-200 prose-strong:font-semibold
                prose-blockquote:border-neon-blue/30 prose-blockquote:text-slate-400 prose-blockquote:text-[11px]
                prose-table:text-[10px]
                prose-th:text-slate-300 prose-th:font-mono prose-th:text-[10px]
                prose-td:text-slate-400 prose-td:text-[10px]
              "
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.rawSummary}</ReactMarkdown>
              </div>
            </SectionCard>
          )}
        </div>
      )}
    </div>
  )
}
