/**
 * Organizations Router — multi-tenant org management.
 *
 * CRUD for organizations, membership management, and org switching.
 */
import { organizationMembers, organizations, userRoles, users } from '@solarc/db'
import { TRPCError } from '@trpc/server'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { auditEvent } from '../services/platform/audit'
import { protectedProcedure, router } from '../trpc'

export const organizationsRouter = router({
  /** List organizations the current user belongs to */
  list: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db.query.organizationMembers.findMany({
      where: eq(organizationMembers.userId, ctx.session.userId),
    })
    if (memberships.length === 0) return []

    const orgIds = memberships.map((m) => m.organizationId)
    const memberOrgs = await ctx.db.query.organizations.findMany({
      where: inArray(organizations.id, orgIds),
    })

    return memberOrgs.map((org) => ({
      ...org,
      role: memberships.find((m) => m.organizationId === org.id)?.role ?? 'viewer',
      isActive: org.id === ctx.session.organizationId,
    }))
  }),

  /** Get single organization */
  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.query.organizations.findFirst({
        where: eq(organizations.id, input.id),
      })
      if (!org) throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' })
      return org
    }),

  /** Create a new organization */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        slug: z
          .string()
          .min(2)
          .max(50)
          .regex(/^[a-z0-9-]+$/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check slug uniqueness
      const existing = await ctx.db.query.organizations.findFirst({
        where: eq(organizations.slug, input.slug),
      })
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Slug already taken' })
      }

      const [org] = await ctx.db
        .insert(organizations)
        .values({
          name: input.name,
          slug: input.slug,
          ownerUserId: ctx.session.userId,
        })
        .returning()

      if (!org) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create' })

      // Add creator as owner member
      await ctx.db.insert(organizationMembers).values({
        organizationId: org.id,
        userId: ctx.session.userId,
        role: 'owner',
      })

      await auditEvent(ctx.db, ctx.session.userId, 'create_org', 'organization', org.id, {
        name: input.name,
        slug: input.slug,
      })

      return org
    }),

  /** Update organization name/slug */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        slug: z
          .string()
          .min(2)
          .max(50)
          .regex(/^[a-z0-9-]+$/)
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check membership with admin+ role
      const membership = await ctx.db.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.organizationId, input.id),
          eq(organizationMembers.userId, ctx.session.userId),
        ),
      })
      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Must be org owner or admin' })
      }

      const { id, ...fields } = input
      if (fields.slug) {
        const existing = await ctx.db.query.organizations.findFirst({
          where: eq(organizations.slug, fields.slug),
        })
        if (existing && existing.id !== id) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Slug already taken' })
        }
      }

      const [updated] = await ctx.db
        .update(organizations)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(organizations.id, id))
        .returning()

      await auditEvent(ctx.db, ctx.session.userId, 'update_org', 'organization', id, fields)
      return updated
    }),

  /** List members of an organization */
  getMembers: protectedProcedure
    .input(z.object({ organizationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const members = await ctx.db.query.organizationMembers.findMany({
        where: eq(organizationMembers.organizationId, input.organizationId),
      })

      // Enrich with user emails
      const enriched = await Promise.all(
        members.map(async (m) => {
          const user = await ctx.db.query.users.findFirst({
            where: eq(users.id, m.userId),
          })
          return {
            id: m.id,
            userId: m.userId,
            email: user?.email ?? 'unknown',
            name: user?.name ?? null,
            role: m.role,
            joinedAt: m.joinedAt,
          }
        }),
      )
      return enriched
    }),

  /** Add a member by email */
  addMember: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        email: z.string().email(),
        role: z.enum(['admin', 'operator', 'viewer']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check caller is admin+
      const callerMembership = await ctx.db.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.organizationId, input.organizationId),
          eq(organizationMembers.userId, ctx.session.userId),
        ),
      })
      if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Must be org owner or admin' })
      }

      const user = await ctx.db.query.users.findFirst({
        where: eq(users.email, input.email),
      })
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' })

      // Check not already member
      const existing = await ctx.db.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.organizationId, input.organizationId),
          eq(organizationMembers.userId, user.id),
        ),
      })
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Already a member' })

      const [member] = await ctx.db
        .insert(organizationMembers)
        .values({
          organizationId: input.organizationId,
          userId: user.id,
          role: input.role,
        })
        .returning()

      await auditEvent(
        ctx.db,
        ctx.session.userId,
        'add_org_member',
        'organization',
        input.organizationId,
        { addedUserId: user.id, role: input.role },
      )

      return member
    }),

  /** Update a member's role */
  updateMemberRole: protectedProcedure
    .input(
      z.object({
        memberId: z.string().uuid(),
        role: z.enum(['admin', 'operator', 'viewer']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.db.query.organizationMembers.findFirst({
        where: eq(organizationMembers.id, input.memberId),
      })
      if (!member) throw new TRPCError({ code: 'NOT_FOUND' })

      // Check caller is admin+
      const callerMembership = await ctx.db.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.organizationId, member.organizationId),
          eq(organizationMembers.userId, ctx.session.userId),
        ),
      })
      if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      await ctx.db
        .update(organizationMembers)
        .set({ role: input.role })
        .where(eq(organizationMembers.id, input.memberId))

      await auditEvent(
        ctx.db,
        ctx.session.userId,
        'update_org_member_role',
        'organization',
        member.organizationId,
        { memberId: input.memberId, newRole: input.role },
      )
      return { updated: true }
    }),

  /** Remove a member */
  removeMember: protectedProcedure
    .input(z.object({ memberId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.db.query.organizationMembers.findFirst({
        where: eq(organizationMembers.id, input.memberId),
      })
      if (!member) throw new TRPCError({ code: 'NOT_FOUND' })

      // Prevent removing last owner
      if (member.role === 'owner') {
        const owners = await ctx.db.query.organizationMembers.findMany({
          where: and(
            eq(organizationMembers.organizationId, member.organizationId),
            eq(organizationMembers.role, 'owner'),
          ),
        })
        if (owners.length <= 1) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot remove last owner' })
        }
      }

      // Check caller is admin+
      const callerMembership = await ctx.db.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.organizationId, member.organizationId),
          eq(organizationMembers.userId, ctx.session.userId),
        ),
      })
      if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      await ctx.db.delete(organizationMembers).where(eq(organizationMembers.id, input.memberId))

      await auditEvent(
        ctx.db,
        ctx.session.userId,
        'remove_org_member',
        'organization',
        member.organizationId,
        { removedUserId: member.userId },
      )
      return { removed: true }
    }),

  /** Get the current user's global platform role */
  getGlobalRole: protectedProcedure.query(async ({ ctx }) => {
    const userRole = await ctx.db.query.userRoles.findFirst({
      where: eq(userRoles.userId, ctx.session.userId),
    })
    return {
      role: userRole?.role ?? 'viewer',
      isPlatformOwner: userRole?.role === 'platform_owner',
    }
  }),
})
