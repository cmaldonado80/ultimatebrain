type StatusColor = 'green' | 'blue' | 'red' | 'yellow' | 'purple' | 'slate'

interface StatusBadgeProps {
  label: string
  color: StatusColor
  dot?: boolean
  pulse?: boolean
  className?: string
}

const COLOR_MAP: Record<StatusColor, { text: string; bg: string; border: string; dotBg: string }> =
  {
    green: {
      text: 'text-neon-green',
      bg: 'bg-neon-green/10',
      border: 'border-neon-green/20',
      dotBg: 'bg-neon-green',
    },
    blue: {
      text: 'text-neon-blue',
      bg: 'bg-neon-blue/10',
      border: 'border-neon-blue/20',
      dotBg: 'bg-neon-blue',
    },
    red: {
      text: 'text-neon-red',
      bg: 'bg-neon-red/10',
      border: 'border-neon-red/20',
      dotBg: 'bg-neon-red',
    },
    yellow: {
      text: 'text-neon-yellow',
      bg: 'bg-neon-yellow/10',
      border: 'border-neon-yellow/20',
      dotBg: 'bg-neon-yellow',
    },
    purple: {
      text: 'text-neon-purple',
      bg: 'bg-neon-purple/10',
      border: 'border-neon-purple/20',
      dotBg: 'bg-neon-purple',
    },
    slate: {
      text: 'text-slate-500',
      bg: 'bg-slate-700/50',
      border: 'border-slate-600',
      dotBg: 'bg-slate-400',
    },
  }

export function StatusBadge({ label, color, dot, pulse, className }: StatusBadgeProps) {
  const c = COLOR_MAP[color]

  return (
    <span
      className={`text-[9px] px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${c.text} ${c.bg} ${c.border} ${className ?? ''}`}
    >
      {dot && (
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dotBg} ${pulse ? 'animate-pulse' : ''}`}
        />
      )}
      {label}
    </span>
  )
}

export type { StatusColor }
