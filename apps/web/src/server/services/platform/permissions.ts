/**
 * Permission Check Layer — central authorization for all platform actions.
 *
 * Usage:
 *   await assertPermission(db, userId, 'create_brain')
 *   await assertPermission(db, userId, 'write', { type: 'workspace', id: wsId })
 */

import type { Database } from '@solarc/db'
import { userRoles, workspaceMembers } from '@solarc/db'
import { TRPCError } from '@trpc/server'
import { and, eq } from 'drizzle-orm'

export type Action =
  | 'read'
  | 'write'
  | 'execute'
  | 'admin'
  | 'create_brain'
  | 'rotate_key'
  | 'change_autonomy'
  | 'delete'
  | 'manage_members'

interface Resource {
  type: 'workspace' | 'brain_entity' | 'agent' | 'workflow'
  id?: string
}

// Actions allowed per global role
const GLOBAL_ROLE_ACTIONS: Record<string, Set<Action>> = {
  platform_owner: new Set([
    'read',
    'write',
    'execute',
    'admin',
    'create_brain',
    'rotate_key',
    'change_autonomy',
    'delete',
    'manage_members',
  ]),
  operator: new Set(['read', 'write', 'execute']),
  viewer: new Set(['read']),
}

// Actions allowed per workspace-scoped role
const WORKSPACE_ROLE_ACTIONS: Record<string, Set<Action>> = {
  owner: new Set([
    'read',
    'write',
    'execute',
    'admin',
    'change_autonomy',
    'delete',
    'manage_members',
  ]),
  operator: new Set(['read', 'write', 'execute']),
  viewer: new Set(['read']),
}

/**
 * Check if a user can perform an action on a resource.
 */
export async function can(
  db: Database,
  userId: string,
  action: Action,
  resource?: Resource,
): Promise<boolean> {
  // 1. Check global roles
  const roles = await db.query.userRoles.findMany({
    where: eq(userRoles.userId, userId),
  })

  for (const role of roles) {
    const allowed = GLOBAL_ROLE_ACTIONS[role.role]
    if (allowed?.has(action)) return true
  }

  // 2. Check workspace-scoped roles (if resource is workspace-scoped)
  if (resource?.type === 'workspace' && resource.id) {
    const membership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.workspaceId, resource.id),
      ),
    })
    if (membership) {
      const allowed = WORKSPACE_ROLE_ACTIONS[membership.role]
      if (allowed?.has(action)) return true
    }
  }

  return false
}

/**
 * Assert permission — throws FORBIDDEN if user lacks the required access.
 */
export async function assertPermission(
  db: Database,
  userId: string,
  action: Action,
  resource?: Resource,
): Promise<void> {
  const allowed = await can(db, userId, action, resource)
  if (!allowed) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Permission denied: ${action}${resource ? ` on ${resource.type}` : ''}`,
    })
  }
}
