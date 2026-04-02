'use client'

/**
 * Deployments — operator control plane for deployment workflows.
 * Shows workflow progress, manual step confirmation, and retry controls.
 */

import { useState } from 'react'

import { ActionBar } from '../../../components/ui/action-bar'
import { EmptyState } from '../../../components/ui/empty-state'
import { FilterPills } from '../../../components/ui/filter-pills'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { PermissionGate } from '../../../components/ui/permission-gate'
import { trpc } from '../../../utils/trpc'

interface WorkflowStep {
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  startedAt?: string
  completedAt?: string
  error?: string
  result?: Record<string, unknown>
  manual?: boolean
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-slate-500',
  running: 'text-neon-blue',
  completed: 'text-neon-green',
  failed: 'text-neon-red',
  cancelled: 'text-slate-600',
}

const STEP_DOT_COLORS: Record<string, string> = {
  pending: 'bg-slate-600',
  running: 'bg-neon-blue animate-pulse',
  completed: 'bg-neon-green',
  failed: 'bg-neon-red',
  skipped: 'bg-slate-700',
}

const STEP_LABELS: Record<string, string> = {
  provision_db: 'Provision DB',
  configure: 'Configure',
  deploy_mini_brain: 'Deploy Mini Brain',
  register_mini_brain: 'Register Mini Brain',
  verify_mini_brain: 'Verify Mini Brain',
  deploy_development: 'Deploy Dev App',
  register_development: 'Register Dev App',
  verify_development: 'Verify Dev App',
  activate: 'Activate',
}

export default function DeploymentsPage() {
  const [filter, setFilter] = useState<'all' | 'running' | 'failed' | 'completed'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [confirmData, setConfirmData] = useState<Record<string, string>>({})

  const workflowsQuery = trpc.deployments.list.useQuery({
    status:
      filter !== 'all'
        ? (filter as 'pending' | 'running' | 'completed' | 'failed' | 'cancelled')
        : undefined,
    limit: 50,
  })
  const utils = trpc.useUtils()

  const advanceMut = trpc.deployments.advance.useMutation({
    onSuccess: () => utils.deployments.list.invalidate(),
  })
  const confirmMut = trpc.deployments.confirmStep.useMutation({
    onSuccess: () => {
      utils.deployments.list.invalidate()
      setConfirmData({})
    },
  })
  const retryMut = trpc.deployments.retry.useMutation({
    onSuccess: () => utils.deployments.list.invalidate(),
  })
  const cancelMut = trpc.deployments.cancel.useMutation({
    onSuccess: () => utils.deployments.list.invalidate(),
  })

  const workflows = workflowsQuery.data ?? []

  const counts = {
    all: workflows.length,
    running: workflows.filter((w) => w.status === 'running').length,
    failed: workflows.filter((w) => w.status === 'failed').length,
    completed: workflows.filter((w) => w.status === 'completed').length,
  }

  return (
    <div className="p-6 text-slate-50">
      <PageHeader title="Deployments" count={counts.all} />

      <FilterPills
        options={['all', 'running', 'failed', 'completed'] as const}
        value={filter}
        onChange={setFilter}
        className="mb-4"
      />

      {workflowsQuery.isLoading && (
        <LoadingState message="Loading workflows..." fullHeight={false} />
      )}

      {workflows.length === 0 && !workflowsQuery.isLoading && (
        <EmptyState title="No deployment workflows found" />
      )}

      {/* Workflow cards */}
      <div className="flex flex-col gap-3">
        {workflows.map((wf) => {
          const steps = (wf.steps ?? []) as WorkflowStep[]
          const isExpanded = expandedId === wf.id
          const currentRunningStep = steps.find((s) => s.status === 'running')

          return (
            <div key={wf.id} className="cyber-card p-4">
              {/* Header row */}
              <div
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : wf.id)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[14px] font-bold font-orbitron">
                      {wf.entity?.name ?? 'Unknown'}
                    </span>
                    {wf.entity?.tier && (
                      <span className="cyber-badge text-[9px] text-neon-blue">
                        {wf.entity.tier}
                      </span>
                    )}
                    {wf.devEntity && (
                      <span className="cyber-badge text-[9px] text-neon-purple">
                        + {wf.devEntity.name}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {wf.currentStep ? (STEP_LABELS[wf.currentStep] ?? wf.currentStep) : 'Done'}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="flex items-center gap-1">
                  {steps.map((step, i) => (
                    <div
                      key={i}
                      className={`w-2.5 h-2.5 rounded-full ${STEP_DOT_COLORS[step.status] ?? 'bg-slate-700'}`}
                      title={`${STEP_LABELS[step.name] ?? step.name}: ${step.status}`}
                    />
                  ))}
                </div>

                <span className="text-[11px] font-mono text-slate-400">{wf.progress}%</span>

                <span className={`text-[11px] font-semibold uppercase ${STATUS_COLORS[wf.status]}`}>
                  {wf.status}
                </span>
              </div>

              {/* Error display */}
              {wf.status === 'failed' && wf.error && !isExpanded && (
                <div className="mt-2 text-[11px] text-neon-red bg-neon-red/5 rounded px-2.5 py-1.5 border border-neon-red/10">
                  {String(wf.error)}
                </div>
              )}

              {/* Expanded detail */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-border">
                  {/* Steps list */}
                  <div className="flex flex-col gap-1.5 mb-3">
                    {steps.map((step: WorkflowStep, i: number) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 bg-bg-elevated rounded px-2.5 py-1.5"
                      >
                        <div
                          className={`w-2 h-2 rounded-full shrink-0 ${STEP_DOT_COLORS[step.status] ?? ''}`}
                        />
                        <span className="text-[12px] text-slate-300 flex-1">
                          {STEP_LABELS[step.name] ?? String(step.name)}
                          {step.manual && (
                            <span className="ml-1 text-[9px] text-neon-yellow">(manual)</span>
                          )}
                        </span>
                        <span className={`text-[10px] ${STATUS_COLORS[step.status] ?? ''}`}>
                          {String(step.status)}
                        </span>
                        {step.startedAt && (
                          <span className="text-[10px] text-slate-600">
                            {new Date(String(step.startedAt)).toLocaleTimeString()}
                          </span>
                        )}

                        {/* Retry button for failed steps */}
                        {step.status === 'failed' && (
                          <button
                            className="text-[10px] text-neon-yellow hover:text-neon-yellow/80 font-medium"
                            onClick={(e) => {
                              e.stopPropagation()
                              retryMut.mutate({
                                workflowId: wf.id,
                                stepName: String(step.name),
                              })
                            }}
                            disabled={retryMut.isPending}
                          >
                            Retry
                          </button>
                        )}

                        {step.error && (
                          <span className="text-[10px] text-neon-red truncate max-w-[200px]">
                            {String(step.error)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Manual step confirmation form */}
                  {currentRunningStep?.manual && (
                    <div className="bg-neon-blue/5 border border-neon-blue/10 rounded p-3 mb-3">
                      <div className="text-[12px] font-semibold text-neon-blue mb-2">
                        Confirm: {STEP_LABELS[currentRunningStep.name] ?? currentRunningStep.name}
                      </div>

                      {(currentRunningStep.name === 'deploy_mini_brain' ||
                        currentRunningStep.name === 'deploy_development') && (
                        <div className="flex flex-col gap-1.5 mb-2">
                          <input
                            className="cyber-input text-[12px]"
                            placeholder="Deployment ref (e.g. fly deploy ID)"
                            value={confirmData.deploymentRef ?? ''}
                            onChange={(e) =>
                              setConfirmData((d) => ({ ...d, deploymentRef: e.target.value }))
                            }
                          />
                          <input
                            className="cyber-input text-[12px]"
                            placeholder="Provider (e.g. fly.io, vercel)"
                            value={confirmData.deploymentProvider ?? ''}
                            onChange={(e) =>
                              setConfirmData((d) => ({ ...d, deploymentProvider: e.target.value }))
                            }
                          />
                          <input
                            className="cyber-input text-[12px]"
                            placeholder="Version (e.g. 1.0.0 or git SHA)"
                            value={confirmData.version ?? ''}
                            onChange={(e) =>
                              setConfirmData((d) => ({ ...d, version: e.target.value }))
                            }
                          />
                        </div>
                      )}

                      {(currentRunningStep.name === 'register_mini_brain' ||
                        currentRunningStep.name === 'register_development') && (
                        <div className="flex flex-col gap-1.5 mb-2">
                          <input
                            className="cyber-input text-[12px]"
                            placeholder="Endpoint URL (e.g. https://solarc-astrology-brain.fly.dev)"
                            value={confirmData.endpoint ?? ''}
                            onChange={(e) =>
                              setConfirmData((d) => ({ ...d, endpoint: e.target.value }))
                            }
                          />
                          <input
                            className="cyber-input text-[12px]"
                            placeholder="Health endpoint (optional, defaults to /health)"
                            value={confirmData.healthEndpoint ?? ''}
                            onChange={(e) =>
                              setConfirmData((d) => ({ ...d, healthEndpoint: e.target.value }))
                            }
                          />
                        </div>
                      )}

                      <button
                        className="cyber-btn-primary text-[11px] px-3 py-1"
                        onClick={() =>
                          confirmMut.mutate({
                            workflowId: wf.id,
                            stepName: currentRunningStep.name,
                            ...confirmData,
                          })
                        }
                        disabled={confirmMut.isPending}
                      >
                        {confirmMut.isPending ? 'Confirming...' : 'Confirm Step'}
                      </button>
                    </div>
                  )}

                  {/* Config display */}
                  {wf.config != null && (
                    <details className="mb-3">
                      <summary className="text-[11px] text-slate-500 cursor-pointer hover:text-slate-300">
                        Configuration
                      </summary>
                      <pre className="mt-1.5 text-[10px] text-slate-400 bg-bg-elevated rounded p-2.5 overflow-x-auto font-mono leading-relaxed">
                        {JSON.stringify(wf.config, null, 2)}
                      </pre>
                    </details>
                  )}

                  {/* Actions — operator+ only */}
                  <PermissionGate require="operator">
                    <ActionBar>
                      {wf.status === 'running' && !currentRunningStep?.manual && (
                        <button
                          className="cyber-btn-secondary text-[11px] px-3 py-1"
                          onClick={() => advanceMut.mutate({ workflowId: wf.id })}
                          disabled={advanceMut.isPending}
                        >
                          Advance
                        </button>
                      )}
                      {(wf.status === 'running' || wf.status === 'pending') && (
                        <button
                          className="text-[11px] text-neon-red hover:text-neon-red/80 font-medium"
                          onClick={() => cancelMut.mutate({ workflowId: wf.id })}
                          disabled={cancelMut.isPending}
                        >
                          Cancel
                        </button>
                      )}
                      <div className="flex-1" />
                      <span className="text-[10px] text-slate-600 font-mono">
                        {wf.id.slice(0, 8)}
                      </span>
                      {wf.createdAt && (
                        <span className="text-[10px] text-slate-600">
                          {new Date(wf.createdAt).toLocaleString()}
                        </span>
                      )}
                    </ActionBar>
                  </PermissionGate>

                  {(confirmMut.error || retryMut.error || advanceMut.error) && (
                    <div className="mt-2 text-[11px] text-neon-red">
                      {confirmMut.error?.message ??
                        retryMut.error?.message ??
                        advanceMut.error?.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
