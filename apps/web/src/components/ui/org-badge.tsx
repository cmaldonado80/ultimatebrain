'use client'

import { useActiveOrg } from '../../hooks/use-active-org'

/**
 * OrgBadge — small chip showing the active organization name.
 * Used in page headers to make org scope visible.
 */
export function OrgBadge() {
  const { activeOrg } = useActiveOrg()
  if (!activeOrg) return null
  return (
    <span className="text-[10px] px-2 py-0.5 rounded bg-neon-teal/10 text-neon-teal border border-neon-teal/20 font-medium">
      {activeOrg.name}
    </span>
  )
}
