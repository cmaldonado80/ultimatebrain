'use client'

/**
 * Canvas — feature flags and system policies dashboard.
 */

import { DbErrorBanner } from '../../../components/db-error-banner'
import { EmptyState } from '../../../components/ui/empty-state'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { trpc } from '../../../utils/trpc'

export default function CanvasPage() {
  const featuresQuery = trpc.intelligence.features.useQuery()
  const policiesQuery = trpc.intelligence.policies.useQuery()
  const setFeatureMut = trpc.intelligence.setFeature.useMutation()
  const utils = trpc.useUtils()

  const error = featuresQuery.error || policiesQuery.error

  if (error) {
    return (
      <div className="p-6 text-slate-50">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  const isLoading = featuresQuery.isLoading || policiesQuery.isLoading

  const handleToggleFeature = async (name: string, enabled: boolean) => {
    await setFeatureMut.mutateAsync({ name, enabled })
    utils.intelligence.features.invalidate()
  }

  if (isLoading) {
    return (
      <div className="p-6 text-slate-50">
        <LoadingState message="Loading canvas..." />
      </div>
    )
  }

  const features = featuresQuery.data as Record<string, boolean> | undefined
  const policies = policiesQuery.data as Record<string, unknown> | undefined

  return (
    <div className="p-6 text-slate-50">
      <PageHeader title="Canvas" />

      <div className="mb-6">
        <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
          Feature Flags
        </div>
        {features && Object.keys(features).length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {Object.entries(features).map(([name, enabled]) => (
              <div
                key={name}
                className="flex items-center justify-between bg-bg-elevated rounded-md px-3.5 py-2.5 border border-border"
              >
                <span className="text-[13px] font-mono">{name}</span>
                <button
                  className={`border-none rounded px-3 py-0.5 text-[11px] font-bold cursor-pointer min-w-[40px] ${
                    enabled ? 'bg-green-900 text-slate-50' : 'bg-slate-700 text-slate-400'
                  }`}
                  onClick={() => handleToggleFeature(name, !enabled)}
                >
                  {enabled ? 'ON' : 'OFF'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="No feature flags configured." />
        )}
      </div>

      <div className="mb-6">
        <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
          System Policies
        </div>
        {policies && Object.keys(policies).length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {Object.entries(policies).map(([name, value]) => (
              <div
                key={name}
                className="flex items-center justify-between bg-bg-elevated rounded-md px-3.5 py-2.5 border border-border"
              >
                <span className="text-[13px] font-mono font-semibold">{name}</span>
                <span className="text-[11px] font-mono text-slate-500">
                  {JSON.stringify(value)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="No system policies defined." />
        )}
      </div>
    </div>
  )
}
