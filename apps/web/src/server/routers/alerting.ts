/**
 * Alerting Router — alert rules, incidents, and evaluation.
 *
 * Turns runtime status observability into actionable operations:
 * - Define alert rules (threshold-based)
 * - Track incidents with lifecycle (triggered → acknowledged → resolved)
 * - Auto-create incidents from rule breaches
 * - Auto-resolve when issues clear
 */

import { alertRules, incidents } from '@solarc/db'
import { and, desc, eq, ne, sql } from 'drizzle-orm'
import { z } from 'zod'

import { auditEvent } from '../services/platform/audit'
import { assertPermission } from '../services/platform/permissions'
import { protectedProcedure, router } from '../trpc'

export const alertingRouter = router({
  // === Alert Rules ===

  /** List all alert rules */
  getAlertRules: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.alertRules.findMany({
      orderBy: desc(alertRules.createdAt),
    })
  }),

  /** Create an alert rule (admin only) */
  createAlertRule: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        serviceScope: z.string(),
        condition: z.enum(['down', 'degraded', 'latency', 'error_rate']),
        threshold: z.number(),
        windowMinutes: z.number().min(1).max(60).default(5),
        severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      const [rule] = await ctx.db
        .insert(alertRules)
        .values({ ...input, createdBy: ctx.session.userId })
        .returning()
      await auditEvent(
        ctx.db,
        ctx.session.userId,
        'create_alert_rule',
        'alert_rule',
        rule?.id ?? null,
        {
          name: input.name,
          condition: input.condition,
        },
      )
      return rule
    }),

  /** Delete an alert rule (admin only) */
  deleteAlertRule: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'admin')
      await ctx.db.delete(alertRules).where(eq(alertRules.id, input.id))
      await auditEvent(ctx.db, ctx.session.userId, 'delete_alert_rule', 'alert_rule', input.id)
      return { ok: true }
    }),

  // === Incidents ===

  /** List incidents with optional status/severity filter */
  getIncidents: protectedProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          severity: z.string().optional(),
          limit: z.number().min(1).max(100).default(20),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const conditions = []
      if (input?.status) conditions.push(eq(incidents.status, input.status))
      if (input?.severity)
        conditions.push(
          eq(incidents.severity, input.severity as 'low' | 'medium' | 'high' | 'critical'),
        )
      const where = conditions.length > 0 ? and(...conditions) : undefined

      return ctx.db.query.incidents.findMany({
        where,
        orderBy: desc(incidents.triggeredAt),
        limit: input?.limit ?? 20,
      })
    }),

  /** Get active incidents (triggered or acknowledged) */
  getActiveIncidents: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.incidents.findMany({
      where: ne(incidents.status, 'resolved'),
      orderBy: desc(incidents.triggeredAt),
      limit: 50,
    })
  }),

  /** Acknowledge an incident */
  acknowledgeIncident: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(incidents)
        .set({
          status: 'acknowledged',
          acknowledgedAt: new Date(),
          acknowledgedBy: ctx.session.userId,
        })
        .where(eq(incidents.id, input.id))
      await auditEvent(ctx.db, ctx.session.userId, 'acknowledge_incident', 'incident', input.id)
      return { ok: true }
    }),

  /** Resolve an incident */
  resolveIncident: protectedProcedure
    .input(z.object({ id: z.string().uuid(), resolution: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(incidents)
        .set({
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedBy: ctx.session.userId,
          message: input.resolution
            ? sql`COALESCE(${incidents.message}, '') || ' | Resolution: ' || ${input.resolution}`
            : incidents.message,
        })
        .where(eq(incidents.id, input.id))
      await auditEvent(ctx.db, ctx.session.userId, 'resolve_incident', 'incident', input.id, {
        resolution: input.resolution,
      })
      return { ok: true }
    }),

  /** Evaluate alert rules against current runtime status and create/resolve incidents */
  evaluateAlerts: protectedProcedure.mutation(async ({ ctx }) => {
    const rules = await ctx.db.query.alertRules.findMany({
      where: eq(alertRules.enabled, true),
    })
    if (rules.length === 0) return { evaluated: 0, created: 0, resolved: 0 }

    // Get current runtime status (reuse the health check infrastructure)
    const entities = await ctx.db.query.brainEntities.findMany({ limit: 200 })
    const activeIncidents = await ctx.db.query.incidents.findMany({
      where: ne(incidents.status, 'resolved'),
    })

    let created = 0
    let resolved = 0

    // Brain self-check
    let brainOk = false
    try {
      await ctx.db.execute(sql`SELECT 1`)
      brainOk = true
    } catch {
      brainOk = false
    }

    const serviceStatuses = new Map<string, 'ok' | 'degraded' | 'down' | 'unknown'>()
    serviceStatuses.set('brain-core', brainOk ? 'ok' : 'down')
    for (const entity of entities) {
      serviceStatuses.set(entity.id, entity.status === 'active' ? 'ok' : 'degraded')
    }

    for (const rule of rules) {
      // Determine which services to check
      const targets =
        rule.serviceScope === 'all'
          ? [...serviceStatuses.entries()]
          : rule.serviceScope === 'brain'
            ? [['brain-core', serviceStatuses.get('brain-core') ?? 'unknown'] as [string, string]]
            : rule.serviceScope === 'mini_brain'
              ? entities
                  .filter((e) => e.tier === 'mini_brain')
                  .map((e) => [e.id, serviceStatuses.get(e.id) ?? 'unknown'] as [string, string])
              : [
                  [rule.serviceScope, serviceStatuses.get(rule.serviceScope) ?? 'unknown'] as [
                    string,
                    string,
                  ],
                ]

      for (const [serviceId, status] of targets) {
        const breached =
          (rule.condition === 'down' && status === 'down') ||
          (rule.condition === 'degraded' && (status === 'degraded' || status === 'down'))

        const existingIncident = activeIncidents.find(
          (i) => i.ruleId === rule.id && i.serviceId === serviceId,
        )

        if (breached && !existingIncident) {
          // Create new incident
          const serviceName =
            serviceId === 'brain-core'
              ? 'Solarc Brain'
              : (entities.find((e) => e.id === serviceId)?.name ?? serviceId)
          await ctx.db.insert(incidents).values({
            ruleId: rule.id,
            serviceId,
            serviceName,
            severity: rule.severity,
            status: 'triggered',
            message: `${rule.name}: ${rule.condition} detected on ${serviceName}`,
          })
          created++
        } else if (!breached && existingIncident) {
          // Auto-resolve
          await ctx.db
            .update(incidents)
            .set({
              status: 'resolved',
              resolvedAt: new Date(),
              message: existingIncident.message + ' | Auto-resolved: condition cleared',
            })
            .where(eq(incidents.id, existingIncident.id))
          resolved++
        }
      }
    }

    return { evaluated: rules.length, created, resolved }
  }),
})
