/**
 * Admin Router — platform_owner only cross-org inspection.
 *
 * All procedures require the 'admin' global action (platform_owner role only).
 * These bypass the session's organizationId filter to return cross-org data.
 */

import { organizationMembers, organizations, users } from '@solarc/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { assertPermission } from '../services/platform/permissions'
import { protectedProcedure, router } from '../trpc'

export const adminRouter = router({
  /** List ALL organizations across the platform */
  listAllOrgs: protectedProcedure.query(async ({ ctx }) => {
    await assertPermission(ctx.db, ctx.session.userId, 'admin')
    return ctx.db.query.organizations.findMany({
      orderBy: (orgs, { desc }) => [desc(orgs.createdAt)],
    })
  }),

  /** Get a single org by ID (platform_owner can access any org) */
  getOrgById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      const org = await ctx.db.query.organizations.findFirst({
        where: eq(organizations.id, input.id),
      })
      if (!org) {
        const { TRPCError } = await import('@trpc/server')
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' })
      }
      return org
    }),

  /** List members of any org by ID */
  listOrgMembers: protectedProcedure
    .input(z.object({ organizationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      const members = await ctx.db.query.organizationMembers.findMany({
        where: eq(organizationMembers.organizationId, input.organizationId),
      })
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

  /** List ALL users on the platform */
  listAllUsers: protectedProcedure.query(async ({ ctx }) => {
    await assertPermission(ctx.db, ctx.session.userId, 'admin')
    return ctx.db.query.users.findMany({
      orderBy: (u, { desc }) => [desc(u.createdAt)],
    })
  }),
})
