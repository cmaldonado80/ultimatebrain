'use client'

/**
 * Cron Jobs — scheduled background tasks and their status.
 */

import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatusBadge } from '../../../../components/ui/status-badge'

/** Static list of worker cron jobs — kept in sync with apps/worker/src/index.ts */
const CRON_JOBS = [
  {
    name: 'healing:cycle',
    schedule: '*/10 * * * *',
    desc: 'Self-healing OODA loop',
    category: 'Healing',
  },
  {
    name: 'healing:code-repair',
    schedule: '*/30 * * * *',
    desc: 'Detect and repair recurring errors',
    category: 'Healing',
  },
  {
    name: 'instinct:pipeline',
    schedule: '0 2 * * *',
    desc: 'Observe → Detect → Promote patterns',
    category: 'Intelligence',
  },
  {
    name: 'instinct:evolve',
    schedule: '0 3 * * 0',
    desc: 'Evolve instinct rules weekly',
    category: 'Intelligence',
  },
  {
    name: 'evolution:validate',
    schedule: '0 4 * * *',
    desc: 'Validate pending soul mutations',
    category: 'Intelligence',
  },
  {
    name: 'market:sweep',
    schedule: '*/5 * * * *',
    desc: 'Expire stale work market listings',
    category: 'Orchestration',
  },
  {
    name: 'org:optimize',
    schedule: '0 2 1 * *',
    desc: 'Monthly org structure proposals',
    category: 'Orchestration',
  },
  {
    name: 'intelligence:causal-analysis',
    schedule: '0 3 * * 0',
    desc: 'Weekly causal graph analysis',
    category: 'Intelligence',
  },
  {
    name: 'intelligence:meta-learning',
    schedule: '0 4 * * 0',
    desc: 'Weekly meta-learning governor',
    category: 'Intelligence',
  },
  {
    name: 'intelligence:daily-briefing',
    schedule: '0 8 * * *',
    desc: 'Generate daily briefing report',
    category: 'Intelligence',
  },
  {
    name: 'tools:flush',
    schedule: '*/10 * * * *',
    desc: 'Persist in-memory tool analytics',
    category: 'Platform',
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
  if (cron.includes('* * 0')) return 'Weekly (Sun)'
  if (cron.includes('1 * *')) return 'Monthly (1st)'
  if (cron.startsWith('0 ')) {
    const hour = cron.split(' ')[1]
    return `Daily at ${hour}:00 UTC`
  }
  return cron
}

export default function CronJobsPage() {
  const categories = [...new Set(CRON_JOBS.map((j) => j.category))]

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Cron Jobs"
        subtitle="Scheduled background tasks from the worker process"
        count={CRON_JOBS.length}
      />

      {categories.map((cat) => {
        const jobs = CRON_JOBS.filter((j) => j.category === cat)
        return (
          <SectionCard key={cat} title={cat} className="mb-4">
            <div className="space-y-2">
              {jobs.map((job) => (
                <div
                  key={job.name}
                  className="flex items-center gap-3 bg-bg-deep rounded px-4 py-2.5 border border-border-dim"
                >
                  <StatusBadge label={cat} color={CATEGORY_COLORS[cat] ?? 'blue'} />
                  <div className="flex-1">
                    <div className="text-xs text-slate-200 font-medium font-mono">{job.name}</div>
                    <div className="text-[10px] text-slate-500">{job.desc}</div>
                  </div>
                  <div className="text-right">
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
    </div>
  )
}
