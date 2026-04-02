/**
 * Organization Bootstrap — creates default org and backfills existing resources.
 *
 * Runs once at startup (idempotent). Ensures all existing data is assigned to
 * an organization so the platform can safely enforce org-scoped queries.
 */

import type { Database } from '@solarc/db'
import {
  brainEntities,
  deploymentWorkflows,
  entitySecrets,
  incidents,
  organizationMembers,
  organizations,
  userRoles,
  users,
  workspaces,
} from '@solarc/db'
import { eq, isNull } from 'drizzle-orm'

let _bootstrapped = false

/**
 * Ensure a default organization exists and all unscoped resources are assigned to it.
 * Idempotent — safe to call on every cold start.
 */
export async function ensureDefaultOrg(db: Database): Promise<string> {
  if (_bootstrapped) {
    const existing = await db.query.organizations.findFirst()
    return existing?.id ?? ''
  }
  _bootstrapped = true

  // Check if any org exists
  const existing = await db.query.organizations.findFirst()
  if (existing) return existing.id

  // Find the first platform_owner to be the org owner
  const ownerRole = await db.query.userRoles.findFirst({
    where: eq(userRoles.role, 'platform_owner'),
  })

  // Fallback to first user if no platform_owner
  const ownerUser = ownerRole
    ? await db.query.users.findFirst({ where: eq(users.id, ownerRole.userId) })
    : await db.query.users.findFirst()

  if (!ownerUser) {
    // No users yet — skip bootstrap, will run again on next request
    _bootstrapped = false
    return ''
  }

  // Create default organization
  const [org] = await db
    .insert(organizations)
    .values({
      name: 'Default',
      slug: 'default',
      status: 'active',
      ownerUserId: ownerUser.id,
    })
    .returning()

  if (!org) return ''

  // Add all existing users as members
  const allUsers = await db.query.users.findMany()
  const allRoles = await db.query.userRoles.findMany()
  const platformOwnerIds = new Set(
    allRoles.filter((r) => r.role === 'platform_owner').map((r) => r.userId),
  )

  for (const user of allUsers) {
    const role = platformOwnerIds.has(user.id) ? 'owner' : 'operator'
    try {
      await db.insert(organizationMembers).values({
        organizationId: org.id,
        userId: user.id,
        role,
      })
    } catch {
      // Skip duplicates
    }
  }

  // Backfill organizationId on existing resources
  const tables = [
    { table: workspaces, col: workspaces.organizationId },
    { table: brainEntities, col: brainEntities.organizationId },
    { table: deploymentWorkflows, col: deploymentWorkflows.organizationId },
    { table: incidents, col: incidents.organizationId },
    { table: entitySecrets, col: entitySecrets.organizationId },
  ] as const

  for (const { table, col } of tables) {
    try {
      await db
        .update(table)
        .set({ organizationId: org.id } as Record<string, unknown>)
        .where(isNull(col))
    } catch {
      // Table might not have the column yet during migration
    }
  }

  return org.id
}

/**
 * Resolve the active organization for a user.
 * Checks request header/cookie, validates membership, falls back to first org.
 */
export async function resolveActiveOrg(
  db: Database,
  userId: string,
  req?: Request,
): Promise<string> {
  // 1. Check x-org-id header
  const headerOrgId = req?.headers?.get('x-org-id')

  if (headerOrgId) {
    const membership = await db.query.organizationMembers.findFirst({
      where: (m, { and: a, eq: e }) => a(e(m.organizationId, headerOrgId), e(m.userId, userId)),
    })
    if (membership) return headerOrgId
  }

  // 2. Check active-org cookie
  const cookieHeader = req?.headers?.get('cookie') ?? ''
  const match = cookieHeader.match(/active-org=([a-f0-9-]+)/)
  if (match?.[1]) {
    const cookieOrgId = match[1]
    const membership = await db.query.organizationMembers.findFirst({
      where: (m, { and: a, eq: e }) => a(e(m.organizationId, cookieOrgId), e(m.userId, userId)),
    })
    if (membership) return cookieOrgId
  }

  // 3. Fallback to first org membership
  const firstMembership = await db.query.organizationMembers.findFirst({
    where: eq(organizationMembers.userId, userId),
  })
  if (firstMembership) return firstMembership.organizationId

  // 4. Bootstrap default org if needed
  const defaultOrgId = await ensureDefaultOrg(db)
  return defaultOrgId
}
