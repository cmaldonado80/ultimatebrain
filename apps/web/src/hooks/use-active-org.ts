/**
 * useActiveOrg — convenience re-export from OrgProvider.
 *
 * Import from here rather than directly from the provider to keep
 * import paths short in page components.
 */
export {
  type OrgContextValue,
  type OrgEntry,
  useActiveOrg,
} from '../components/providers/org-provider'
