'use client'

/**
 * QA Recordings — list eval datasets and their runs for quality assurance review.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { EmptyState } from '../../../components/ui/empty-state'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { trpc } from '../../../utils/trpc'

interface DatasetSummary {
  id: string
  name: string
  description: string | null
  caseCount: number
  createdAt: Date
}

interface EvalRun {
  id: string
  datasetId: string
  version: string | null
  scores: unknown
  createdAt: Date
}

export default function QAPage() {
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null)

  const datasetsQuery = trpc.evals.datasetsWithCounts.useQuery()
  const runsQuery = trpc.evals.runs.useQuery(
    { datasetId: selectedDataset! },
    { enabled: !!selectedDataset },
  )

  if (datasetsQuery.error) {
    return (
      <div className="p-6 text-slate-50">
        <DbErrorBanner error={datasetsQuery.error} />
      </div>
    )
  }

  if (datasetsQuery.isLoading) {
    return (
      <div className="p-6 text-slate-50">
        <LoadingState message="Loading recordings..." />
      </div>
    )
  }

  const datasets: DatasetSummary[] = (datasetsQuery.data as DatasetSummary[]) ?? []
  const runs: EvalRun[] = (runsQuery.data as EvalRun[]) ?? []

  return (
    <div className="p-6 text-slate-50">
      <PageHeader title="QA Recordings" />

      <div className="flex gap-4 min-h-[400px]">
        {/* Sidebar */}
        <div className="w-[260px] bg-bg-surface rounded-lg p-3 border border-border">
          <div className="text-[11px] font-bold text-slate-500 uppercase mb-2">
            Datasets ({datasets.length})
          </div>
          {datasets.length === 0 ? (
            <EmptyState message="No eval datasets found." />
          ) : (
            datasets.map((ds) => (
              <div
                key={ds.id}
                className={`px-2.5 py-2 rounded-md cursor-pointer mb-1 ${
                  selectedDataset === ds.id ? 'bg-bg-elevated' : 'hover:bg-white/5'
                }`}
                onClick={() => setSelectedDataset(ds.id)}
              >
                <div className="text-[13px] font-semibold">{ds.name}</div>
                <div className="text-[10px] text-slate-600">{ds.caseCount} cases</div>
              </div>
            ))
          )}
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col">
          {!selectedDataset ? (
            <div className="flex items-center justify-center flex-1 text-slate-500 text-sm">
              Select a dataset to view its eval runs.
            </div>
          ) : runsQuery.isLoading ? (
            <div className="flex items-center justify-center flex-1 text-slate-500 text-sm">
              Loading runs...
            </div>
          ) : runs.length === 0 ? (
            <div className="flex items-center justify-center flex-1 text-slate-500 text-sm">
              No runs for this dataset yet.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {runs.map((run) => {
                const scores = run.scores as Record<string, number> | null
                return (
                  <div key={run.id} className="cyber-card p-3.5">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <span className="text-sm font-bold font-mono">Run {run.id.slice(0, 8)}</span>
                      {run.version && (
                        <span className="cyber-badge text-neon-blue text-[10px]">
                          v{run.version}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-600 ml-auto">
                        {new Date(run.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {scores && (
                      <div className="flex gap-2 flex-wrap">
                        {Object.entries(scores).map(([key, val]) => (
                          <span key={key} className="cyber-badge text-neon-purple text-[10px]">
                            {key}: {typeof val === 'number' ? val.toFixed(2) : String(val)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
