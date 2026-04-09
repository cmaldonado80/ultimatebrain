'use client'

/**
 * Evals — evaluation datasets, runs, and drift detection.
 */

import { useState } from 'react'

import { LoadingState } from '../../../../components/ui/loading-state'
import { PageGrid } from '../../../../components/ui/page-grid'
import { PageHeader } from '../../../../components/ui/page-header'
import { SectionCard } from '../../../../components/ui/section-card'
import { StatCard } from '../../../../components/ui/stat-card'
import { StatusBadge } from '../../../../components/ui/status-badge'
import { trpc } from '../../../../utils/trpc'

export default function EvalsPage() {
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null)
  const datasetsQuery = trpc.evals.datasetsWithCounts.useQuery()
  const runsQuery = trpc.evals.runs.useQuery(
    { datasetId: selectedDataset ?? '', limit: 20 },
    { enabled: !!selectedDataset },
  )

  if (datasetsQuery.isLoading) return <LoadingState message="Loading Evals..." />

  const datasets = (datasetsQuery.data ?? []) as Array<{
    id: string
    name: string
    description: string | null
    caseCount: number
    createdAt: Date
  }>

  const runs = (runsQuery.data ?? []) as Array<{
    id: string
    version: string | null
    scores: unknown
    createdAt: Date
  }>

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Evaluations"
        subtitle="Datasets, test cases, and evaluation runs"
        count={datasets.length}
      />

      <PageGrid cols="3" className="mb-6">
        <StatCard label="Datasets" value={datasets.length} color="blue" sub="evaluation suites" />
        <StatCard
          label="Total Cases"
          value={datasets.reduce((sum, d) => sum + d.caseCount, 0)}
          color="purple"
          sub="test inputs"
        />
        <StatCard
          label="Latest Run"
          value={runs.length > 0 ? (runs[0]!.version ?? 'v?') : '—'}
          color={runs.length > 0 ? 'green' : 'yellow'}
          sub="most recent run"
        />
      </PageGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Datasets">
          {datasets.length === 0 ? (
            <div className="text-xs text-slate-600 py-6 text-center">
              No evaluation datasets configured yet.
            </div>
          ) : (
            <div className="space-y-2">
              {datasets.map((ds) => (
                <button
                  key={ds.id}
                  onClick={() => setSelectedDataset(ds.id)}
                  className={`w-full text-left bg-bg-deep rounded px-3 py-2.5 border transition-colors ${
                    selectedDataset === ds.id
                      ? 'border-neon-blue/50'
                      : 'border-border-dim hover:border-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs text-slate-200 font-medium">{ds.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {ds.caseCount} cases
                    </span>
                  </div>
                  {ds.description && (
                    <p className="text-[10px] text-slate-500 truncate">{ds.description}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title={selectedDataset ? 'Evaluation Runs' : 'Select a Dataset'}>
          {!selectedDataset ? (
            <div className="text-xs text-slate-600 py-6 text-center">
              Click a dataset to view its evaluation runs.
            </div>
          ) : runsQuery.isLoading ? (
            <LoadingState message="Loading runs..." />
          ) : runs.length === 0 ? (
            <div className="text-xs text-slate-600 py-6 text-center">No runs for this dataset.</div>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center gap-3 bg-bg-deep rounded px-3 py-2 border border-border-dim"
                >
                  <StatusBadge label={run.version ?? 'v?'} color="blue" />
                  <span className="text-[11px] text-slate-300 flex-1 font-mono">
                    {run.id.slice(0, 8)}
                  </span>
                  <span className="text-[10px] text-slate-600">
                    {new Date(run.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
