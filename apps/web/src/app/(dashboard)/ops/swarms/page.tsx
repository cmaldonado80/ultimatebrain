'use client'

/**
 * Swarm Operations — ephemeral team visibility with live swarm tracking
 * and manual formation controls.
 */

import { useState } from 'react'

import { LoadingState } from '../../../../components/ui/loading-state'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

const REFRESH = 10_000

const ROLE_COLOR: Record<string, string> = {
  lead: 'blue',
  worker: 'green',
  reviewer: 'yellow',
  specialist: 'purple',
}

export default function SwarmsPage() {
  const activeSwarmsQuery = trpc.orchestration.activeSwarms.useQuery(undefined, {
    refetchInterval: REFRESH,
  })
  const utils = trpc.useUtils()

  const [formTask, setFormTask] = useState('')
  const [formSkills, setFormSkills] = useState('')
  const formMut = trpc.orchestration.formSwarm.useMutation({
    onSuccess: () => {
      utils.orchestration.activeSwarms.invalidate()
      setFormTask('')
      setFormSkills('')
    },
  })
  const completeMut = trpc.orchestration.completeSwarm.useMutation({
    onSuccess: () => utils.orchestration.activeSwarms.invalidate(),
  })
  const disbandMut = trpc.orchestration.disbandSwarm.useMutation({
    onSuccess: () => utils.orchestration.activeSwarms.invalidate(),
  })

  if (activeSwarmsQuery.isLoading) return <LoadingState message="Loading Swarm Operations..." />

  const swarms = (activeSwarmsQuery.data ?? []) as Array<{
    id: string
    task: string
    status: string
    members: Array<{ agentId: string; role: string; agentName: string }>
    createdAt: Date
  }>

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Swarm Operations"
        subtitle="Ephemeral agent teams — dynamic formation for complex tasks"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Active Swarms"
          value={swarms.length}
          color="blue"
          sub="currently running"
        />
        <StatCard
          label="Total Agents"
          value={swarms.reduce((a, s) => a + s.members.length, 0)}
          color="green"
          sub="in swarms"
        />
        <StatCard
          label="Leads"
          value={swarms.filter((s) => s.members.some((m) => m.role === 'lead')).length}
          color="purple"
          sub="team leads"
        />
        <StatCard
          label="Reviewers"
          value={swarms.reduce(
            (a, s) => a + s.members.filter((m) => m.role === 'reviewer').length,
            0,
          )}
          color="yellow"
          sub="quality gates"
        />
      </div>

      {/* Form Swarm */}
      <SectionCard title="Form New Swarm" className="mb-6">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-[10px] text-slate-500 block mb-1">Task Description</label>
            <input
              className="cyber-input cyber-input-sm w-full"
              placeholder="Describe the complex task..."
              value={formTask}
              onChange={(e) => setFormTask(e.target.value)}
            />
          </div>
          <div className="w-48">
            <label className="text-[10px] text-slate-500 block mb-1">Required Skills</label>
            <input
              className="cyber-input cyber-input-sm w-full"
              placeholder="skill1, skill2"
              value={formSkills}
              onChange={(e) => setFormSkills(e.target.value)}
            />
          </div>
          <button
            className="cyber-btn-primary cyber-btn-sm flex-shrink-0"
            disabled={!formTask.trim() || formMut.isPending}
            onClick={() =>
              formMut.mutate({
                task: formTask,
                requiredSkills: formSkills
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          >
            {formMut.isPending ? 'Forming...' : 'Form Swarm'}
          </button>
        </div>
      </SectionCard>

      {/* Active Swarms */}
      <SectionCard title={`Active Swarms (${swarms.length})`}>
        {swarms.length === 0 ? (
          <div className="text-xs text-slate-600 py-6 text-center">
            No active swarms. Form a new team above or wait for automatic swarm formation.
          </div>
        ) : (
          <div className="space-y-3">
            {swarms.map((s) => (
              <div key={s.id} className="bg-bg-deep rounded p-3 border border-border-dim">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-200 truncate">{s.task}</div>
                    <div className="text-[10px] text-slate-500">
                      Formed {new Date(s.createdAt).toLocaleString()} | {s.members.length} members
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <StatusBadge
                      label={s.status}
                      color={
                        s.status === 'active'
                          ? 'green'
                          : s.status === 'completed'
                            ? 'blue'
                            : 'slate'
                      }
                    />
                    <button
                      className="cyber-btn-primary cyber-btn-xs"
                      onClick={() => completeMut.mutate({ id: s.id })}
                      disabled={completeMut.isPending}
                    >
                      Complete
                    </button>
                    <button
                      className="cyber-btn-secondary cyber-btn-xs"
                      onClick={() => disbandMut.mutate({ id: s.id })}
                      disabled={disbandMut.isPending}
                    >
                      Disband
                    </button>
                  </div>
                </div>

                {/* Members */}
                <div className="flex flex-wrap gap-2">
                  {s.members.map((m) => (
                    <div
                      key={m.agentId}
                      className="flex items-center gap-1.5 bg-bg-elevated rounded px-2 py-1 border border-border"
                    >
                      <StatusBadge
                        label={m.role}
                        color={
                          (ROLE_COLOR[m.role] ?? 'slate') as
                            | 'blue'
                            | 'green'
                            | 'yellow'
                            | 'purple'
                            | 'slate'
                        }
                      />
                      <span className="text-[11px] text-slate-300">{m.agentName}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
