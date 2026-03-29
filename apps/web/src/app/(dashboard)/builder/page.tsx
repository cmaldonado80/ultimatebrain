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

  const handleAnalyze = () => {
    if (domain.trim()) setActiveDomain(domain.trim().toLowerCase())
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
        </>
      )}
    </div>
  )
}
