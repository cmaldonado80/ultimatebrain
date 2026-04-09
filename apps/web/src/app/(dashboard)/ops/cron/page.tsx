'use client'

/**
 * Cron Observatory — unified view of system + custom cron jobs with
 * real-time status, execution history, pause/resume controls, and
 * manual job creation.
 */

import { useState } from 'react'

import { LoadingState } from '../../../../components/ui/loading-state'
import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

const REFRESH = 15_000

/** All 18 system jobs from the worker process (apps/worker/src/index.ts) */
const SYSTEM_JOBS = [
  {
    name: 'market:sweep',
    schedule: '*/5 * * * *',
    desc: 'Expire stale work market listings',
    category: 'Orchestration',
  },
  {
    name: 'healing:cycle',
    schedule: '*/10 * * * *',
    desc: 'Self-healing OODA cortex cycle',
    category: 'Healing',
  },
  {
    name: 'tools:flush',
    schedule: '*/10 * * * *',
    desc: 'Persist in-memory tool analytics to DB',
    category: 'Platform',
  },
  {
    name: 'healing:code-repair',
    schedule: '*/30 * * * *',
    desc: 'Detect recurring errors → create repair tickets',
    category: 'Healing',
  },
  {
    name: 'a2a:expire',
    schedule: '0 */6 * * *',
    desc: 'Fail stale A2A delegations older than 24h',
    category: 'Platform',
  },
  {
    name: 'instinct:pipeline',
    schedule: '0 2 * * *',
    desc: 'Observe → Detect → Promote instinct patterns',
    category: 'Intelligence',
  },
  {
    name: 'instinct:evolve',
    schedule: '0 3 * * 0',
    desc: 'Evolve mature instincts into Skills weekly',
    category: 'Intelligence',
  },
  {
    name: 'intelligence:causal-analysis',
    schedule: '0 3 * * 0',
    desc: 'Weekly causal graph impact analysis',
    category: 'Intelligence',
  },
  {
    name: 'evolution:validate',
    schedule: '0 4 * * *',
    desc: 'Validate pending soul mutations, auto-rollback harmful',
    category: 'Intelligence',
  },
  {
    name: 'intelligence:meta-learning',
    schedule: '0 4 * * 0',
    desc: 'Weekly pathway effectiveness meta-analysis',
    category: 'Intelligence',
  },
  {
    name: 'codebase:review',
    schedule: '0 5 * * 1',
    desc: 'Automated code review ticket generation',
    category: 'Platform',
  },
  {
    name: 'intelligence:daily-briefing',
    schedule: '0 8 * * *',
    desc: 'Generate daily organizational briefing',
    category: 'Intelligence',
  },
  {
    name: 'healing:stress-test',
    schedule: '0 23 * * 0',
    desc: 'Weekly chaos engineering scenario',
    category: 'Healing',
  },
  {
    name: 'org:optimize',
    schedule: '0 2 1 * *',
    desc: 'Monthly workforce restructuring proposals',
    category: 'Orchestration',
  },
]

const CATEGORY_COLORS: Record<string, 'red' | 'blue' | 'green' | 'purple' | 'yellow'> = {
  Healing: 'red',
  Intelligence: 'purple',
  Orchestration: 'blue',
  Platform: 'green',
}

function cronToHuman(cron: string): string {
  if (cron.startsWith('*/')) {
    const mins = cron.split(' ')[0]!.replace('*/', '')
    return `Every ${mins} min`
  }
  const parts = cron.trim().split(/\s+/)
  if (parts[4] === '0' && parts[2] === '*')
    return `Weekly Sun ${parts[1]}:${parts[0].padStart(2, '0')}`
  if (parts[4] === '1' && parts[2] === '*')
    return `Weekly Mon ${parts[1]}:${parts[0].padStart(2, '0')}`
  if (parts[1]?.startsWith('*/')) return `Every ${parts[1].replace('*/', '')}h`
  if (parts[2] !== '*' && parts[3] === '*')
    return `Monthly ${ordinal(parseInt(parts[2]!))} at ${parts[1]}:${parts[0].padStart(2, '0')}`
  if (parts[0] === '0' && parts[1] !== '*') return `Daily at ${parts[1]}:00 UTC`
  return cron
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function timeAgo(date: Date | string | null): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export default function CronObservatoryPage() {
  const cronQuery = trpc.orchestration.cronJobs.useQuery(undefined, {
    refetchInterval: REFRESH,
  })
  const utils = trpc.useUtils()

  const [newName, setNewName] = useState('')
  const [newSchedule, setNewSchedule] = useState('')
  const [newTask, setNewTask] = useState('')

  const createMut = trpc.orchestration.createCronJob.useMutation({
    onSuccess: () => {
      utils.orchestration.cronJobs.invalidate()
      setNewName('')
      setNewSchedule('')
      setNewTask('')
    },
  })
  const pauseMut = trpc.orchestration.pauseCronJob.useMutation({
    onSuccess: () => utils.orchestration.cronJobs.invalidate(),
  })
  const resumeMut = trpc.orchestration.resumeCronJob.useMutation({
    onSuccess: () => utils.orchestration.cronJobs.invalidate(),
  })
  const deleteMut = trpc.orchestration.deleteCronJob.useMutation({
    onSuccess: () => utils.orchestration.cronJobs.invalidate(),
  })

  if (cronQuery.isLoading) return <LoadingState message="Loading Cron Observatory..." />

  const dbJobs = (cronQuery.data ?? []) as Array<{
    id: string
    name: string
    schedule: string
    type: string | null
    task: string | null
    status: string
    enabled: boolean | null
    lastRun: Date | null
    nextRun: Date | null
    lastResult: string | null
    runs: number | null
    fails: number | null
    failCount: number | null
  }>

  const activeDbJobs = dbJobs.filter((j) => j.status === 'active')
  const failedDbJobs = dbJobs.filter((j) => j.status === 'failed')
  const pausedDbJobs = dbJobs.filter((j) => j.status === 'paused')
  const totalRuns = dbJobs.reduce((a, j) => a + (j.runs ?? 0), 0)
  const totalFails = dbJobs.reduce((a, j) => a + (j.fails ?? 0), 0)

  const categories = [...new Set(SYSTEM_JOBS.map((j) => j.category))]

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Cron Observatory"
        subtitle="System worker jobs and custom scheduled tasks — unified monitoring"
        count={SYSTEM_JOBS.length + dbJobs.length}
      />

      {/* Stats */}
      <PageGrid cols="4" className="mb-6">
        <StatCard
          label="System Jobs"
          value={SYSTEM_JOBS.length}
          color="blue"
          sub="worker-managed"
        />
        <StatCard
          label="Custom Jobs"
          value={dbJobs.length}
          color="green"
          sub={`${activeDbJobs.length} active`}
        />
        <StatCard
          label="Total Runs"
          value={totalRuns}
          color="purple"
          sub={`${totalFails} failures`}
        />
        <StatCard
          label="Failed"
          value={failedDbJobs.length}
          color={failedDbJobs.length > 0 ? 'red' : 'green'}
          sub={pausedDbJobs.length > 0 ? `${pausedDbJobs.length} paused` : 'all healthy'}
        />
      </PageGrid>

      {/* System Jobs */}
      {categories.map((cat) => {
        const jobs = SYSTEM_JOBS.filter((j) => j.category === cat)
        return (
          <SectionCard key={cat} title={`${cat} (System)`} className="mb-4">
            <div className="space-y-1.5">
              {jobs.map((job) => (
                <div
                  key={job.name}
                  className="flex items-center gap-3 bg-bg-deep rounded px-4 py-2.5 border border-border-dim"
                >
                  <StatusBadge label="system" color={CATEGORY_COLORS[cat] ?? 'blue'} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-200 font-medium font-mono">{job.name}</div>
                    <div className="text-[10px] text-slate-500">{job.desc}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[10px] text-neon-blue font-mono">
                      {cronToHuman(job.schedule)}
                    </div>
                    <div className="text-[9px] text-slate-600 font-mono">{job.schedule}</div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )
      })}

      {/* Custom DB Jobs */}
      <SectionCard title={`Custom Jobs (${dbJobs.length})`} className="mb-4">
        {dbJobs.length === 0 ? (
          <div className="text-xs text-slate-600 py-6 text-center">
            No custom cron jobs. Create one below or wait for system auto-creation.
          </div>
        ) : (
          <div className="space-y-1.5">
            {dbJobs.map((job) => {
              const isFailed = job.status === 'failed'
              const isPaused = job.status === 'paused'
              const lastFailed = job.lastResult?.startsWith('FAILED')
              return (
                <div
                  key={job.id}
                  className={`bg-bg-deep rounded px-4 py-2.5 border ${isFailed ? 'border-neon-red/30' : isPaused ? 'border-neon-yellow/20' : 'border-border-dim'}`}
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge
                      label={job.status}
                      color={isFailed ? 'red' : isPaused ? 'yellow' : 'green'}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-200 font-medium font-mono">{job.name}</div>
                      <div className="text-[10px] text-slate-500 flex gap-3">
                        <span>{cronToHuman(job.schedule)}</span>
                        <span>{job.runs ?? 0} runs</span>
                        {(job.fails ?? 0) > 0 && (
                          <span className="text-neon-red">{job.fails} fails</span>
                        )}
                        <span>Last: {timeAgo(job.lastRun)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {/* Last result indicator */}
                      {job.lastResult && (
                        <span
                          className={`text-[10px] font-mono truncate max-w-32 ${lastFailed ? 'text-neon-red' : 'text-neon-green'}`}
                          title={job.lastResult}
                        >
                          {lastFailed ? 'FAILED' : job.lastResult.slice(0, 20)}
                        </span>
                      )}
                      {/* Next run */}
                      {job.nextRun && (
                        <span className="text-[10px] text-slate-500">
                          Next: {timeAgo(job.nextRun)}
                        </span>
                      )}
                      {/* Controls */}
                      <div className="flex gap-1">
                        {job.status === 'active' ? (
                          <button
                            className="cyber-btn-secondary cyber-btn-xs"
                            onClick={() => pauseMut.mutate({ id: job.id })}
                            disabled={pauseMut.isPending}
                          >
                            Pause
                          </button>
                        ) : (
                          <button
                            className="cyber-btn-primary cyber-btn-xs"
                            onClick={() => resumeMut.mutate({ id: job.id })}
                            disabled={resumeMut.isPending}
                          >
                            Resume
                          </button>
                        )}
                        <button
                          className="cyber-btn-secondary cyber-btn-xs"
                          onClick={() => {
                            if (confirm(`Delete job "${job.name}"?`)) {
                              deleteMut.mutate({ id: job.id })
                            }
                          }}
                          disabled={deleteMut.isPending}
                        >
                          Del
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {/* Create Custom Job */}
      <SectionCard title="Create Custom Job">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="w-48">
            <label className="text-[10px] text-slate-500 block mb-1">Job Name</label>
            <input
              className="cyber-input cyber-input-sm w-full"
              placeholder="my-job:task"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div className="w-36">
            <label className="text-[10px] text-slate-500 block mb-1">Schedule (cron)</label>
            <input
              className="cyber-input cyber-input-sm w-full"
              placeholder="*/30 * * * *"
              value={newSchedule}
              onChange={(e) => setNewSchedule(e.target.value)}
            />
          </div>
          <div className="flex-1 min-w-48">
            <label className="text-[10px] text-slate-500 block mb-1">Task (optional)</label>
            <input
              className="cyber-input cyber-input-sm w-full"
              placeholder="Description or task payload..."
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
            />
          </div>
          <button
            className="cyber-btn-primary cyber-btn-sm flex-shrink-0"
            disabled={!newName.trim() || !newSchedule.trim() || createMut.isPending}
            onClick={() =>
              createMut.mutate({
                name: newName,
                schedule: newSchedule,
                task: newTask || undefined,
              })
            }
          >
            {createMut.isPending ? 'Creating...' : 'Create Job'}
          </button>
        </div>
        <div className="text-[10px] text-slate-600 mt-2">
          Cron format: minute hour day month weekday (e.g. &quot;*/10 * * * *&quot; = every 10 min,
          &quot;0 8 * * *&quot; = daily at 08:00, &quot;0 3 * * 0&quot; = weekly Sunday 03:00)
        </div>
      </SectionCard>
    </div>
  )
}
