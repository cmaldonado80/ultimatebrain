'use client'

/**
 * Task Runner — execution mode detection, routing, and deep work planning.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { trpc } from '../../../utils/trpc'

interface PlanStep {
  index: number
  title: string
  description: string
  estimatedMs?: number
  toolsRequired?: string[]
  status: 'pending' | 'in_progress' | 'done' | 'skipped'
}

const MODE_INFO: Record<string, { color: string; label: string; desc: string }> = {
  quick: {
    color: 'text-neon-green',
    label: 'Quick',
    desc: 'Simple task — single-shot execution with minimal planning',
  },
  autonomous: {
    color: 'text-neon-blue',
    label: 'Autonomous',
    desc: 'Medium complexity — agent works independently with tool access',
  },
  deep_work: {
    color: 'text-neon-purple',
    label: 'Deep Work',
    desc: 'Complex task — generates a multi-step plan requiring approval before execution',
  },
}

export default function TaskRunnerPage() {
  const [ticketId, setTicketId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [detectedMode, setDetectedMode] = useState<string | null>(null)
  const [plan, setPlan] = useState<PlanStep[] | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const detectQuery = trpc.taskRunner.detectMode.useQuery(
    { ticketId: ticketId.trim() },
    {
      enabled: false,
      retry: false,
    },
  )

  const routeMut = trpc.taskRunner.route.useMutation({
    onSuccess: (data) => setResult(JSON.stringify(data, null, 2)),
  })

  const deepWorkMut = trpc.taskRunner.startDeepWork.useMutation({
    onSuccess: (data) => {
      const d = data as { steps?: PlanStep[] }
      if (d.steps) setPlan(d.steps)
    },
  })

  const execDeepMut = trpc.taskRunner.executeDeepWork.useMutation({
    onSuccess: (data) => setResult(JSON.stringify(data, null, 2)),
  })

  // Sync detected mode from query
  if (detectQuery.data && !detectedMode) {
    const d = detectQuery.data as { mode: string }
    setDetectedMode(d.mode)
  }

  const error = detectQuery.error || routeMut.error || deepWorkMut.error || execDeepMut.error

  const modeInfo = detectedMode ? MODE_INFO[detectedMode] : null

  return (
    <div className="p-6 text-slate-50">
      <div className="mb-5">
        <h2 className="m-0 text-[22px] font-bold font-orbitron">Task Runner</h2>
        <p className="mt-1 mb-0 text-xs text-slate-500">
          Detect execution mode, route tickets to the right pipeline, and manage deep work plans.
        </p>
      </div>

      {error && (
        <div className="mb-4">
          <DbErrorBanner error={error} />
        </div>
      )}

      {/* Input */}
      <div className="cyber-card p-4 mb-4">
        <div className="flex gap-2 mb-2">
          <input
            className="cyber-input flex-1"
            placeholder="Ticket ID (UUID)..."
            value={ticketId}
            onChange={(e) => setTicketId(e.target.value)}
          />
          <button
            className="cyber-btn-primary flex-shrink-0"
            onClick={() => {
              if (ticketId.trim()) {
                setDetectedMode(null)
                detectQuery.refetch()
              }
            }}
            disabled={detectQuery.isFetching || !ticketId.trim()}
          >
            {detectQuery.isFetching ? 'Detecting...' : 'Detect Mode'}
          </button>
        </div>
        <textarea
          className="cyber-input w-full resize-y min-h-[60px]"
          placeholder="Prompt / instructions (optional, used for routing)..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
        />
      </div>

      {/* Detected Mode */}
      {detectedMode && modeInfo && (
        <div className="cyber-card p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-xs text-slate-500 uppercase tracking-wide">Detected Mode</span>
              <div className={`text-xl font-bold font-orbitron ${modeInfo.color}`}>
                {modeInfo.label}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{modeInfo.desc}</div>
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            <button
              className="cyber-btn-primary"
              onClick={() =>
                routeMut.mutate({
                  ticketId: ticketId.trim(),
                  prompt: prompt.trim() || 'Execute this ticket',
                })
              }
              disabled={routeMut.isPending}
            >
              {routeMut.isPending ? 'Routing...' : 'Route (Auto)'}
            </button>

            {detectedMode === 'deep_work' && (
              <button
                className="cyber-btn-secondary"
                onClick={() => deepWorkMut.mutate({ ticketId: ticketId.trim() })}
                disabled={deepWorkMut.isPending}
              >
                {deepWorkMut.isPending ? 'Planning...' : 'Generate Plan'}
              </button>
            )}

            {['quick', 'autonomous', 'deep_work'].map((mode) => (
              <button
                key={mode}
                className="cyber-btn-secondary cyber-btn-sm"
                onClick={() =>
                  routeMut.mutate({
                    ticketId: ticketId.trim(),
                    prompt: prompt.trim() || 'Execute this ticket',
                    forceMode: mode as 'quick' | 'autonomous' | 'deep_work',
                  })
                }
                disabled={routeMut.isPending}
              >
                Force {mode.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Deep Work Plan */}
      {plan && plan.length > 0 && (
        <div className="cyber-card p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-orbitron text-white">
              Execution Plan ({plan.length} steps)
            </h3>
            <button
              className="cyber-btn-primary"
              onClick={() =>
                execDeepMut.mutate({
                  ticketId: ticketId.trim(),
                  plan: {
                    ticketId: ticketId.trim(),
                    steps: plan,
                    totalEstimatedMs: plan.reduce((acc, s) => acc + (s.estimatedMs ?? 0), 0),
                    generatedAt: new Date(),
                    approvedAt: new Date(),
                  },
                })
              }
              disabled={execDeepMut.isPending}
            >
              {execDeepMut.isPending ? 'Executing...' : 'Approve & Execute'}
            </button>
          </div>
          <div className="space-y-2">
            {plan.map((step) => (
              <div
                key={step.index}
                className="flex items-start gap-3 py-2 border-b border-border-dim last:border-0"
              >
                <span
                  className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    step.status === 'done'
                      ? 'bg-neon-green/20 text-neon-green'
                      : step.status === 'in_progress'
                        ? 'bg-neon-blue/20 text-neon-blue'
                        : 'bg-white/5 text-slate-500'
                  }`}
                >
                  {step.index + 1}
                </span>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-white">{step.title}</div>
                  <div className="text-[11px] text-slate-400">{step.description}</div>
                  {step.toolsRequired && step.toolsRequired.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {step.toolsRequired.map((t) => (
                        <span key={t} className="cyber-badge text-[8px]">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {step.estimatedMs && (
                  <span className="text-[10px] text-slate-600 font-mono">
                    ~{Math.round(step.estimatedMs / 1000)}s
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="cyber-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-orbitron text-neon-green">Result</h3>
            <button
              className="text-[10px] text-slate-500 hover:text-slate-300"
              onClick={() => setResult(null)}
            >
              Dismiss
            </button>
          </div>
          <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap bg-bg-deep rounded-md p-3 max-h-[300px] overflow-y-auto">
            {result}
          </pre>
        </div>
      )}
    </div>
  )
}
