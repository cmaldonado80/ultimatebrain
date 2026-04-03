/**
 * Sparkline — zero-dependency SVG inline charts.
 *
 * Renders a miniature line chart in any container. Supports:
 * - Line chart with gradient fill
 * - Threshold line (warning/danger zone)
 * - Percentile band (P10-P90 shaded region)
 * - Current value dot with pulse animation
 * - Color-coded by status (green/yellow/red)
 */

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: 'green' | 'blue' | 'yellow' | 'red' | 'purple' | 'teal'
  threshold?: number
  percentileBand?: { p10: number; p90: number }
  showDot?: boolean
  className?: string
}

const COLOR_MAP: Record<string, { stroke: string; fill: string; dot: string }> = {
  green: { stroke: '#00ff88', fill: 'rgba(0, 255, 136, 0.1)', dot: '#00ff88' },
  blue: { stroke: '#38bdf8', fill: 'rgba(56, 189, 248, 0.1)', dot: '#38bdf8' },
  yellow: { stroke: '#facc15', fill: 'rgba(250, 204, 21, 0.1)', dot: '#facc15' },
  red: { stroke: '#f87171', fill: 'rgba(248, 113, 113, 0.1)', dot: '#f87171' },
  purple: { stroke: '#c084fc', fill: 'rgba(192, 132, 252, 0.1)', dot: '#c084fc' },
  teal: { stroke: '#2dd4bf', fill: 'rgba(45, 212, 191, 0.1)', dot: '#2dd4bf' },
}

export function Sparkline({
  data,
  width = 120,
  height = 32,
  color = 'blue',
  threshold,
  percentileBand,
  showDot = true,
  className,
}: SparklineProps) {
  if (data.length < 2) {
    return (
      <svg width={width} height={height} className={className}>
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#475569"
          fontSize="8"
        >
          No data
        </text>
      </svg>
    )
  }

  const colors = COLOR_MAP[color] ?? COLOR_MAP['blue']!
  const padding = { top: 2, bottom: 2, left: 1, right: showDot ? 6 : 1 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  // Scale data to chart dimensions
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const scaleX = (i: number) => padding.left + (i / (data.length - 1)) * chartW
  const scaleY = (v: number) => padding.top + chartH - ((v - min) / range) * chartH

  // Build line path
  const linePath = data
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${scaleX(i).toFixed(1)},${scaleY(v).toFixed(1)}`)
    .join(' ')

  // Build fill path (line + close at bottom)
  const fillPath = `${linePath} L${scaleX(data.length - 1).toFixed(1)},${(padding.top + chartH).toFixed(1)} L${padding.left},${(padding.top + chartH).toFixed(1)} Z`

  // Last point for dot
  const lastX = scaleX(data.length - 1)
  const lastY = scaleY(data[data.length - 1]!)

  // Unique ID for gradient
  const gradientId = `sparkline-grad-${color}-${Math.random().toString(36).slice(2, 6)}`

  return (
    <svg width={width} height={height} className={className}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colors.stroke} stopOpacity="0.3" />
          <stop offset="100%" stopColor={colors.stroke} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Percentile band */}
      {percentileBand && (
        <rect
          x={padding.left}
          y={scaleY(percentileBand.p90)}
          width={chartW}
          height={Math.max(1, scaleY(percentileBand.p10) - scaleY(percentileBand.p90))}
          fill={colors.stroke}
          opacity="0.08"
          rx="1"
        />
      )}

      {/* Threshold line */}
      {threshold !== undefined && (
        <line
          x1={padding.left}
          y1={scaleY(threshold)}
          x2={padding.left + chartW}
          y2={scaleY(threshold)}
          stroke="#f87171"
          strokeWidth="0.5"
          strokeDasharray="2,2"
          opacity="0.5"
        />
      )}

      {/* Fill area */}
      <path d={fillPath} fill={`url(#${gradientId})`} />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={colors.stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Current value dot */}
      {showDot && (
        <>
          <circle cx={lastX} cy={lastY} r="3" fill={colors.dot} opacity="0.3">
            <animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" />
            <animate
              attributeName="opacity"
              values="0.3;0.1;0.3"
              dur="2s"
              repeatCount="indefinite"
            />
          </circle>
          <circle cx={lastX} cy={lastY} r="2" fill={colors.dot} />
        </>
      )}
    </svg>
  )
}

/**
 * SparkBar — mini bar chart variant.
 */
interface SparkBarProps {
  data: number[]
  width?: number
  height?: number
  color?: 'green' | 'blue' | 'yellow' | 'red' | 'purple'
  className?: string
}

export function SparkBar({
  data,
  width = 80,
  height = 24,
  color = 'blue',
  className,
}: SparkBarProps) {
  if (data.length === 0) return null

  const colors = COLOR_MAP[color] ?? COLOR_MAP['blue']!
  const max = Math.max(...data, 1)
  const barWidth = Math.max(2, (width - data.length) / data.length)
  const gap = 1

  return (
    <svg width={width} height={height} className={className}>
      {data.map((v, i) => {
        const barH = Math.max(1, (v / max) * (height - 2))
        return (
          <rect
            key={i}
            x={i * (barWidth + gap)}
            y={height - barH - 1}
            width={barWidth}
            height={barH}
            fill={colors.stroke}
            opacity={i === data.length - 1 ? 1 : 0.4}
            rx="1"
          />
        )
      })}
    </svg>
  )
}
