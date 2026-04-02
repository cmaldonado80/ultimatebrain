'use client'

/**
 * Trajectory Replay — Analyze agent execution paths, find failures, compare runs.
 */

import { useState } from 'react'

import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

export default function TrajectoryPage() {
  const [runId, setRunId] = useState('')
  const [submitted, setSubmitted] = useState('')

  const trajectoryQuery = trpc.evolution.trajectory.useQuery(
    { runId: submitted },
    { enabled: !!submitted },
  )
  const analysisQuery = trpc.evolution.trajectoryAnalysis.useQuery(
    { runId: submitted },
    { enabled: !!submitted },
  )

  const trajectory = trajectoryQuery.data as {
    runId: string
    status: string
    stepCount: number
    totalDurationMs: number | null
    steps: Array<{
      sequence: number
      type: string
      toolName: string | null
      agentName: string | null
      status: string
      durationMs: number | null
    }>
  } | null

  const analysis = analysisQuery.data as {
    totalSteps: number
    totalDurationMs: number
    toolCallDistribution: Record<string, number>
    failedSteps: Array<{ sequence: number; toolName: string | null; status: string }>
    loopPatterns: Array<{ tool: string; count: number; consecutive: boolean }>
    decisionPoints: string[]
  } | null

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Trajectory Replay"
        subtitle="Analyze agent execution paths — find where things went wrong"
      />

      {/* Run ID Input */}
      <SectionCard title="Load Trajectory" className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={runId}
            onChange={(e) => setRunId(e.target.value)}
            placeholder="Enter chat run ID (UUID)..."
            className="flex-1 bg-bg-elevated border border-border-dim rounded px-3 py-1.5 text-sm text-slate-200 focus:border-neon-teal focus:outline-none"
          />
          <button
            onClick={() => setSubmitted(runId.trim())}
            disabled={!runId.trim()}
            className="cyber-btn-primary cyber-btn-sm disabled:opacity-50"
          >
            Analyze
          </button>
        </div>
      </SectionCard>

      {trajectory && (
        <>
          {/* Overview */}
          <SectionCard title={`Run: ${trajectory.runId.slice(0, 8)}`} className="mb-6">
            <div className="flex items-center gap-4 text-[11px]">
              <StatusBadge
                label={trajectory.status}
                color={trajectory.status === 'completed' ? 'green' : 'red'}
              />
              <span className="text-slate-400">{trajectory.stepCount} steps</span>
              <span className="text-slate-400">
                {((trajectory.totalDurationMs ?? 0) / 1000).toFixed(1)}s total
              </span>
            </div>
          </SectionCard>

          {/* Analysis */}
          {analysis && (
            <div className="grid grid-cols-3 gap-6 mb-6">
              <SectionCard title="Tool Distribution">
                <div className="space-y-1">
                  {Object.entries(analysis.toolCallDistribution)
                    .sort(([, a], [, b]) => b - a)
                    .map(([tool, count]) => (
                      <div key={tool} className="flex items-center gap-2 text-[10px]">
                        <span className="text-slate-300 flex-1">{tool}</span>
                        <span className="text-neon-teal">{count}x</span>
                      </div>
                    ))}
                </div>
              </SectionCard>

              <SectionCard title="Loop Patterns">
                {analysis.loopPatterns.length === 0 ? (
                  <div className="text-[10px] text-slate-600">No loops detected</div>
                ) : (
                  <div className="space-y-1">
                    {analysis.loopPatterns.map((lp, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px]">
                        <span className="text-neon-red">{lp.tool}</span>
                        <span className="text-slate-500">{lp.count}x</span>
                        {lp.consecutive && <StatusBadge label="consecutive" color="red" />}
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Decision Points">
                {analysis.decisionPoints.length === 0 ? (
                  <div className="text-[10px] text-slate-600">No tool transitions</div>
                ) : (
                  <div className="space-y-0.5">
                    {analysis.decisionPoints.slice(0, 15).map((dp, i) => (
                      <div key={i} className="text-[9px] text-slate-400">
                        {dp}
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          )}

          {/* Step Timeline */}
          <SectionCard title="Execution Timeline">
            <div className="space-y-1">
              {trajectory.steps.map((step) => (
                <div
                  key={step.sequence}
                  className="flex items-center gap-2 text-[10px] bg-bg-deep rounded px-2 py-1"
                >
                  <span className="text-slate-600 w-6">{step.sequence}</span>
                  <StatusBadge
                    label={step.status}
                    color={
                      step.status === 'completed'
                        ? 'green'
                        : step.status === 'failed'
                          ? 'red'
                          : 'yellow'
                    }
                  />
                  <span className="text-slate-300">{step.toolName ?? step.type}</span>
                  {step.agentName && <span className="text-slate-600">({step.agentName})</span>}
                  {step.durationMs != null && (
                    <span className="text-slate-600 ml-auto">
                      {(step.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        </>
      )}
    </div>
  )
}
