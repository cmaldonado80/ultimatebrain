'use client'

/**
 * Product Builder — operator tool for domain analysis and product planning.
 * Inspects system state, detects gaps, generates blueprints and roadmaps.
 *
 * Flow: Analyze → Inspect → Approve → Execute → Re-check
 */

import { useState } from 'react'

import { ActionBar } from '../../../components/ui/action-bar'
import { EmptyState } from '../../../components/ui/empty-state'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatCard } from '../../../components/ui/stat-card'
import type { StatusColor } from '../../../components/ui/status-badge'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

// ── Constants ────────────────────────────────────────────────────────────

const LAYER_COLORS: Record<string, string> = {
  complete: 'bg-neon-green/20 text-neon-green border-neon-green/30',
  partial: 'bg-neon-yellow/20 text-neon-yellow border-neon-yellow/30',
  missing: 'bg-neon-red/10 text-neon-red/70 border-neon-red/20',
}

const EFFORT_COLOR: Record<string, StatusColor> = {
  small: 'green',
  medium: 'yellow',
  large: 'red',
}

const RISK_COLOR: Record<string, StatusColor> = {
  low: 'blue',
  medium: 'yellow',
  high: 'red',
}

const RISK_VARIANT: Record<string, 'standard' | 'highlighted' | 'warning' | 'error'> = {
  low: 'standard',
  medium: 'warning',
  high: 'error',
}

const EXEC_TYPE_COLOR: Record<string, StatusColor> = {
  create_table: 'teal',
  create_entity: 'purple',
  generate_file: 'blue',
  informational: 'slate',
}

const QUICK_DOMAINS = ['astrology', 'legal', 'hospitality', 'healthcare', 'marketing', 'soc-ops']

// ── Main Page ────────────────────────────────────────────────────────────

export default function BuilderPage() {
  const [domain, setDomain] = useState('')
  const [activeDomain, setActiveDomain] = useState<string | null>(null)
  const [executionResults, setExecutionResults] = useState<
    Record<string, { status: string; result?: string; error?: string }>
  >({})
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [copiedFile, setCopiedFile] = useState(false)

  const blueprintQuery = trpc.builder.generateBlueprint.useQuery(
    { domain: activeDomain! },
    { enabled: !!activeDomain },
  )
  const stateQuery = trpc.builder.inspectDomain.useQuery(
    { domain: activeDomain! },
    { enabled: !!activeDomain },
  )
  const gapQuery = trpc.builder.getGapReport.useQuery(
    { domain: activeDomain! },
    { enabled: !!activeDomain },
  )
  const execPlanQuery = trpc.builder.getExecutionPlan.useQuery(
    { domain: activeDomain! },
    { enabled: !!activeDomain },
  )
  const insightsQuery = trpc.builder.getProductInsights.useQuery(
    { domain: activeDomain! },
    { enabled: !!activeDomain },
  )
  const proposalsQuery = trpc.builder.getProposals.useQuery(
    { domain: activeDomain! },
    { enabled: !!activeDomain },
  )
  const executeMut = trpc.builder.executeStep.useMutation()
  const approveMut = trpc.builder.approveProposal.useMutation({
    onSuccess: () => utils.builder.getProposals.invalidate(),
  })
  const rejectMut = trpc.builder.rejectProposal.useMutation({
    onSuccess: () => utils.builder.getProposals.invalidate(),
  })
  const utils = trpc.useUtils()

  const handleAnalyze = () => {
    if (domain.trim()) {
      setActiveDomain(domain.trim().toLowerCase())
      setExecutionResults({})
    }
  }

  const handleExecuteStep = async (action: Record<string, unknown>) => {
    if (!activeDomain) return
    const result = await executeMut.mutateAsync({
      domain: activeDomain,
      action: action as Parameters<typeof executeMut.mutateAsync>[0]['action'],
    })
    setExecutionResults((prev) => ({
      ...prev,
      [result.id]: { status: result.status, result: result.result, error: result.error },
    }))
    if ((action.type as string) === 'generate_file' && result.result) {
      setPreviewContent(result.result)
    }
    utils.builder.inspectDomain.invalidate({ domain: activeDomain })
    utils.builder.getGapReport.invalidate({ domain: activeDomain })
  }

  const loading = blueprintQuery.isLoading || stateQuery.isLoading || gapQuery.isLoading
  const blueprint = blueprintQuery.data
  const state = stateQuery.data
  const gaps = gapQuery.data

  return (
    <div className="p-6 text-slate-50 max-w-[900px]">
      {/* ─── 1. Header ──────────────────────────────────────────────────── */}
      <PageHeader
        title="Product Builder"
        subtitle="Analyze domains, detect gaps, and guide safe product evolution"
        actions={
          activeDomain ? (
            <button
              className="cyber-btn-secondary cyber-btn-sm"
              onClick={() => {
                utils.builder.inspectDomain.invalidate({ domain: activeDomain })
                utils.builder.getGapReport.invalidate({ domain: activeDomain })
                utils.builder.generateBlueprint.invalidate({ domain: activeDomain })
                utils.builder.getExecutionPlan.invalidate({ domain: activeDomain })
                utils.builder.getProposals.invalidate()
              }}
            >
              Refresh
            </button>
          ) : undefined
        }
      />

      {/* ─── 2. Domain Input / Quick Start ──────────────────────────────── */}
      <SectionCard className="mb-6">
        <div className="flex gap-2">
          <input
            className="cyber-input flex-1"
            placeholder="Domain name (e.g. astrology, legal, hospitality)"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
          />
          <button
            className="cyber-btn-primary px-4"
            onClick={handleAnalyze}
            disabled={!domain.trim() || loading}
          >
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
        <div className="flex gap-1.5 mt-2">
          {QUICK_DOMAINS.map((d) => (
            <button
              key={d}
              className={`text-[10px] px-2 py-0.5 rounded border-none cursor-pointer transition-colors ${
                activeDomain === d
                  ? 'bg-neon-teal/20 text-neon-teal'
                  : 'bg-white/5 text-slate-500 hover:text-slate-300 hover:bg-white/10'
              }`}
              onClick={() => {
                setDomain(d)
                setActiveDomain(d)
                setExecutionResults({})
              }}
            >
              {d}
            </button>
          ))}
        </div>
      </SectionCard>

      {/* ─── Empty state (no domain) ────────────────────────────────────── */}
      {!activeDomain && (
        <EmptyState
          icon="⚡"
          title="No domain analyzed yet"
          message="Enter a domain above to analyze its product readiness, detect gaps, and generate an evolution plan."
        />
      )}

      {/* ─── Loading state ──────────────────────────────────────────────── */}
      {activeDomain && loading && (
        <LoadingState message={`Analyzing ${activeDomain}...`} fullHeight={false} />
      )}

      {activeDomain && gaps && (
        <>
          {/* ─── 3. Completion Summary ────────────────────────────────────── */}
          <SectionCard className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[14px] font-bold text-slate-200">
                {activeDomain.charAt(0).toUpperCase() + activeDomain.slice(1)} Domain
              </div>
              <div className="text-[14px] font-mono text-neon-teal font-bold">
                {gaps.completionPercent}%
              </div>
            </div>
            <div className="w-full h-2.5 bg-bg-elevated rounded-full overflow-hidden mb-3">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${gaps.completionPercent}%`,
                  background:
                    gaps.completionPercent >= 80
                      ? 'var(--color-neon-green)'
                      : gaps.completionPercent >= 50
                        ? 'var(--color-neon-teal)'
                        : 'var(--color-neon-yellow)',
                }}
              />
            </div>
            <PageGrid cols="3" gap="sm">
              <StatCard label="Complete" value={gaps.completeLayers.length} color="green" />
              <StatCard label="Partial" value={gaps.partialLayers.length} color="yellow" />
              <StatCard label="Missing" value={gaps.missingLayers.length} color="red" />
            </PageGrid>
          </SectionCard>

          {/* ─── 4. Roadmap Summary ──────────────────────────────────────── */}
          {gaps.nextSteps.length > 0 && (
            <SectionCard title="Roadmap" className="mb-4">
              <div className="space-y-1.5">
                {gaps.nextSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 bg-bg-elevated rounded px-3 py-2">
                    <span className="text-neon-teal font-mono text-[11px] w-5 text-right shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-[12px] text-slate-200 flex-1">{step.action}</span>
                    <StatusBadge label={step.effort} color={EFFORT_COLOR[step.effort] ?? 'slate'} />
                    <span className="text-[9px] text-slate-600">{step.layer}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* ─── 5. Gap / Layer Status Grid ──────────────────────────────── */}
          <SectionCard title="Product Layers" className="mb-4">
            <div className="flex flex-wrap gap-1.5">
              {gaps.completeLayers.map((l) => (
                <span
                  key={l}
                  className={`text-[10px] px-2 py-1 rounded border ${LAYER_COLORS.complete}`}
                >
                  {l}
                </span>
              ))}
              {gaps.partialLayers.map((l) => (
                <span
                  key={l.layer}
                  className={`text-[10px] px-2 py-1 rounded border ${LAYER_COLORS.partial}`}
                  title={l.detail}
                >
                  {l.layer}
                </span>
              ))}
              {gaps.missingLayers.map((l) => (
                <span
                  key={l}
                  className={`text-[10px] px-2 py-1 rounded border ${LAYER_COLORS.missing}`}
                >
                  {l}
                </span>
              ))}
            </div>
          </SectionCard>

          {/* ─── 6. Improvement Proposals ─────────────────────────────────── */}
          {proposalsQuery.data && proposalsQuery.data.length > 0 && (
            <SectionCard
              title={`Proposals (${proposalsQuery.data.length})`}
              variant="intelligence"
              className="mb-4"
            >
              <div className="space-y-2">
                {proposalsQuery.data.map((p) => {
                  const risk = 'low'
                  const variant = RISK_VARIANT[risk] ?? 'standard'
                  return (
                    <SectionCard key={p.id} variant={variant} padding="sm">
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col gap-1 shrink-0 pt-0.5">
                          <StatusBadge label={String(p.layer)} color="purple" />
                          <StatusBadge label={`${risk} risk`} color={RISK_COLOR[risk] ?? 'slate'} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] text-slate-200 font-medium mb-0.5">
                            {String(p.title)}
                          </div>
                          <div className="text-[11px] text-slate-400 leading-relaxed">
                            {String(p.description)}
                          </div>
                          {p.expectedImpact && (
                            <div className="text-[10px] text-slate-500 mt-1 italic">
                              Impact: {String(p.expectedImpact)}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {p.confidence != null && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              {Math.round(Number(p.confidence) * 100)}%
                            </span>
                          )}
                          {p.status === 'pending' && (
                            <ActionBar>
                              <button
                                onClick={() => approveMut.mutate({ id: p.id })}
                                className="text-[10px] px-2.5 py-1 rounded bg-neon-green/10 text-neon-green hover:bg-neon-green/20 border-none cursor-pointer transition-colors"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => rejectMut.mutate({ id: p.id })}
                                className="text-[10px] px-2.5 py-1 rounded bg-neon-red/10 text-neon-red/60 hover:text-neon-red hover:bg-neon-red/20 border-none cursor-pointer transition-colors"
                              >
                                Reject
                              </button>
                            </ActionBar>
                          )}
                          {p.status !== 'pending' && (
                            <StatusBadge
                              label={String(p.status)}
                              color={p.status === 'approved' ? 'green' : 'slate'}
                            />
                          )}
                        </div>
                      </div>
                    </SectionCard>
                  )
                })}
              </div>
            </SectionCard>
          )}

          {/* ─── 7. Execution Plan ───────────────────────────────────────── */}
          {execPlanQuery.data && execPlanQuery.data.actions.length > 0 && (
            <SectionCard
              title={`Execution Plan (${execPlanQuery.data.actions.length} actions)`}
              className="mb-4"
            >
              <div className="space-y-1.5">
                {execPlanQuery.data.actions.map((action) => {
                  const execResult = executionResults[action.id]
                  const status = execResult?.status ?? action.status
                  const typeColor = EXEC_TYPE_COLOR[action.type] ?? 'blue'
                  return (
                    <div
                      key={action.id}
                      className={`flex items-center gap-2 rounded px-3 py-2 ${
                        status === 'completed'
                          ? 'bg-neon-green/5 border border-neon-green/10'
                          : status === 'failed'
                            ? 'bg-neon-red/5 border border-neon-red/10'
                            : 'bg-bg-elevated'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          status === 'completed'
                            ? 'bg-neon-green'
                            : status === 'failed'
                              ? 'bg-neon-red'
                              : status === 'skipped'
                                ? 'bg-slate-600'
                                : action.autoExecutable
                                  ? 'bg-neon-teal'
                                  : 'bg-slate-500'
                        }`}
                      />
                      <StatusBadge label={action.type.replace(/_/g, ' ')} color={typeColor} />
                      <span className="text-[11px] text-slate-300 flex-1">
                        {action.description}
                      </span>
                      {action.description && action.type !== 'informational' && (
                        <span className="text-[9px] text-slate-600 font-mono shrink-0">
                          {action.type}
                        </span>
                      )}
                      {action.autoExecutable && status === 'pending' && (
                        <button
                          onClick={() =>
                            handleExecuteStep(action as unknown as Record<string, unknown>)
                          }
                          disabled={executeMut.isPending}
                          className="text-[10px] px-2.5 py-1 rounded bg-neon-teal/20 text-neon-teal hover:bg-neon-teal/30 border-none cursor-pointer disabled:opacity-50 transition-colors"
                        >
                          Execute
                        </button>
                      )}
                      {!action.autoExecutable && status === 'pending' && (
                        <StatusBadge label="manual" color="slate" />
                      )}
                      {status === 'completed' && <StatusBadge label="done" color="green" />}
                      {status === 'failed' && (
                        <span
                          className="text-[9px] text-neon-red cursor-help"
                          title={execResult?.error}
                        >
                          failed
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              {executeMut.error && (
                <div className="text-[11px] text-neon-red mt-2">{executeMut.error.message}</div>
              )}
            </SectionCard>
          )}

          {/* ─── 8. Blueprint (reference) ────────────────────────────────── */}
          {blueprint && (
            <SectionCard title="Blueprint" variant="intelligence" className="mb-4">
              <div className="mb-3">
                <div className="text-[11px] text-neon-teal font-semibold mb-1">Capabilities</div>
                <div className="flex flex-wrap gap-1">
                  {blueprint.coreCapabilities.map((c) => (
                    <span
                      key={c}
                      className="text-[10px] px-2 py-0.5 rounded bg-neon-teal/10 text-neon-teal border border-neon-teal/20"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mb-3">
                <div className="text-[11px] text-neon-blue font-semibold mb-1">
                  Suggested Agents
                </div>
                <div className="space-y-1">
                  {blueprint.suggestedAgents.map((a, i) => (
                    <div key={i} className="text-[11px] text-slate-400">
                      <span className="text-slate-200">{a.name}</span> — {a.role}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-3">
                <div className="text-[11px] text-neon-purple font-semibold mb-1">Data Model</div>
                <div className="space-y-1">
                  {blueprint.dataModel.tables.map((t, i) => (
                    <div key={i} className="text-[11px]">
                      <span className="text-slate-200 font-mono">{t.name}</span>
                      <span className="text-slate-600 ml-1">— {t.purpose}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500 font-semibold mb-1">App Pages</div>
                <div className="flex flex-wrap gap-1">
                  {blueprint.appPages.map((p, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400 font-mono"
                    >
                      {p.route}
                    </span>
                  ))}
                </div>
              </div>
            </SectionCard>
          )}

          {/* ─── 9. System State (reference) ─────────────────────────────── */}
          {state && (
            <SectionCard title="System State" className="mb-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
                <div className="text-slate-500">Mini Brain</div>
                <div className="flex items-center gap-1.5">
                  <StatusBadge
                    label={
                      state.hasMiniBrain ? `Active (${state.miniBrainStatus})` : 'Not deployed'
                    }
                    color={state.hasMiniBrain ? 'green' : 'slate'}
                    dot
                  />
                </div>
                <div className="text-slate-500">Development App</div>
                <div className="flex items-center gap-1.5">
                  <StatusBadge
                    label={state.hasApp ? `Active (${state.appStatus})` : 'Not deployed'}
                    color={state.hasApp ? 'green' : 'slate'}
                    dot
                  />
                </div>
                <div className="text-slate-500">Template</div>
                <div className="text-slate-300">{state.templateId ?? 'None'}</div>
                <div className="text-slate-500">Agents</div>
                <div className="text-slate-300">{state.agentCount}</div>
                <div className="text-slate-500">Entities</div>
                <div className="text-slate-300">{state.entityCount}</div>
                <div className="text-slate-500">Domain Tables</div>
                <div className="text-slate-300 font-mono text-[10px]">
                  {state.existingTables.length > 0 ? state.existingTables.join(', ') : 'None'}
                </div>
                <div className="text-slate-500">Routes</div>
                <div className="text-slate-300 font-mono text-[10px]">
                  {state.registeredRoutes.length > 0 ? state.registeredRoutes.join(', ') : 'None'}
                </div>
              </div>
            </SectionCard>
          )}

          {/* ─── 10. Usage Insights (supporting evidence) ────────────────── */}
          {insightsQuery.data && insightsQuery.data.totalEvents > 0 && (
            <SectionCard title="Usage Insights" className="mb-4">
              <PageGrid cols="3" gap="sm" className="mb-3">
                <StatCard label="Events" value={insightsQuery.data.totalEvents} />
                <StatCard
                  label="Active Users"
                  value={insightsQuery.data.dailyActiveCount}
                  color="blue"
                />
                <StatCard
                  label="Share Rate"
                  value={`${Math.round(insightsQuery.data.shareRate * 100)}%`}
                  color="blue"
                />
              </PageGrid>
              <div className="flex flex-wrap gap-1">
                {Object.entries(insightsQuery.data.actionCounts)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .slice(0, 8)
                  .map(([action, count]) => (
                    <span
                      key={action}
                      className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-slate-400"
                    >
                      {action}: {String(count)}
                    </span>
                  ))}
              </div>
            </SectionCard>
          )}
        </>
      )}

      {/* ─── File Preview Modal ──────────────────────────────────────────── */}
      {previewContent &&
        (() => {
          let fileOutput: {
            filePath?: string
            content?: string
            safetyLevel?: string
            language?: string
            lineCount?: number
          } | null = null
          try {
            fileOutput = JSON.parse(previewContent)
          } catch {
            /* raw content fallback */
          }
          const displayContent = fileOutput?.content ?? previewContent
          const filePath = fileOutput?.filePath ?? 'Generated Output'
          const safety = fileOutput?.safetyLevel ?? 'low'
          const lang = fileOutput?.language ?? 'unknown'
          const lines = fileOutput?.lineCount ?? displayContent.split('\n').length
          const safetyColor: StatusColor =
            safety === 'low' ? 'green' : safety === 'medium' ? 'yellow' : 'red'

          return (
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6"
              onClick={() => setPreviewContent(null)}
            >
              <div
                className="bg-bg-card border border-border rounded-xl backdrop-blur-md w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal header */}
                <div className="flex items-center gap-3 p-4 border-b border-border bg-bg-surface/50">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-slate-200 font-mono truncate">
                      {filePath}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge label={`${safety} risk`} color={safetyColor} />
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-500 font-mono">
                        {lang}
                      </span>
                      <span className="text-[9px] text-slate-600">{lines} lines</span>
                    </div>
                  </div>
                  <ActionBar>
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(displayContent)
                        setCopiedFile(true)
                        setTimeout(() => setCopiedFile(false), 2000)
                      }}
                      className="text-[11px] px-3 py-1.5 rounded bg-neon-teal/20 text-neon-teal hover:bg-neon-teal/30 border-none cursor-pointer transition-colors font-medium"
                    >
                      {copiedFile ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      onClick={() => setPreviewContent(null)}
                      className="text-[11px] px-3 py-1.5 rounded bg-white/5 text-slate-400 hover:text-slate-200 border-none cursor-pointer transition-colors"
                    >
                      Close
                    </button>
                  </ActionBar>
                </div>
                {/* Code content */}
                <pre className="p-4 overflow-auto flex-1 text-[11px] text-slate-300 font-mono leading-relaxed whitespace-pre-wrap bg-bg-deep/50">
                  {displayContent}
                </pre>
              </div>
            </div>
          )
        })()}
    </div>
  )
}
