'use client'

/**
 * App Dashboard — list all connected agents / apps from the database
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { trpc } from '../../../utils/trpc'

interface DisplayApp {
  id: string
  name: string
  type: string
  description: string
  model: string
  status: 'running' | 'degraded' | 'offline'
  tags: string[]
  skills: string[]
  createdAt: Date
}

function StatusDot({ status }: { status: string }) {
  const dotClass =
    status === 'running'
      ? 'neon-dot neon-dot-green'
      : status === 'degraded'
        ? 'neon-dot neon-dot-yellow'
        : 'neon-dot neon-dot-red'
  return <span className={dotClass} />
}

function AppCard({ app }: { app: DisplayApp }) {
  return (
    <a href={`/apps/${app.id}`} className="cyber-card block no-underline text-inherit p-4">
      <div className="flex justify-between items-center mb-1.5">
        <div className="flex items-center gap-1.5">
          <StatusDot status={app.status} />
          <span className="text-[15px] font-bold font-orbitron">{app.name}</span>
          <span className="cyber-badge text-neon-blue">{app.type || 'Agent'}</span>
        </div>
      </div>
      <div className="text-xs text-slate-500 mb-2.5">{app.description || 'No description'}</div>
      <div className="flex gap-5 mb-2.5">
        <div className="flex flex-col items-center">
          <span className="text-base font-bold font-mono">{app.model || 'N/A'}</span>
          <span className="text-[10px] text-slate-500">Model</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-base font-bold font-mono">{app.skills.length}</span>
          <span className="text-[10px] text-slate-500">Skills</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-base font-bold font-mono">{app.tags.length}</span>
          <span className="text-[10px] text-slate-500">Tags</span>
        </div>
      </div>
      {app.tags.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {app.tags.map((t) => (
            <span
              key={t}
              className="text-[10px] bg-bg-elevated rounded px-1.5 py-0.5 text-slate-400"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </a>
  )
}

export default function AppsPage() {
  const [filter, setFilter] = useState<string>('all')
  const { data, isLoading, error } = trpc.agents.list.useQuery({ limit: 100, offset: 0 })

  if (error) {
    return (
      <div className="text-slate-50 p-6">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="text-slate-50 p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-500">
          <div className="text-2xl mb-2 font-orbitron">Loading...</div>
          <div className="text-[13px]">Fetching apps</div>
        </div>
      </div>
    )
  }

  const agents = (data as any[]) ?? []

  const apps: DisplayApp[] = agents.map((a: any) => ({
    id: a.id,
    name: a.name ?? `Agent ${a.id.slice(0, 8)}`,
    type: a.type ?? 'agent',
    description: a.description ?? '',
    model: a.model ?? '',
    status: (a.status === 'idle' ||
    a.status === 'planning' ||
    a.status === 'executing' ||
    a.status === 'reviewing'
      ? 'running'
      : a.status === 'error'
        ? 'degraded'
        : 'offline') as 'running' | 'degraded' | 'offline',
    tags: a.tags ?? [],
    skills: a.skills ?? [],
    createdAt: new Date(a.createdAt),
  }))

  // Collect unique types for filter tabs
  const types = [...new Set(apps.map((a) => a.type))]
  const filtered = filter === 'all' ? apps : apps.filter((a) => a.type === filter)

  return (
    <div className="text-slate-50 p-6">
      <div className="mb-4">
        <div>
          <h1 className="m-0 text-[22px] font-bold font-orbitron text-neon-purple">
            Connected Apps
          </h1>
          <p className="mt-1 mb-0 text-[13px] text-slate-500">
            {apps.length} agent{apps.length !== 1 ? 's' : ''} registered
          </p>
        </div>
      </div>
      <div className="flex gap-1 mb-4">
        <button
          className={
            filter === 'all'
              ? 'cyber-btn-primary rounded-md text-[13px] px-4 py-1.5 font-semibold'
              : 'cyber-btn-secondary rounded-md text-[13px] px-4 py-1.5'
          }
          onClick={() => setFilter('all')}
        >
          All ({apps.length})
        </button>
        {types.map((t) => (
          <button
            key={t}
            className={
              filter === t
                ? 'cyber-btn-primary rounded-md text-[13px] px-4 py-1.5 font-semibold'
                : 'cyber-btn-secondary rounded-md text-[13px] px-4 py-1.5'
            }
            onClick={() => setFilter(t)}
          >
            {t} ({apps.filter((a) => a.type === t).length})
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {filtered.length === 0 ? (
          <div className="text-slate-500 text-[13px] text-center p-10">No apps found</div>
        ) : (
          filtered.map((app) => <AppCard key={app.id} app={app} />)
        )}
      </div>
    </div>
  )
}
