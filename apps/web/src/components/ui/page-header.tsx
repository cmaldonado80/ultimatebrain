'use client'

import { OrgBadge } from './org-badge'

interface PageHeaderProps {
  title: string
  subtitle?: string
  showOrgBadge?: boolean
  count?: number | string
  live?: boolean
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  showOrgBadge = true,
  count,
  live,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={className}>
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-[22px] font-bold font-orbitron text-white m-0">{title}</h1>

        {showOrgBadge && <OrgBadge />}

        {count != null && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-500 font-mono">
            {count}
          </span>
        )}

        {live && (
          <div className="flex items-center gap-1.5">
            <span className="neon-dot neon-dot-green animate-pulse" />
            <span className="text-xs text-slate-500">Live</span>
          </div>
        )}

        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>

      {subtitle && <p className="text-xs text-slate-500 mt-1 mb-0">{subtitle}</p>}
    </div>
  )
}
