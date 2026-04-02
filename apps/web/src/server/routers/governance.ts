/**
 * Governance Router — user roles, workspace membership, audit log.
 */

import { auditEvents, userRoles, users, workspaceMembers } from '@solarc/db'
import { TRPCError } from '@trpc/server'
import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { auditEvent } from '../services/platform/audit'
import { assertPermission } from '../services/platform/permissions'
import { protectedProcedure, router } from '../trpc'

export const governanceRouter = router({
  // === User Management (platform_owner only) ===

  /** List all users with their global roles */
  listUsers: protectedProcedure.query(async ({ ctx }) => {
    await assertPermission(ctx.db, ctx.session.userId, 'admin')
    const allUsers = await ctx.db.query.users.findMany({
      orderBy: desc(users.createdAt),
    })
    const allRoles = await ctx.db.query.userRoles.findMany()
    const roleMap = new Map<string, string[]>()
    for (const r of allRoles) {
      const existing = roleMap.get(r.userId) ?? []
      existing.push(r.role)
      roleMap.set(r.userId, existing)
    }
    return allUsers.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      roles: roleMap.get(u.id) ?? [],
      createdAt: u.createdAt,
    }))
  }),

  /** Assign a global platform role to a user */
  assignGlobalRole: protectedProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        role: z.enum(['platform_owner', 'operator', 'viewer']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      // Check if role already assigned
      const existing = await ctx.db.query.userRoles.findFirst({
        where: and(eq(userRoles.userId, input.userId), eq(userRoles.role, input.role)),
      })
      if (existing) return { ok: true, message: 'Role already assigned' }

      await ctx.db.insert(userRoles).values({ userId: input.userId, role: input.role })
      await auditEvent(ctx.db, ctx.session.userId, 'assign_role', 'user', input.userId, {
        role: input.role,
      })
      return { ok: true }
    }),

  /** Remove a global platform role from a user */
  removeGlobalRole: protectedProcedure
    .input(z.object({ userId: z.string().uuid(), role: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      await ctx.db
        .delete(userRoles)
        .where(and(eq(userRoles.userId, input.userId), eq(userRoles.role, input.role)))
      await auditEvent(ctx.db, ctx.session.userId, 'remove_role', 'user', input.userId, {
        role: input.role,
      })
      return { ok: true }
    }),

  // === Workspace Membership ===

  /** List members of a workspace */
  getWorkspaceMembers: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const members = await ctx.db.query.workspaceMembers.findMany({
        where: eq(workspaceMembers.workspaceId, input.workspaceId),
      })
      // Enrich with user info
      const userIds = members.map((m) => m.userId)
      const memberUsers =
        userIds.length > 0
          ? await ctx.db.query.users.findMany({
              where: sql`${users.id} = ANY(${userIds})`,
            })
          : []
      const userMap = new Map(memberUsers.map((u) => [u.id, u]))
      return members.map((m) => ({
        id: m.id,
        userId: m.userId,
        email: userMap.get(m.userId)?.email ?? 'unknown',
        name: userMap.get(m.userId)?.name ?? null,
        role: m.role,
        createdAt: m.createdAt,
      }))
    }),

  /** Add a user to a workspace by email */
  addWorkspaceMember: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        email: z.string().email(),
        role: z.enum(['owner', 'operator', 'viewer']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'manage_members', {
        type: 'workspace',
        id: input.workspaceId,
      })
      // Find user by email
      const user = await ctx.db.query.users.findFirst({ where: eq(users.email, input.email) })
      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `User not found: ${input.email}` })
      }
      // Check if already a member
      const existing = await ctx.db.query.workspaceMembers.findFirst({
        where: and(
          eq(workspaceMembers.userId, user.id),
          eq(workspaceMembers.workspaceId, input.workspaceId),
        ),
      })
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'User is already a member' })
      }
      await ctx.db.insert(workspaceMembers).values({
        userId: user.id,
        workspaceId: input.workspaceId,
        role: input.role,
      })
      await auditEvent(
        ctx.db,
        ctx.session.userId,
        'add_workspace_member',
        'workspace',
        input.workspaceId,
        { email: input.email, role: input.role },
      )
      return { ok: true }
    }),

  /** Update a workspace member's role */
  updateMemberRole: protectedProcedure
    .input(
      z.object({
        memberId: z.string().uuid(),
        role: z.enum(['owner', 'operator', 'viewer']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.db.query.workspaceMembers.findFirst({
        where: eq(workspaceMembers.id, input.memberId),
      })
      if (!member) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' })

      await assertPermission(ctx.db, ctx.session.userId, 'manage_members', {
        type: 'workspace',
        id: member.workspaceId,
      })
      await ctx.db
        .update(workspaceMembers)
        .set({ role: input.role })
        .where(eq(workspaceMembers.id, input.memberId))
      await auditEvent(
        ctx.db,
        ctx.session.userId,
        'update_member_role',
        'workspace',
        member.workspaceId,
        { memberId: input.memberId, newRole: input.role },
      )
      return { ok: true }
    }),

  /** Remove a workspace member (prevents removing last owner) */
  removeMember: protectedProcedure
    .input(z.object({ memberId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.db.query.workspaceMembers.findFirst({
        where: eq(workspaceMembers.id, input.memberId),
      })
      if (!member) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' })

      await assertPermission(ctx.db, ctx.session.userId, 'manage_members', {
        type: 'workspace',
        id: member.workspaceId,
      })

      // Prevent removing the last owner
      if (member.role === 'owner') {
        const owners = await ctx.db.query.workspaceMembers.findMany({
          where: and(
            eq(workspaceMembers.workspaceId, member.workspaceId),
            eq(workspaceMembers.role, 'owner'),
          ),
        })
        if (owners.length <= 1) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Cannot remove the last owner',
          })
        }
      }

      await ctx.db.delete(workspaceMembers).where(eq(workspaceMembers.id, input.memberId))
      await auditEvent(
        ctx.db,
        ctx.session.userId,
        'remove_workspace_member',
        'workspace',
        member.workspaceId,
        { memberId: input.memberId },
      )
      return { ok: true }
    }),

  // === Audit Log ===

  /** Get audit events with pagination and filters */
  getAuditEvents: protectedProcedure
    .input(
      z.object({
        action: z.string().optional(),
        resourceType: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = []
      if (input.action) conditions.push(eq(auditEvents.action, input.action))
      if (input.resourceType) conditions.push(eq(auditEvents.resourceType, input.resourceType))

      const where = conditions.length > 0 ? and(...conditions) : undefined

      const events = await ctx.db.query.auditEvents.findMany({
        where,
        orderBy: desc(auditEvents.createdAt),
        limit: input.limit,
        offset: input.offset,
      })

      // Enrich with user emails
      const userIds = events.map((e) => e.userId).filter(Boolean) as string[]
      const eventUsers =
        userIds.length > 0
          ? await ctx.db.query.users.findMany({
              where: sql`${users.id} = ANY(${userIds})`,
            })
          : []
      const userMap = new Map(eventUsers.map((u) => [u.id, u]))

      return events.map((e) => ({
        id: e.id,
        userId: e.userId,
        userEmail: e.userId ? (userMap.get(e.userId)?.email ?? 'unknown') : 'system',
        action: e.action,
        resourceType: e.resourceType,
        resourceId: e.resourceId,
        metadata: e.metadata,
        createdAt: e.createdAt,
      }))
    }),

  /** Get current user's permissions summary */
  myPermissions: protectedProcedure.query(async ({ ctx }) => {
    const roles = await ctx.db.query.userRoles.findMany({
      where: eq(userRoles.userId, ctx.session.userId),
    })
    const memberships = await ctx.db.query.workspaceMembers.findMany({
      where: eq(workspaceMembers.userId, ctx.session.userId),
    })
    return {
      globalRoles: roles.map((r) => r.role),
      workspaceMemberships: memberships.map((m) => ({
        workspaceId: m.workspaceId,
        role: m.role,
      })),
      isPlatformOwner: roles.some((r) => r.role === 'platform_owner'),
    }
  }),
})
