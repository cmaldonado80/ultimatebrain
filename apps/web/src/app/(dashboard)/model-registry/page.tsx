'use client'
import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { trpc } from '../../../lib/trpc'

export default function ModelRegistryPage() {
  const modelsQuery = trpc.models.list.useQuery()
  const models = (modelsQuery.data ?? []) as Array<{
    id: string
    modelId: string
    displayName: string | null
    provider: string | null
    modelType: string | null
    contextWindow: number | null
    maxOutputTokens: number | null
    supportsVision: boolean | null
    supportsTools: boolean | null
    inputCostPerMToken: number | null
    outputCostPerMToken: number | null
    isActive: boolean | null
    speedTier: string | null
  }>

  const activeModels = models.filter((m) => m.isActive)
  const providers = [...new Set(models.map((m) => m.provider).filter(Boolean))]

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Model Registry"
        subtitle="Available LLM models, capabilities, and pricing"
      />

      <PageGrid cols="3" className="mb-6">
        <SectionCard padding="sm">
          <div className="text-[10px] text-slate-500 uppercase">Total Models</div>
          <div className="text-2xl font-mono text-neon-blue">{models.length}</div>
        </SectionCard>
        <SectionCard padding="sm">
          <div className="text-[10px] text-slate-500 uppercase">Active</div>
          <div className="text-2xl font-mono text-neon-green">{activeModels.length}</div>
        </SectionCard>
        <SectionCard padding="sm">
          <div className="text-[10px] text-slate-500 uppercase">Providers</div>
          <div className="text-2xl font-mono text-neon-purple">{providers.length}</div>
        </SectionCard>
      </PageGrid>

      <SectionCard title="Registered Models">
        {models.length === 0 ? (
          <div className="text-xs text-slate-600 py-4 text-center">
            No models registered. Run model detection to populate.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-slate-500 uppercase border-b border-border-dim">
                  <th className="text-left py-2 px-2">Model</th>
                  <th className="text-left py-2 px-2">Provider</th>
                  <th className="text-left py-2 px-2">Type</th>
                  <th className="text-right py-2 px-2">Context</th>
                  <th className="text-right py-2 px-2">Input $/M</th>
                  <th className="text-right py-2 px-2">Output $/M</th>
                  <th className="text-center py-2 px-2">Vision</th>
                  <th className="text-center py-2 px-2">Tools</th>
                  <th className="text-center py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.id} className="border-b border-border-dim/30 hover:bg-bg-elevated/50">
                    <td className="py-1.5 px-2 font-mono text-slate-200">{m.modelId}</td>
                    <td className="py-1.5 px-2 text-slate-400">{m.provider ?? '-'}</td>
                    <td className="py-1.5 px-2 text-slate-400">{m.modelType ?? '-'}</td>
                    <td className="py-1.5 px-2 text-right text-slate-500">
                      {m.contextWindow ? `${(m.contextWindow / 1000).toFixed(0)}k` : '-'}
                    </td>
                    <td className="py-1.5 px-2 text-right text-neon-teal">
                      {m.inputCostPerMToken != null ? `$${m.inputCostPerMToken.toFixed(2)}` : '-'}
                    </td>
                    <td className="py-1.5 px-2 text-right text-neon-teal">
                      {m.outputCostPerMToken != null ? `$${m.outputCostPerMToken.toFixed(2)}` : '-'}
                    </td>
                    <td className="py-1.5 px-2 text-center">{m.supportsVision ? '✓' : '-'}</td>
                    <td className="py-1.5 px-2 text-center">{m.supportsTools ? '✓' : '-'}</td>
                    <td className="py-1.5 px-2 text-center">
                      <span
                        className={`text-[9px] ${m.isActive ? 'text-neon-green' : 'text-slate-600'}`}
                      >
                        {m.isActive ? 'ACTIVE' : 'OFF'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
