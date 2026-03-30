'use client'

/**
 * QA Recordings — list eval datasets and their runs for quality assurance review.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { OrgBadge } from '../../../components/ui/org-badge'
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
      <div className="p-6 text-slate-50 flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-500">
          <div className="text-2xl mb-2">Loading...</div>
          <div className="text-[13px]">Fetching QA data</div>
        </div>
      </div>
    )
  }

  const datasets: DatasetSummary[] = (datasetsQuery.data as DatasetSummary[]) ?? []
  const runs: EvalRun[] = (runsQuery.data as EvalRun[]) ?? []

  return (
    <div className="p-6 text-slate-50">
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="m-0 text-[22px] font-bold font-orbitron">QA Recordings</h2>
          <OrgBadge />
        </div>
        <p className="mt-1 mb-0 text-[13px] text-slate-500">
          Record, replay, and validate visual test sessions for quality assurance.
        </p>
      </div>

      <div className="flex gap-4 min-h-[400px]">
        {/* Sidebar */}
        <div className="w-[260px] bg-bg-surface rounded-lg p-3 border border-border">
          <div className="text-[11px] font-bold text-slate-500 uppercase mb-2">
            Datasets ({datasets.length})
          </div>
          {datasets.length === 0 ? (
            <div className="text-xs text-slate-600 p-3 text-center">No eval datasets found.</div>
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
