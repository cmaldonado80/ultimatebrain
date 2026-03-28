'use client'

/**
 * Insights Panel — smart topology analysis for the Swarm Observatory.
 */

interface Insight {
  id: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  description: string
  nodeIds: string[]
}

const SEVERITY_STYLES: Record<string, { dot: string; text: string; bg: string }> = {
  critical: { dot: 'neon-dot-red', text: 'text-neon-red', bg: 'bg-neon-red/5 border-neon-red/20' },
  warning: {
    dot: 'neon-dot-yellow',
    text: 'text-neon-yellow',
    bg: 'bg-neon-yellow/5 border-neon-yellow/20',
  },
  info: { dot: 'neon-dot-blue', text: 'text-neon-blue', bg: 'bg-neon-blue/5 border-neon-blue/20' },
}

export function InsightsPanel({
  insights,
  onHighlight,
  onClose,
}: {
  insights: Insight[]
  onHighlight: (nodeIds: string[]) => void
  onClose: () => void
}) {
  if (insights.length === 0) {
    return (
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 cyber-card p-3 text-xs text-slate-500">
        No issues detected — system topology looks healthy.
      </div>
    )
  }

  const critical = insights.filter((i) => i.severity === 'critical')
  const warnings = insights.filter((i) => i.severity === 'warning')
  const infos = insights.filter((i) => i.severity === 'info')

  return (
    <div className="absolute bottom-4 left-4 right-4 z-20 cyber-card p-4 max-h-[240px] overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-orbitron text-neon-teal tracking-wider">INSIGHTS</h3>
          <div className="flex items-center gap-2 text-[10px]">
            {critical.length > 0 && (
              <span className="text-neon-red">{critical.length} critical</span>
            )}
            {warnings.length > 0 && (
              <span className="text-neon-yellow">{warnings.length} warnings</span>
            )}
            {infos.length > 0 && <span className="text-neon-blue">{infos.length} info</span>}
          </div>
        </div>
        <button onClick={onClose} className="text-slate-600 hover:text-slate-400 text-xs">
          &#x2715;
        </button>
      </div>

      <div className="space-y-2">
        {[...critical, ...warnings, ...infos].map((insight) => {
          const style = SEVERITY_STYLES[insight.severity]
          return (
            <button
              key={insight.id}
              className={`w-full text-left border rounded-lg p-2.5 transition-colors hover:bg-bg-elevated/50 ${style.bg}`}
              onClick={() => onHighlight(insight.nodeIds)}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`neon-dot ${style.dot}`} />
                <span className={`text-xs font-medium ${style.text}`}>{insight.title}</span>
              </div>
              <div className="text-[10px] text-slate-500 ml-4">{insight.description}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
