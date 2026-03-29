'use client'

import { trpc } from '../../utils/trpc'

/**
 * OrgBadge — small chip showing the active organization name.
 * Used in page headers and breadcrumbs to make org scope visible.
 */
export function OrgBadge() {
  const { data } = trpc.organizations.list.useQuery(undefined, { staleTime: 60_000 })
  const active = data?.find((o) => o.isActive)
  if (!active) return null
  return (
    <span className="text-[10px] px-2 py-0.5 rounded bg-neon-teal/10 text-neon-teal border border-neon-teal/20 font-medium">
      {active.name}
    </span>
  )
}
