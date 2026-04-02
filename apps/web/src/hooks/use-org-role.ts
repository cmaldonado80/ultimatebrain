/**
 * useOrgRole — returns the current user's role in the active organization.
 * Delegates to useActiveOrg() from OrgProvider for a single network request.
 */
import { useActiveOrg } from './use-active-org'

export function useOrgRole() {
  const { activeOrg, role, isOwner, isAdmin, isOperator, isPlatformOwner } = useActiveOrg()
  return {
    role,
    isOwner,
    isAdmin,
    isOperator,
    isPlatformOwner,
    orgName: activeOrg?.name ?? '',
    orgId: activeOrg?.id ?? '',
  }
}
