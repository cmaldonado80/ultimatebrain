/**
 * Astrology Router — CRUD for persisted charts, reports, and relationships.
 *
 * All records are org-scoped. The astrology Development app calls these
 * via its proxy routes through the Brain web app's tRPC endpoint.
 */
import { astrologyCharts, astrologyRelationships, astrologyReports } from '@solarc/db'
import { TRPCError } from '@trpc/server'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { protectedProcedure, router } from '../trpc'

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
      return ctx.db.query.astrologyCharts.findMany({
        where: eq(astrologyCharts.organizationId, ctx.session.organizationId),
        orderBy: desc(astrologyCharts.createdAt),
        limit: input?.limit ?? 50,
      })
    }),

  /** Get single chart */
  getChart: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const chart = await ctx.db.query.astrologyCharts.findFirst({
        where: and(
          eq(astrologyCharts.id, input.id),
          eq(astrologyCharts.organizationId, ctx.session.organizationId),
        ),
      })
      if (!chart) throw new TRPCError({ code: 'NOT_FOUND' })
      return chart
    }),

  /** Delete a chart (cascades to reports) */
  deleteChart: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const chart = await ctx.db.query.astrologyCharts.findFirst({
        where: and(
          eq(astrologyCharts.id, input.id),
          eq(astrologyCharts.organizationId, ctx.session.organizationId),
        ),
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
      const conditions = [eq(astrologyReports.organizationId, ctx.session.organizationId)]
      if (input?.chartId) conditions.push(eq(astrologyReports.chartId, input.chartId))

      return ctx.db.query.astrologyReports.findMany({
        where: conditions.length > 1 ? and(...conditions) : conditions[0],
        orderBy: desc(astrologyReports.createdAt),
        limit: 50,
      })
    }),

  /** Get single report */
  getReport: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const report = await ctx.db.query.astrologyReports.findFirst({
        where: and(
          eq(astrologyReports.id, input.id),
          eq(astrologyReports.organizationId, ctx.session.organizationId),
        ),
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
    return ctx.db.query.astrologyRelationships.findMany({
      where: eq(astrologyRelationships.organizationId, ctx.session.organizationId),
      orderBy: desc(astrologyRelationships.createdAt),
      limit: 50,
    })
  }),

  /** Get single relationship */
  getRelationship: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rel = await ctx.db.query.astrologyRelationships.findFirst({
        where: and(
          eq(astrologyRelationships.id, input.id),
          eq(astrologyRelationships.organizationId, ctx.session.organizationId),
        ),
      })
      if (!rel) throw new TRPCError({ code: 'NOT_FOUND' })
      return rel
    }),
})
