/**
 * Daily Briefing — generates a narrative summary of what happened in the last 24h.
 */
import type { Database } from '@solarc/db'
import { healingLogs, instinctObservations, instincts, tickets } from '@solarc/db'
import { and, eq, gte, sql } from 'drizzle-orm'

import { logger } from '../../../lib/logger'
import { notify } from '../platform/notification-service'

export async function generateDailyBriefing(db: Database): Promise<string> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  // Gather data
  const [healingActions] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(healingLogs)
    .where(gte(healingLogs.createdAt, oneDayAgo))
  const [completedTickets] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tickets)
    .where(and(eq(tickets.status, 'done'), gte(tickets.updatedAt, oneDayAgo)))
  const [failedTickets] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tickets)
    .where(and(eq(tickets.status, 'failed'), gte(tickets.updatedAt, oneDayAgo)))
  const [newInstincts] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(instincts)
    .where(and(eq(instincts.status, 'promoted'), gte(instincts.updatedAt, oneDayAgo)))
  const [totalObs] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(instinctObservations)
    .where(gte(instinctObservations.createdAt, oneDayAgo))

  // Get recent observations by type
  const recentObs = await db.query.instinctObservations.findMany({
    where: gte(instinctObservations.createdAt, oneDayAgo),
    limit: 500,
  })
  const obsByType: Record<string, number> = {}
  for (const o of recentObs) {
    obsByType[o.eventType] = (obsByType[o.eventType] ?? 0) + 1
  }

  const healing = healingActions?.count ?? 0
  const completed = completedTickets?.count ?? 0
  const failed = failedTickets?.count ?? 0
  const promoted = newInstincts?.count ?? 0
  const observations = totalObs?.count ?? 0

  // Build briefing
  const sections: string[] = [
    `# Daily Briefing — ${new Date().toLocaleDateString()}`,
    '',
    `## Work`,
    `- **${completed}** tickets completed, **${failed}** failed`,
    completed + failed > 0
      ? `- Success rate: ${Math.round((completed / Math.max(completed + failed, 1)) * 100)}%`
      : '',
    '',
    `## Healing`,
    `- **${healing}** healing actions taken`,
    '',
    `## Learning`,
    `- **${promoted}** new instincts promoted`,
    `- **${observations}** observations recorded`,
    Object.entries(obsByType).length > 0
      ? `- Active loops: ${Object.entries(obsByType)
          .map(([k, v]) => `${k} (${v})`)
          .join(', ')}`
      : '- No active learning loops in last 24h',
    '',
    `## Status`,
    healing === 0 && failed === 0
      ? '- All systems nominal'
      : healing > 5
        ? '- Elevated healing activity — monitor closely'
        : '- Normal operations',
  ]

  const briefing = sections.filter(Boolean).join('\n')

  // Deliver via notification
  await notify(db, 'daily_briefing', 'Daily Briefing', briefing, 'info', {
    channels: ['inbox'],
  }).catch(() => {})

  logger.info({ completed, failed, healing, promoted, observations }, 'daily-briefing: generated')

  return briefing
}
