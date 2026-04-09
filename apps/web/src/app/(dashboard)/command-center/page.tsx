'use client'

/**
 * Corporation Command Center — unified real-time view of the entire
 * AI corporation powered by SSE streaming.
 */

import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatCard } from '../../../components/ui/stat-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { useCommandStream } from '../../../hooks/use-command-stream'

const TICKET_STATUS_COLOR: Record<string, 'green' | 'blue' | 'yellow' | 'red' | 'purple'> = {
  done: 'green',
  in_progress: 'blue',
  queued: 'yellow',
  open: 'blue',
  failed: 'red',
  blocked: 'red',
  review: 'purple',
}

function timeAgo(ts: string | null): string {
  if (!ts) return '—'
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export default function CommandCenterPage() {
  const stream = useCommandStream()

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Command Center"
        subtitle="Live corporation operations — real-time streaming from all subsystems"
      />

      {/* Connection indicator */}
      <div className="flex items-center gap-2 mb-4">
        <span
          className={`w-2 h-2 rounded-full ${stream.connected ? 'bg-neon-green animate-pulse' : 'bg-neon-red'}`}
        />
        <span className="text-[10px] text-slate-500">
          {stream.connected ? 'LIVE — streaming every 5s' : 'Connecting...'}
        </span>
      </div>

      {/* Vital Signs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard
          label="Agents Active"
          value={stream.agents.active}
          color="green"
          sub={`${stream.agents.total} total`}
        />
        <StatCard
          label="Tickets Open"
          value={stream.tickets.open}
          color="blue"
          sub={`${stream.tickets.done} done today`}
        />
        <StatCard
          label="Active Swarms"
          value={stream.swarms.active}
          color="purple"
          sub="ephemeral teams"
        />
        <StatCard
          label="Cost (1h)"
          value={`$${stream.costs.lastHourUsd.toFixed(3)}`}
          color="yellow"
          sub={`${stream.costs.lastHourCalls} calls`}
        />
        <StatCard
          label="Healing (1h)"
          value={stream.healing.lastHourActions}
          color={stream.healing.lastHourActions > 5 ? 'red' : 'green'}
          sub="actions"
        />
        <StatCard
          label="Errors"
          value={stream.agents.error}
          color={stream.agents.error > 0 ? 'red' : 'green'}
          sub={`${stream.tickets.failed} failed tickets`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Agent Status Distribution */}
        <SectionCard title="Agent Distribution">
          <div className="space-y-2">
            {[
              {
                label: 'Active',
                value: stream.agents.active,
                color: 'bg-neon-green',
                pct:
                  stream.agents.total > 0
                    ? Math.round((stream.agents.active / stream.agents.total) * 100)
                    : 0,
              },
              {
                label: 'Idle',
                value: stream.agents.idle,
                color: 'bg-slate-500',
                pct:
                  stream.agents.total > 0
                    ? Math.round((stream.agents.idle / stream.agents.total) * 100)
                    : 0,
              },
              {
                label: 'Error',
                value: stream.agents.error,
                color: 'bg-neon-red',
                pct:
                  stream.agents.total > 0
                    ? Math.round((stream.agents.error / stream.agents.total) * 100)
                    : 0,
              },
              {
                label: 'Offline',
                value: stream.agents.offline,
                color: 'bg-slate-700',
                pct:
                  stream.agents.total > 0
                    ? Math.round((stream.agents.offline / stream.agents.total) * 100)
                    : 0,
              },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3">
                <span className="text-[11px] text-slate-400 w-12">{row.label}</span>
                <div className="flex-1 h-2 bg-bg-elevated rounded-full overflow-hidden">
                  <div
                    className={`h-full ${row.color} rounded-full transition-all`}
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
                <span className="text-[11px] text-slate-300 font-mono w-8 text-right">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Active Swarms */}
        <SectionCard title="Active Swarms">
          {stream.swarms.swarms.length === 0 ? (
            <div className="text-xs text-slate-600 py-4 text-center">No active swarms</div>
          ) : (
            <div className="space-y-1.5">
              {stream.swarms.swarms.map((s) => (
                <div key={s.id} className="bg-bg-deep rounded px-3 py-2 border border-border-dim">
                  <div className="text-[11px] text-slate-200 truncate">{s.task}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-neon-purple">{s.members} members</span>
                    <span className="text-[10px] text-slate-600">{timeAgo(s.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Recent Cron Runs */}
        <SectionCard title="Recent Cron Activity">
          {stream.cron.recentRuns.length === 0 ? (
            <div className="text-xs text-slate-600 py-4 text-center">
              No cron runs in the last hour
            </div>
          ) : (
            <div className="space-y-1.5">
              {stream.cron.recentRuns.map((c, i) => (
                <div
                  key={`${c.name}-${i}`}
                  className="flex items-center gap-2 bg-bg-deep rounded px-3 py-2 border border-border-dim"
                >
                  <StatusBadge
                    label={c.failed ? 'failed' : 'ok'}
                    color={c.failed ? 'red' : 'green'}
                  />
                  <span className="text-[11px] text-slate-200 font-mono flex-1 truncate">
                    {c.name}
                  </span>
                  <span className="text-[10px] text-slate-500">{timeAgo(c.lastRun)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Activity Timeline */}
      <SectionCard title="Activity Timeline">
        {stream.activity.items.length === 0 ? (
          <div className="text-xs text-slate-600 py-6 text-center">No recent activity</div>
        ) : (
          <div className="space-y-1">
            {stream.activity.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 bg-bg-deep rounded px-4 py-2 border border-border-dim"
              >
                <StatusBadge
                  label={item.status}
                  color={TICKET_STATUS_COLOR[item.status] ?? 'blue'}
                />
                <span className="text-[11px] text-slate-200 flex-1 truncate">{item.title}</span>
                <span className="text-[10px] text-slate-500 flex-shrink-0">
                  {timeAgo(item.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
