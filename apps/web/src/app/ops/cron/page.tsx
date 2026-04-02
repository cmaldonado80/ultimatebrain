'use client'

/**
 * Cron Jobs — manage scheduled background tasks.
 * Create, pause, resume, and monitor cron jobs with cron expression scheduling.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { trpc } from '../../../utils/trpc'

const STATUS_CLASS: Record<string, string> = {
  active: 'text-neon-green',
  paused: 'text-neon-yellow',
  failed: 'text-neon-red',
}

const SCHEDULE_PRESETS = [
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Weekly (Sunday midnight)', value: '0 0 * * 0' },
]

export default function CronJobsPage() {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [schedule, setSchedule] = useState('*/15 * * * *')
  const [task, setTask] = useState('')
  const [type, setType] = useState('')

  const { data: jobs, isLoading, error, refetch } = trpc.orchestration.cronJobs.useQuery()
  const utils = trpc.useUtils()

  const createMut = trpc.orchestration.createCronJob.useMutation({
    onSuccess: () => {
      utils.orchestration.cronJobs.invalidate()
      setShowForm(false)
      setName('')
      setSchedule('*/15 * * * *')
      setTask('')
      setType('')
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

  if (error) return <DbErrorBanner error={error} onRetry={() => refetch()} />
  if (isLoading) return <LoadingState message="Loading cron jobs..." />

  const allJobs = (jobs ?? []) as Array<{
    id: string
    name: string
    schedule: string
    type: string | null
    task: string | null
    status: string
    enabled: boolean
    lastRun: Date | null
    nextRun: Date | null
    lastResult: string | null
    runs: number
    fails: number
    failCount: number
    workspaceId: string | null
    agentId: string | null
    createdAt: Date
  }>

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Cron Jobs"
        count={allJobs.length}
        actions={
          <button className="cyber-btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ New Job'}
          </button>
        }
      />

      {showForm && (
        <div className="cyber-card p-4 mb-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[11px] text-slate-500 uppercase mb-1 block">Name</label>
              <input
                className="cyber-input w-full"
                placeholder="e.g. Daily health check"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 uppercase mb-1 block">Type</label>
              <input
                className="cyber-input w-full"
                placeholder="e.g. health, task, report"
                value={type}
                onChange={(e) => setType(e.target.value)}
              />
            </div>
          </div>
          <div className="mb-3">
            <label className="text-[11px] text-slate-500 uppercase mb-1 block">
              Schedule (cron expression)
            </label>
            <div className="flex gap-2 items-center">
              <input
                className="cyber-input flex-1"
                placeholder="*/15 * * * *"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
              />
              <select
                className="cyber-select text-xs"
                value=""
                onChange={(e) => {
                  if (e.target.value) setSchedule(e.target.value)
                }}
              >
                <option value="">Presets...</option>
                {SCHEDULE_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="text-[11px] text-slate-500 uppercase mb-1 block">
              Task description
            </label>
            <textarea
              className="cyber-input w-full resize-y"
              rows={2}
              placeholder="What should the agent do when this job runs?"
              value={task}
              onChange={(e) => setTask(e.target.value)}
            />
          </div>
          <button
            className="cyber-btn-primary"
            disabled={!name || !schedule || createMut.isPending}
            onClick={() =>
              createMut.mutate({ name, schedule, type: type || undefined, task: task || undefined })
            }
          >
            {createMut.isPending ? 'Creating...' : 'Create Job'}
          </button>
          {createMut.error && (
            <span className="text-neon-red text-xs ml-3">{createMut.error.message}</span>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total Jobs', value: allJobs.length, color: 'text-neon-blue' },
          {
            label: 'Active',
            value: allJobs.filter((j) => j.status === 'active').length,
            color: 'text-neon-green',
          },
          {
            label: 'Paused',
            value: allJobs.filter((j) => j.status === 'paused').length,
            color: 'text-neon-yellow',
          },
          {
            label: 'Failed',
            value: allJobs.filter((j) => j.status === 'failed').length,
            color: 'text-neon-red',
          },
        ].map((s) => (
          <div key={s.label} className="cyber-card p-3 text-center">
            <div className={`text-xl font-bold font-orbitron ${s.color}`}>{s.value}</div>
            <div className="text-[11px] text-slate-500 uppercase">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Job List */}
      {allJobs.length === 0 ? (
        <div className="text-center text-slate-500 py-10 text-sm">
          No cron jobs configured. Create one to get started.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {allJobs.map((job) => (
            <div key={job.id} className="cyber-card p-4">
              <div className="flex items-center gap-3 mb-2">
                <span
                  className={`text-[10px] font-bold uppercase ${STATUS_CLASS[job.status] ?? 'text-slate-500'}`}
                >
                  {job.status}
                </span>
                <span className="text-[14px] font-bold font-orbitron flex-1">{job.name}</span>
                {job.type && <span className="cyber-badge text-neon-blue">{job.type}</span>}
                <div className="flex gap-1.5">
                  {job.status === 'active' ? (
                    <button
                      className="cyber-btn-secondary cyber-btn-xs"
                      onClick={() => pauseMut.mutate({ id: job.id })}
                    >
                      Pause
                    </button>
                  ) : (
                    <button
                      className="cyber-btn-secondary cyber-btn-xs"
                      onClick={() => resumeMut.mutate({ id: job.id })}
                    >
                      Resume
                    </button>
                  )}
                  <button
                    className="cyber-btn-danger cyber-btn-xs"
                    onClick={() => deleteMut.mutate({ id: job.id })}
                  >
                    Del
                  </button>
                </div>
              </div>
              {job.task && (
                <div className="text-xs text-slate-400 mb-2 line-clamp-1">{job.task}</div>
              )}
              <div className="flex gap-4 text-[11px] text-slate-500 font-mono flex-wrap">
                <span title="Cron schedule">{job.schedule}</span>
                <span>
                  Runs: <span className="text-neon-green">{job.runs}</span>
                </span>
                <span>
                  Fails:{' '}
                  <span className={job.fails > 0 ? 'text-neon-red' : 'text-slate-600'}>
                    {job.fails}
                  </span>
                </span>
                {job.lastRun && <span>Last: {new Date(job.lastRun).toLocaleString()}</span>}
                {job.nextRun && <span>Next: {new Date(job.nextRun).toLocaleString()}</span>}
              </div>
              {job.lastResult && (
                <div
                  className={`mt-1.5 text-[10px] font-mono truncate ${job.lastResult.startsWith('FAILED') ? 'text-neon-red' : 'text-slate-500'}`}
                >
                  {job.lastResult}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
