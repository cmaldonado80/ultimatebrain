'use client'

/**
 * Product Builder — operator tool for domain analysis and product planning.
 * Inspects system state, detects gaps, generates blueprints and roadmaps.
 */

import { useState } from 'react'

import { trpc } from '../../../utils/trpc'

const LAYER_COLORS: Record<string, string> = {
  complete: 'bg-neon-green/20 text-neon-green border-neon-green/30',
  partial: 'bg-neon-yellow/20 text-neon-yellow border-neon-yellow/30',
  missing: 'bg-neon-red/10 text-neon-red/70 border-neon-red/20',
}

const EFFORT_BADGE: Record<string, string> = {
  small: 'bg-neon-green/10 text-neon-green',
  medium: 'bg-neon-yellow/10 text-neon-yellow',
  large: 'bg-neon-red/10 text-neon-red',
}

export default function BuilderPage() {
  const [domain, setDomain] = useState('')
  const [activeDomain, setActiveDomain] = useState<string | null>(null)

  const [executionResults, setExecutionResults] = useState<
    Record<string, { status: string; result?: string; error?: string }>
  >({})
  const [previewContent, setPreviewContent] = useState<string | null>(null)

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
    // Show preview for generated files
    if ((action.type as string) === 'generate_file' && result.result) {
      setPreviewContent(result.result)
    }
    // Refresh state + gaps after execution
    utils.builder.inspectDomain.invalidate({ domain: activeDomain })
    utils.builder.getGapReport.invalidate({ domain: activeDomain })
  }

  const loading = blueprintQuery.isLoading || stateQuery.isLoading || gapQuery.isLoading
  const blueprint = blueprintQuery.data
  const state = stateQuery.data
  const gaps = gapQuery.data

  return (
    <div className="p-6 text-slate-50 max-w-[900px]">
      <h2 className="m-0 text-[22px] font-bold font-orbitron mb-2">Product Builder</h2>
      <p className="text-[13px] text-slate-500 mb-6">
        Analyze any domain and generate a product blueprint with gap detection.
      </p>

      {/* Input */}
      <div className="cyber-card p-4 mb-6">
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
          {['astrology', 'legal', 'hospitality', 'healthcare', 'marketing', 'soc-ops'].map((d) => (
            <button
              key={d}
              className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-slate-500 hover:text-slate-300 hover:bg-white/10 border-none cursor-pointer transition-colors"
              onClick={() => {
                setDomain(d)
                setActiveDomain(d)
              }}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {!activeDomain && (
        <div className="text-center text-slate-600 py-12">
          Enter a domain name to analyze its product readiness.
        </div>
      )}

      {activeDomain && gaps && (
        <>
          {/* Completion Bar */}
          <div className="cyber-card p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[14px] font-bold text-slate-200">
                {activeDomain.charAt(0).toUpperCase() + activeDomain.slice(1)} Domain
              </div>
              <div className="text-[14px] font-mono text-neon-teal">{gaps.completionPercent}%</div>
            </div>
            <div className="w-full h-2 bg-bg-elevated rounded-full overflow-hidden">
              <div
                className="h-full bg-neon-teal rounded-full transition-all duration-500"
                style={{ width: `${gaps.completionPercent}%` }}
              />
            </div>
            <div className="flex gap-4 mt-2 text-[10px]">
              <span className="text-neon-green">{gaps.completeLayers.length} complete</span>
              <span className="text-neon-yellow">{gaps.partialLayers.length} partial</span>
              <span className="text-neon-red/70">{gaps.missingLayers.length} missing</span>
            </div>
          </div>

          {/* Layer Status Grid */}
          <div className="cyber-card p-4 mb-4">
            <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
              Product Layers
            </div>
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
          </div>

          {/* System State */}
          {state && (
            <div className="cyber-card p-4 mb-4">
              <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
                System State
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
                <div className="text-slate-500">Mini Brain</div>
                <div className={state.hasMiniBrain ? 'text-neon-green' : 'text-slate-600'}>
                  {state.hasMiniBrain ? `Active (${state.miniBrainStatus})` : 'Not deployed'}
                </div>
                <div className="text-slate-500">Development App</div>
                <div className={state.hasApp ? 'text-neon-green' : 'text-slate-600'}>
                  {state.hasApp ? `Active (${state.appStatus})` : 'Not deployed'}
                </div>
                <div className="text-slate-500">Template</div>
                <div className="text-slate-300">{state.templateId ?? 'None'}</div>
                <div className="text-slate-500">Agents</div>
                <div className="text-slate-300">{state.agentCount}</div>
                <div className="text-slate-500">Entities</div>
                <div className="text-slate-300">{state.entityCount}</div>
                <div className="text-slate-500">Domain Tables</div>
                <div className="text-slate-300">
                  {state.existingTables.length > 0 ? state.existingTables.join(', ') : 'None'}
                </div>
                <div className="text-slate-500">Routes</div>
                <div className="text-slate-300 font-mono text-[10px]">
                  {state.registeredRoutes.length > 0 ? state.registeredRoutes.join(', ') : 'None'}
                </div>
              </div>
            </div>
          )}

          {/* Roadmap */}
          {gaps.nextSteps.length > 0 && (
            <div className="cyber-card p-4 mb-4">
              <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
                Roadmap
              </div>
              <div className="space-y-1.5">
                {gaps.nextSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 bg-bg-elevated rounded px-3 py-2">
                    <span className="text-neon-teal font-mono text-[11px] w-5 text-right shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-[12px] text-slate-200 flex-1">{step.action}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded ${EFFORT_BADGE[step.effort]}`}
                    >
                      {step.effort}
                    </span>
                    <span className="text-[9px] text-slate-600">{step.layer}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Blueprint */}
          {blueprint && (
            <div className="cyber-card p-4 mb-4">
              <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
                Blueprint
              </div>

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
            </div>
          )}

          {/* Usage Insights */}
          {insightsQuery.data && insightsQuery.data.totalEvents > 0 && (
            <div className="cyber-card p-4 mb-4">
              <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
                Product Usage
              </div>
              <div className="grid grid-cols-3 gap-4 text-center mb-3">
                <div>
                  <div className="text-lg font-mono text-slate-200">
                    {insightsQuery.data.totalEvents}
                  </div>
                  <div className="text-[10px] text-slate-500">Events</div>
                </div>
                <div>
                  <div className="text-lg font-mono text-neon-teal">
                    {insightsQuery.data.dailyActiveCount}
                  </div>
                  <div className="text-[10px] text-slate-500">Active Users</div>
                </div>
                <div>
                  <div className="text-lg font-mono text-neon-blue">
                    {Math.round(insightsQuery.data.shareRate * 100)}%
                  </div>
                  <div className="text-[10px] text-slate-500">Share Rate</div>
                </div>
              </div>
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
            </div>
          )}

          {/* Improvement Proposals */}
          {proposalsQuery.data && proposalsQuery.data.length > 0 && (
            <div className="cyber-card p-4 mb-4">
              <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
                Improvement Proposals ({proposalsQuery.data.length})
              </div>
              <div className="space-y-1.5">
                {proposalsQuery.data.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 bg-bg-elevated rounded px-3 py-2"
                  >
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-neon-purple/10 text-neon-purple shrink-0">
                      {String(p.layer)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-slate-200">{String(p.title)}</div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {String(p.description)}
                      </div>
                    </div>
                    {p.confidence != null && (
                      <span className="text-[9px] text-slate-600 shrink-0">
                        {Math.round(Number(p.confidence) * 100)}%
                      </span>
                    )}
                    {p.status === 'pending' && (
                      <>
                        <button
                          onClick={() => approveMut.mutate({ id: p.id })}
                          className="text-[10px] text-neon-green hover:text-neon-green/80 bg-transparent border-none cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => rejectMut.mutate({ id: p.id })}
                          className="text-[10px] text-neon-red/50 hover:text-neon-red bg-transparent border-none cursor-pointer"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {p.status !== 'pending' && (
                      <span
                        className={`text-[9px] ${p.status === 'approved' ? 'text-neon-green' : 'text-slate-600'}`}
                      >
                        {String(p.status)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execution Plan */}
          {execPlanQuery.data && execPlanQuery.data.actions.length > 0 && (
            <div className="cyber-card p-4 mb-4">
              <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
                Execution Plan ({execPlanQuery.data.actions.length} actions)
              </div>
              <div className="space-y-1.5">
                {execPlanQuery.data.actions.map((action) => {
                  const execResult = executionResults[action.id]
                  const status = execResult?.status ?? action.status
                  return (
                    <div
                      key={action.id}
                      className="flex items-center gap-2 bg-bg-elevated rounded px-3 py-2"
                    >
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          status === 'completed'
                            ? 'bg-neon-green'
                            : status === 'failed'
                              ? 'bg-neon-red'
                              : status === 'skipped'
                                ? 'bg-slate-600'
                                : 'bg-slate-500'
                        }`}
                      />
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${
                          action.type === 'create_table'
                            ? 'bg-neon-teal/10 text-neon-teal'
                            : action.type === 'create_entity'
                              ? 'bg-neon-purple/10 text-neon-purple'
                              : action.type === 'informational'
                                ? 'bg-slate-700 text-slate-400'
                                : 'bg-neon-blue/10 text-neon-blue'
                        }`}
                      >
                        {action.type}
                      </span>
                      <span className="text-[11px] text-slate-300 flex-1">
                        {action.description}
                      </span>
                      {action.autoExecutable && status === 'pending' && (
                        <button
                          onClick={() =>
                            handleExecuteStep(action as unknown as Record<string, unknown>)
                          }
                          disabled={executeMut.isPending}
                          className="text-[10px] px-2 py-0.5 rounded bg-neon-teal/20 text-neon-teal hover:bg-neon-teal/30 border-none cursor-pointer disabled:opacity-50"
                        >
                          Execute
                        </button>
                      )}
                      {!action.autoExecutable && status === 'pending' && (
                        <span className="text-[9px] text-slate-600">manual</span>
                      )}
                      {status === 'completed' && (
                        <span className="text-[9px] text-neon-green">done</span>
                      )}
                      {status === 'failed' && (
                        <span className="text-[9px] text-neon-red" title={execResult?.error}>
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
            </div>
          )}
        </>
      )}

      {/* File Preview Modal (structured FileOutput) */}
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

          return (
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6"
              onClick={() => setPreviewContent(null)}
            >
              <div
                className="cyber-card w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <div className="text-[13px] font-bold text-slate-300 font-mono">{filePath}</div>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded ${
                        safety === 'low'
                          ? 'bg-neon-green/10 text-neon-green'
                          : safety === 'medium'
                            ? 'bg-neon-yellow/10 text-neon-yellow'
                            : 'bg-neon-red/10 text-neon-red'
                      }`}
                    >
                      {safety}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-500">
                      {lang}
                    </span>
                    <span className="text-[9px] text-slate-600">{lines} lines</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(displayContent)
                      }}
                      className="text-[11px] px-3 py-1 rounded bg-neon-teal/20 text-neon-teal hover:bg-neon-teal/30 border-none cursor-pointer"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => setPreviewContent(null)}
                      className="text-[11px] px-3 py-1 rounded bg-white/5 text-slate-400 hover:text-slate-200 border-none cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
                <pre className="p-4 overflow-auto flex-1 text-[11px] text-slate-300 font-mono leading-relaxed whitespace-pre-wrap">
                  {displayContent}
                </pre>
              </div>
            </div>
          )
        })()}
    </div>
  )
}
