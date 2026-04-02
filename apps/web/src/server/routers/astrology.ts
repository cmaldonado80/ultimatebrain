/**
 * Astrology Router — CRUD for persisted charts, reports, and relationships.
 *
 * All records are org-scoped. The astrology Development app calls these
 * via its proxy routes through the Brain web app's tRPC endpoint.
 */
import {
  astrologyCharts,
  astrologyEngagement,
  astrologyRelationships,
  astrologyReports,
  astrologyShareTokens,
} from '@solarc/db'
import { TRPCError } from '@trpc/server'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'

import { protectedProcedure, publicProcedure, router } from '../trpc'

export const astrologyRouter = router({
  // ── Charts ──────────────────────────────────────────────────────────

  /** Save a computed chart */
  createChart: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        birthDate: z.string(),
        birthTime: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        timezone: z.number().optional(),
        chartData: z.record(z.unknown()),
        highlights: z.record(z.unknown()).optional(),
        summary: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [chart] = await ctx.db
        .insert(astrologyCharts)
        .values({
          ...input,
          organizationId: ctx.session.organizationId,
          createdByUserId: ctx.session.userId,
        })
        .returning()
      if (!chart) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      return chart
    }),

  /** List charts for current org */
  listCharts: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const orgId = ctx.session.organizationId
      return ctx.db.query.astrologyCharts.findMany({
        where: orgId ? eq(astrologyCharts.organizationId, orgId) : undefined,
        orderBy: desc(astrologyCharts.createdAt),
        limit: input?.limit ?? 50,
      })
    }),

  /** Get single chart */
  getChart: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.session.organizationId
      const chart = await ctx.db.query.astrologyCharts.findFirst({
        where: orgId
          ? and(eq(astrologyCharts.id, input.id), eq(astrologyCharts.organizationId, orgId))
          : eq(astrologyCharts.id, input.id),
      })
      if (!chart) throw new TRPCError({ code: 'NOT_FOUND' })
      return chart
    }),

  /** Delete a chart (cascades to reports) */
  deleteChart: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.session.organizationId
      const chart = await ctx.db.query.astrologyCharts.findFirst({
        where: orgId
          ? and(eq(astrologyCharts.id, input.id), eq(astrologyCharts.organizationId, orgId))
          : eq(astrologyCharts.id, input.id),
      })
      if (!chart) throw new TRPCError({ code: 'NOT_FOUND' })
      await ctx.db.delete(astrologyCharts).where(eq(astrologyCharts.id, input.id))
      return { deleted: true }
    }),

  // ── Reports ─────────────────────────────────────────────────────────

  /** Save a generated report */
  createReport: protectedProcedure
    .input(
      z.object({
        chartId: z.string().uuid(),
        reportType: z.string().default('natal'),
        sections: z.array(z.record(z.unknown())),
        summary: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify chart belongs to org
      const chart = await ctx.db.query.astrologyCharts.findFirst({
        where: and(
          eq(astrologyCharts.id, input.chartId),
          eq(astrologyCharts.organizationId, ctx.session.organizationId),
        ),
      })
      if (!chart) throw new TRPCError({ code: 'NOT_FOUND', message: 'Chart not found' })

      const [report] = await ctx.db
        .insert(astrologyReports)
        .values({
          chartId: input.chartId,
          reportType: input.reportType,
          sections: input.sections,
          summary: input.summary,
          organizationId: ctx.session.organizationId,
        })
        .returning()
      if (!report) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      return report
    }),

  /** List reports for a chart */
  listReports: protectedProcedure
    .input(z.object({ chartId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const orgId = ctx.session.organizationId
      const conditions = []
      if (orgId) conditions.push(eq(astrologyReports.organizationId, orgId))
      if (input?.chartId) conditions.push(eq(astrologyReports.chartId, input.chartId))

      return ctx.db.query.astrologyReports.findMany({
        where: conditions.length > 1 ? and(...conditions) : (conditions[0] ?? undefined),
        orderBy: desc(astrologyReports.createdAt),
        limit: 50,
      })
    }),

  /** Get single report */
  getReport: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.session.organizationId
      const report = await ctx.db.query.astrologyReports.findFirst({
        where: orgId
          ? and(eq(astrologyReports.id, input.id), eq(astrologyReports.organizationId, orgId))
          : eq(astrologyReports.id, input.id),
      })
      if (!report) throw new TRPCError({ code: 'NOT_FOUND' })
      return report
    }),

  // ── Relationships ───────────────────────────────────────────────────

  /** Save a synastry analysis */
  createRelationship: protectedProcedure
    .input(
      z.object({
        personAName: z.string().min(1),
        personAData: z.record(z.unknown()),
        personBName: z.string().min(1),
        personBData: z.record(z.unknown()),
        compatibilityScore: z.number().optional(),
        synastryData: z.record(z.unknown()).optional(),
        narrative: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [rel] = await ctx.db
        .insert(astrologyRelationships)
        .values({
          ...input,
          organizationId: ctx.session.organizationId,
          createdByUserId: ctx.session.userId,
        })
        .returning()
      if (!rel) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      return rel
    }),

  /** List relationships for current org */
  listRelationships: protectedProcedure.query(async ({ ctx }) => {
    const orgId = ctx.session.organizationId
    return ctx.db.query.astrologyRelationships.findMany({
      where: orgId ? eq(astrologyRelationships.organizationId, orgId) : undefined,
      orderBy: desc(astrologyRelationships.createdAt),
      limit: 50,
    })
  }),

  /** Get single relationship */
  getRelationship: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.session.organizationId
      const rel = await ctx.db.query.astrologyRelationships.findFirst({
        where: orgId
          ? and(
              eq(astrologyRelationships.id, input.id),
              eq(astrologyRelationships.organizationId, orgId),
            )
          : eq(astrologyRelationships.id, input.id),
      })
      if (!rel) throw new TRPCError({ code: 'NOT_FOUND' })
      return rel
    }),

  // ── Sharing ─────────────────────────────────────────────────────────

  /** Create a share token for a report or relationship */
  createShareToken: protectedProcedure
    .input(
      z.object({
        resourceType: z.enum(['report', 'relationship']),
        resourceId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify resource exists and belongs to user's org
      if (input.resourceType === 'report') {
        const report = await ctx.db.query.astrologyReports.findFirst({
          where: and(
            eq(astrologyReports.id, input.resourceId),
            eq(astrologyReports.organizationId, ctx.session.organizationId),
          ),
        })
        if (!report) throw new TRPCError({ code: 'NOT_FOUND' })
      } else {
        const rel = await ctx.db.query.astrologyRelationships.findFirst({
          where: and(
            eq(astrologyRelationships.id, input.resourceId),
            eq(astrologyRelationships.organizationId, ctx.session.organizationId),
          ),
        })
        if (!rel) throw new TRPCError({ code: 'NOT_FOUND' })
      }

      const token = crypto.randomUUID().replace(/-/g, '')

      const [shareToken] = await ctx.db
        .insert(astrologyShareTokens)
        .values({
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          token,
          createdByUserId: ctx.session.userId,
          organizationId: ctx.session.organizationId,
        })
        .returning()

      if (!shareToken) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      return { token, id: shareToken.id }
    }),

  /** Get a shared resource by token (PUBLIC — no auth required) */
  getSharedResource: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const shareToken = await ctx.db.query.astrologyShareTokens.findFirst({
        where: and(
          eq(astrologyShareTokens.token, input.token),
          isNull(astrologyShareTokens.revokedAt),
        ),
      })
      if (!shareToken)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Link not found or revoked' })

      if (shareToken.resourceType === 'report') {
        const report = await ctx.db.query.astrologyReports.findFirst({
          where: eq(astrologyReports.id, shareToken.resourceId),
        })
        if (!report) throw new TRPCError({ code: 'NOT_FOUND' })
        return {
          type: 'report' as const,
          reportType: report.reportType,
          sections: report.sections,
          summary: report.summary,
          createdAt: report.createdAt,
        }
      }

      const rel = await ctx.db.query.astrologyRelationships.findFirst({
        where: eq(astrologyRelationships.id, shareToken.resourceId),
      })
      if (!rel) throw new TRPCError({ code: 'NOT_FOUND' })
      return {
        type: 'relationship' as const,
        personAName: rel.personAName,
        personBName: rel.personBName,
        compatibilityScore: rel.compatibilityScore,
        synastryData: rel.synastryData,
        narrative: rel.narrative,
        createdAt: rel.createdAt,
      }
    }),

  /** Revoke a share token */
  revokeShareToken: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const token = await ctx.db.query.astrologyShareTokens.findFirst({
        where: and(
          eq(astrologyShareTokens.id, input.id),
          eq(astrologyShareTokens.organizationId, ctx.session.organizationId),
        ),
      })
      if (!token) throw new TRPCError({ code: 'NOT_FOUND' })
      await ctx.db
        .update(astrologyShareTokens)
        .set({ revokedAt: new Date() })
        .where(eq(astrologyShareTokens.id, input.id))
      return { revoked: true }
    }),

  // ── Engagement ──────────────────────────────────────────────────────

  /** Get last-seen timestamp for a chart */
  getLastSeen: protectedProcedure
    .input(z.object({ chartId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const record = await ctx.db.query.astrologyEngagement.findFirst({
        where: and(
          eq(astrologyEngagement.userId, ctx.session.userId),
          eq(astrologyEngagement.chartId, input.chartId),
        ),
      })
      return record ? { lastSeenAt: record.lastSeenAt.toISOString() } : null
    }),

  /** Update last-seen timestamp (upsert) */
  updateLastSeen: protectedProcedure
    .input(z.object({ chartId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.astrologyEngagement.findFirst({
        where: and(
          eq(astrologyEngagement.userId, ctx.session.userId),
          eq(astrologyEngagement.chartId, input.chartId),
        ),
      })

      const now = new Date()
      if (existing) {
        await ctx.db
          .update(astrologyEngagement)
          .set({ lastSeenAt: now })
          .where(eq(astrologyEngagement.id, existing.id))
      } else {
        await ctx.db.insert(astrologyEngagement).values({
          userId: ctx.session.userId,
          chartId: input.chartId,
          lastSeenAt: now,
        })
      }

      return { lastSeenAt: now.toISOString() }
    }),
})
