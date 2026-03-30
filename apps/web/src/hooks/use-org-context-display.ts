import { useActiveOrg } from './use-active-org'

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  operator: 'Operator',
  viewer: 'Viewer',
}

export function useOrgContextDisplay() {
  const { activeOrg, role, isPlatformOwner } = useActiveOrg()

  return {
    orgName: activeOrg?.name ?? '',
    orgSlug: activeOrg?.slug,
    roleLabel: ROLE_LABELS[role] ?? role,
    isPlatformOwner,
  }
}
