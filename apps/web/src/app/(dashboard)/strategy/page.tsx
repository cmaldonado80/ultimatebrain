'use client'

/**
 * Strategic Goal Cascade — OKR hierarchy with key results, progress
 * tracking, alignment visibility, and goal creation.
 */

import { useState } from 'react'

import { LoadingState } from '../../../components/ui/loading-state'
import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatCard } from '../../../components/ui/stat-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

function currentQuarter(): string {
  const now = new Date()
  const q = Math.ceil((now.getMonth() + 1) / 3)
  return `${now.getFullYear()}-Q${q}`
}

function progressColor(p: number): 'green' | 'yellow' | 'red' | 'blue' {
  if (p >= 1) return 'blue'
  if (p >= 0.7) return 'green'
  if (p >= 0.4) return 'yellow'
  return 'red'
}

function progressLabel(p: number): string {
  if (p >= 1) return 'achieved'
  if (p >= 0.7) return 'on track'
  if (p >= 0.4) return 'at risk'
  return 'behind'
}

export default function StrategyPage() {
  const [quarter] = useState(currentQuarter())
  const cascadeQuery = trpc.orchestration.goalCascade.useQuery({ quarter })
  const alignmentsQuery = trpc.orchestration.goalAlignments.useQuery({ limit: 10 })
  const utils = trpc.useUtils()

  // Create OKR form
  const [newObjective, setNewObjective] = useState('')
  const [newOwner, setNewOwner] = useState('corporation')

  // Add KR form
  const [krOkrId, setKrOkrId] = useState('')
  const [krDesc, setKrDesc] = useState('')
  const [krMetric, setKrMetric] = useState('')
  const [krTarget, setKrTarget] = useState('100')
  const [krUnit, setKrUnit] = useState('%')

  const createOkrMut = trpc.orchestration.createOkr.useMutation({
    onSuccess: () => {
      utils.orchestration.goalCascade.invalidate()
      setNewObjective('')
    },
  })
  const addKrMut = trpc.orchestration.addKeyResult.useMutation({
    onSuccess: () => {
      utils.orchestration.goalCascade.invalidate()
      setKrOkrId('')
      setKrDesc('')
      setKrMetric('')
      setKrTarget('100')
    },
  })
  const updateProgressMut = trpc.orchestration.updateKeyResultProgress.useMutation({
    onSuccess: () => utils.orchestration.goalCascade.invalidate(),
  })
  const updateStatusMut = trpc.orchestration.updateOkrStatus.useMutation({
    onSuccess: () => utils.orchestration.goalCascade.invalidate(),
  })

  if (cascadeQuery.isLoading) return <LoadingState message="Loading Strategy..." />

  const okrList = (cascadeQuery.data ?? []) as Array<{
    id: string
    objective: string
    quarter: string
    owner: string
    status: string
    alignmentCount: number
    progress: number
    keyResults: Array<{
      id: string
      description: string
      metric: string
      target: number
      current: number
      unit: string
      weight: number
    }>
  }>

  const alignments = (alignmentsQuery.data ?? []) as Array<{
    id: string
    taskTitle: string
    contribution: string
    okrId: string | null
    createdAt: Date
  }>

  const totalOkrs = okrList.length
  const achieved = okrList.filter((o) => o.status === 'achieved' || o.progress >= 1).length
  const atRisk = okrList.filter((o) => o.progress < 0.4 && o.status === 'active').length
  const avgProgress =
    totalOkrs > 0 ? Math.round((okrList.reduce((a, o) => a + o.progress, 0) / totalOkrs) * 100) : 0

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Strategic Goal Cascade"
        subtitle={`OKR hierarchy for ${quarter} — objectives, key results, and task alignment`}
        count={totalOkrs}
      />

      {/* Stats */}
      <PageGrid cols="4" className="mb-6">
        <StatCard label="OKRs" value={totalOkrs} color="blue" sub={quarter} />
        <StatCard label="Achieved" value={achieved} color="green" sub="objectives met" />
        <StatCard
          label="At Risk"
          value={atRisk}
          color={atRisk > 0 ? 'red' : 'green'}
          sub="below 40%"
        />
        <StatCard
          label="Avg Progress"
          value={`${avgProgress}%`}
          color={progressColor(avgProgress / 100)}
          sub="across all OKRs"
        />
      </PageGrid>

      {/* Create OKR */}
      <SectionCard title="Create OKR" className="mb-6">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-[10px] text-slate-500 block mb-1">Objective</label>
            <input
              className="cyber-input cyber-input-sm w-full"
              placeholder="e.g. Increase autonomous task completion rate"
              value={newObjective}
              onChange={(e) => setNewObjective(e.target.value)}
            />
          </div>
          <div className="w-40">
            <label className="text-[10px] text-slate-500 block mb-1">Owner</label>
            <input
              className="cyber-input cyber-input-sm w-full"
              placeholder="corporation"
              value={newOwner}
              onChange={(e) => setNewOwner(e.target.value)}
            />
          </div>
          <button
            className="cyber-btn-primary cyber-btn-sm flex-shrink-0"
            disabled={!newObjective.trim() || createOkrMut.isPending}
            onClick={() =>
              createOkrMut.mutate({
                objective: newObjective,
                quarter,
                owner: newOwner || 'corporation',
              })
            }
          >
            {createOkrMut.isPending ? 'Creating...' : 'Create OKR'}
          </button>
        </div>
      </SectionCard>

      {/* OKR Tree */}
      {okrList.length === 0 ? (
        <SectionCard title="OKRs">
          <div className="text-xs text-slate-600 py-6 text-center">
            No OKRs for {quarter}. Create one above to get started.
          </div>
        </SectionCard>
      ) : (
        <div className="space-y-4 mb-6">
          {okrList.map((okr) => {
            const pct = Math.round(okr.progress * 100)
            return (
              <SectionCard key={okr.id} title="">
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge
                        label={okr.status === 'active' ? progressLabel(okr.progress) : okr.status}
                        color={
                          okr.status === 'achieved'
                            ? 'blue'
                            : okr.status === 'cancelled'
                              ? 'red'
                              : progressColor(okr.progress)
                        }
                      />
                      <span className="text-xs text-slate-400 font-mono">{okr.owner}</span>
                    </div>
                    <div className="text-sm text-slate-100 font-medium">{okr.objective}</div>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex-1 h-2 bg-bg-elevated rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            pct >= 100
                              ? 'bg-neon-blue'
                              : pct >= 70
                                ? 'bg-neon-green'
                                : pct >= 40
                                  ? 'bg-neon-yellow'
                                  : 'bg-neon-red'
                          }`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-slate-300 w-10 text-right">
                        {pct}%
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {okr.status === 'active' && (
                      <>
                        <button
                          className="cyber-btn-primary cyber-btn-xs"
                          onClick={() => updateStatusMut.mutate({ id: okr.id, status: 'achieved' })}
                          disabled={updateStatusMut.isPending}
                        >
                          Mark Done
                        </button>
                        <button
                          className="cyber-btn-secondary cyber-btn-xs"
                          onClick={() => setKrOkrId(krOkrId === okr.id ? '' : okr.id)}
                        >
                          + KR
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Key Results */}
                {okr.keyResults.length > 0 && (
                  <div className="space-y-1.5 ml-4 border-l border-border pl-3">
                    {okr.keyResults.map((kr) => {
                      const krPct = kr.target > 0 ? Math.round((kr.current / kr.target) * 100) : 0
                      return (
                        <div
                          key={kr.id}
                          className="flex items-center gap-3 bg-bg-deep rounded px-3 py-2 border border-border-dim"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] text-slate-200">{kr.description}</div>
                            <div className="text-[10px] text-slate-500">
                              {kr.current} / {kr.target} {kr.unit} &middot; {kr.metric}
                            </div>
                          </div>
                          <div className="w-20 h-1.5 bg-bg-elevated rounded-full overflow-hidden flex-shrink-0">
                            <div
                              className={`h-full rounded-full ${
                                krPct >= 100
                                  ? 'bg-neon-blue'
                                  : krPct >= 70
                                    ? 'bg-neon-green'
                                    : krPct >= 40
                                      ? 'bg-neon-yellow'
                                      : 'bg-neon-red'
                              }`}
                              style={{ width: `${Math.min(krPct, 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 w-10 text-right">
                            {krPct}%
                          </span>
                          <input
                            type="number"
                            className="cyber-input cyber-input-sm w-16 text-center"
                            defaultValue={kr.current}
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value)
                              if (!isNaN(val) && val !== kr.current) {
                                updateProgressMut.mutate({ id: kr.id, current: val })
                              }
                            }}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Alignment count */}
                {okr.alignmentCount > 0 && (
                  <div className="text-[10px] text-slate-500 mt-2 ml-4">
                    {okr.alignmentCount} task{okr.alignmentCount !== 1 ? 's' : ''} aligned
                  </div>
                )}

                {/* Add KR form (inline) */}
                {krOkrId === okr.id && (
                  <div className="mt-3 ml-4 p-3 bg-bg-elevated rounded border border-border">
                    <div className="flex gap-2 items-end flex-wrap">
                      <div className="flex-1 min-w-40">
                        <label className="text-[10px] text-slate-500 block mb-1">Key Result</label>
                        <input
                          className="cyber-input cyber-input-sm w-full"
                          placeholder="e.g. Reduce task failure rate"
                          value={krDesc}
                          onChange={(e) => setKrDesc(e.target.value)}
                        />
                      </div>
                      <div className="w-32">
                        <label className="text-[10px] text-slate-500 block mb-1">Metric</label>
                        <input
                          className="cyber-input cyber-input-sm w-full"
                          placeholder="failure_rate"
                          value={krMetric}
                          onChange={(e) => setKrMetric(e.target.value)}
                        />
                      </div>
                      <div className="w-20">
                        <label className="text-[10px] text-slate-500 block mb-1">Target</label>
                        <input
                          className="cyber-input cyber-input-sm w-full"
                          type="number"
                          value={krTarget}
                          onChange={(e) => setKrTarget(e.target.value)}
                        />
                      </div>
                      <div className="w-16">
                        <label className="text-[10px] text-slate-500 block mb-1">Unit</label>
                        <input
                          className="cyber-input cyber-input-sm w-full"
                          value={krUnit}
                          onChange={(e) => setKrUnit(e.target.value)}
                        />
                      </div>
                      <button
                        className="cyber-btn-primary cyber-btn-sm flex-shrink-0"
                        disabled={!krDesc.trim() || !krMetric.trim() || addKrMut.isPending}
                        onClick={() =>
                          addKrMut.mutate({
                            okrId: okr.id,
                            description: krDesc,
                            metric: krMetric,
                            target: parseFloat(krTarget) || 100,
                            unit: krUnit || '%',
                          })
                        }
                      >
                        {addKrMut.isPending ? 'Adding...' : 'Add KR'}
                      </button>
                    </div>
                  </div>
                )}
              </SectionCard>
            )
          })}
        </div>
      )}

      {/* Recent Alignments */}
      <SectionCard title="Recent Task Alignments">
        {alignments.length === 0 ? (
          <div className="text-xs text-slate-600 py-6 text-center">
            No task alignments recorded yet. Tasks are aligned to OKRs when agents complete work.
          </div>
        ) : (
          <div className="space-y-1.5">
            {alignments.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 bg-bg-deep rounded px-3 py-2 border border-border-dim"
              >
                <span className="neon-dot neon-dot-green" />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-slate-200 truncate">{a.taskTitle}</div>
                  <div className="text-[10px] text-slate-500 truncate">{a.contribution}</div>
                </div>
                <span className="text-[10px] text-slate-600">
                  {new Date(a.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
