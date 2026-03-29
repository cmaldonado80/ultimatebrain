import { trpc } from '../utils/trpc'

/**
 * useOrgRole — returns the current user's role in the active organization.
 * Used for permission-gated UI rendering.
 */
export function useOrgRole() {
  const { data } = trpc.organizations.list.useQuery(undefined, { staleTime: 60_000 })
  const active = data?.find((o) => o.isActive)
  return {
    role: (active?.role as string) ?? 'viewer',
    isOwner: active?.role === 'owner',
    isAdmin: active?.role === 'owner' || active?.role === 'admin',
    isOperator: ['owner', 'admin', 'operator'].includes((active?.role as string) ?? ''),
    orgName: active?.name ?? '',
    orgId: active?.id ?? '',
  }
}
