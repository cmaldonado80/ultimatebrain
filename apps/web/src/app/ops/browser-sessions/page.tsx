'use client'

/**
 * Browser Sessions — live browser agent session management.
 */

import { DbErrorBanner } from '../../../components/db-error-banner'
import { trpc } from '../../../utils/trpc'

export default function BrowserSessionsPage() {
  const sessionsQuery = trpc.browserAgent.activeSessions.useQuery(undefined, {
    refetchInterval: 5000,
  })
  const utils = trpc.useUtils()

  const pauseMut = trpc.browserAgent.pause.useMutation({
    onSuccess: () => utils.browserAgent.activeSessions.invalidate(),
  })
  const resumeMut = trpc.browserAgent.resume.useMutation({
    onSuccess: () => utils.browserAgent.activeSessions.invalidate(),
  })
  const stopMut = trpc.browserAgent.stop.useMutation({
    onSuccess: () => utils.browserAgent.activeSessions.invalidate(),
  })
  const takeoverMut = trpc.browserAgent.takeover.useMutation({
    onSuccess: () => utils.browserAgent.activeSessions.invalidate(),
  })

  if (sessionsQuery.error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={sessionsQuery.error} />
      </div>
    )
  }

  const sessions = (sessionsQuery.data ?? []) as Array<{
    id: string
    agentId: string
    agentName: string
    status: string
    url?: string
    startedAt?: string | Date
  }>

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-orbitron text-neon-teal">Browser Sessions</h1>
          <p className="text-sm text-slate-400 mt-1">
            Live browser agent sessions &mdash; {sessions.length} active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="neon-dot-green animate-pulse" />
          <span className="text-xs text-slate-500">Auto-refresh 5s</span>
        </div>
      </div>

      {sessionsQuery.isLoading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="text-lg font-orbitron text-slate-500">Loading sessions...</div>
        </div>
      ) : sessions.length === 0 ? (
        <div className="cyber-card p-8 text-center text-slate-500">
          No active browser sessions. Agents will appear here when they launch browser tasks.
        </div>
      ) : (
        <div className="grid gap-4">
          {sessions.map((session) => (
            <div key={session.id} className="cyber-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      session.status === 'running'
                        ? 'bg-neon-green animate-pulse'
                        : session.status === 'paused'
                          ? 'bg-neon-yellow'
                          : 'bg-slate-500'
                    }`}
                  />
                  <div>
                    <div className="font-medium text-slate-200">{session.agentName}</div>
                    <div className="text-xs text-slate-500">
                      {session.id.slice(0, 12)}... &middot; {session.status}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {session.status === 'running' && (
                    <>
                      <button
                        className="cyber-btn-secondary text-xs px-2 py-1"
                        onClick={() => pauseMut.mutate({ id: session.id })}
                        disabled={pauseMut.isPending}
                      >
                        Pause
                      </button>
                      <button
                        className="cyber-btn-secondary text-xs px-2 py-1"
                        onClick={() => takeoverMut.mutate({ id: session.id })}
                        disabled={takeoverMut.isPending}
                      >
                        Takeover
                      </button>
                    </>
                  )}
                  {session.status === 'paused' && (
                    <button
                      className="cyber-btn-primary text-xs px-2 py-1"
                      onClick={() => resumeMut.mutate({ id: session.id })}
                      disabled={resumeMut.isPending}
                    >
                      Resume
                    </button>
                  )}
                  <button
                    className="cyber-btn-danger text-xs px-2 py-1"
                    onClick={() => stopMut.mutate({ id: session.id })}
                    disabled={stopMut.isPending}
                  >
                    Stop
                  </button>
                </div>
              </div>
              {session.url && (
                <div className="mt-2 text-xs text-slate-400 font-mono truncate">{session.url}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
