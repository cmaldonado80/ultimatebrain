'use client'

/**
 * Visual QA — browser session recordings and LLM-powered review.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { EmptyState } from '../../../components/ui/empty-state'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { trpc } from '../../../utils/trpc'

export default function VisualQAPage() {
  const [reviewResult, setReviewResult] = useState<string | null>(null)

  const recordingsQuery = trpc.visualQa.recordings.useQuery()
  const utils = trpc.useUtils()

  const stopMut = trpc.visualQa.stopRecording.useMutation({
    onSuccess: () => utils.visualQa.recordings.invalidate(),
  })

  const quickReviewMut = trpc.visualQa.quickReview.useMutation({
    onSuccess: (data) => {
      const result = data as { pass?: boolean; summary?: string; error?: string }
      if (result.error) {
        setReviewResult(`Error: ${result.error}`)
      } else {
        setReviewResult(`${result.pass ? 'PASS' : 'FAIL'}: ${result.summary ?? 'Review complete'}`)
      }
      setTimeout(() => setReviewResult(null), 8000)
    },
  })

  if (recordingsQuery.error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={recordingsQuery.error} />
      </div>
    )
  }

  const recordings = (recordingsQuery.data ?? []) as Array<{
    id: string
    sessionId: string
    agentId: string
    agentName: string
    status: string
    startedAt?: string | Date
    stoppedAt?: string | Date
    frameCount?: number
    annotations?: Array<{ label: string; type: string }>
  }>

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Visual QA" />

      {reviewResult && (
        <div className="cyber-card border-neon-teal/40 bg-neon-teal/5 px-4 py-2 text-sm text-neon-teal">
          {reviewResult}
        </div>
      )}

      {recordingsQuery.isLoading ? (
        <LoadingState message="Loading recordings..." />
      ) : recordings.length === 0 ? (
        <EmptyState title="No recordings yet" />
      ) : (
        <div className="cyber-table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-dim text-left text-xs text-slate-500 uppercase tracking-wider">
                <th className="pb-2 pr-4">Agent</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Frames</th>
                <th className="pb-2 pr-4">Annotations</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recordings.map((rec) => (
                <tr key={rec.id} className="border-b border-border-dim/30 hover:bg-bg-elevated/50">
                  <td className="py-2.5 pr-4">
                    <div className="font-medium text-slate-200">{rec.agentName}</div>
                    <div className="text-xs text-slate-500">{rec.id.slice(0, 12)}...</div>
                  </td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={`cyber-badge text-xs ${
                        rec.status === 'recording'
                          ? 'bg-red-500/20 text-red-300'
                          : rec.status === 'stopped'
                            ? 'bg-slate-500/20 text-slate-400'
                            : 'bg-neon-green/20 text-neon-green'
                      }`}
                    >
                      {rec.status}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-slate-400">{rec.frameCount ?? 0}</td>
                  <td className="py-2.5 pr-4 text-slate-400">{rec.annotations?.length ?? 0}</td>
                  <td className="py-2.5">
                    <div className="flex gap-2">
                      {rec.status === 'recording' && (
                        <button
                          className="cyber-btn-secondary text-xs px-2 py-1"
                          onClick={() => stopMut.mutate({ id: rec.id })}
                          disabled={stopMut.isPending}
                        >
                          Stop
                        </button>
                      )}
                      {rec.status !== 'recording' && (
                        <button
                          className="cyber-btn-primary text-xs px-2 py-1"
                          onClick={() =>
                            quickReviewMut.mutate({
                              recordingId: rec.id,
                              expectedState: 'Page loads correctly with no errors',
                            })
                          }
                          disabled={quickReviewMut.isPending}
                        >
                          {quickReviewMut.isPending ? 'Reviewing...' : 'Quick Review'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
