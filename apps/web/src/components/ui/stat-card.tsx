import Link from 'next/link'

type StatColor = 'blue' | 'green' | 'red' | 'purple' | 'yellow' | 'slate'

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  color?: StatColor
  href?: string
  className?: string
}

const COLOR_MAP: Record<StatColor, string> = {
  blue: 'text-neon-blue',
  green: 'text-neon-green',
  red: 'text-neon-red',
  purple: 'text-neon-purple',
  yellow: 'text-neon-yellow',
  slate: 'text-slate-600',
}

function StatCardInner({
  label,
  value,
  sub,
  color = 'blue',
  className,
}: Omit<StatCardProps, 'href'>) {
  return (
    <div className={`cyber-card p-4 ${className ?? ''}`}>
      <div className={`text-2xl font-bold font-orbitron ${COLOR_MAP[color]}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
      {sub && <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>}
    </div>
  )
}

export function StatCard({ href, ...props }: StatCardProps) {
  if (href) {
    return (
      <Link href={href} className="no-underline">
        <StatCardInner {...props} />
      </Link>
    )
  }
  return <StatCardInner {...props} />
}
