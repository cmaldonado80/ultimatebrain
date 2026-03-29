/**
 * System Inspector — queries actual system state for a domain.
 *
 * Inspects brainEntities, pg_tables, factory templates, and entity agents
 * to determine what exists for a given domain.
 */

import type { Database } from '@solarc/db'
import { brainEntities, brainEntityAgents } from '@solarc/db'
import { eq, sql } from 'drizzle-orm'

import { MiniBrainFactory } from '../../services/mini-brain-factory/factory'

// ── Types ─────────────────────────────────────────────────────────────

export interface DomainState {
  domain: string
  hasMiniBrain: boolean
  hasApp: boolean
  miniBrainStatus: string | null
  appStatus: string | null
  registeredRoutes: string[]
  existingTables: string[]
  suggestedPages: string[]
  templateId: string | null
  agentCount: number
  entityCount: number
}

// ── Inspection ───────────────────────────────────────────────────────

let _factory: MiniBrainFactory | null = null

export async function inspectDomainState(db: Database, domain: string): Promise<DomainState> {
  const domainLower = domain.toLowerCase()

  // 1. Check brainEntities for this domain
  const entities = await db.query.brainEntities.findMany({
    where: eq(brainEntities.domain, domainLower),
  })

  const miniBrain = entities.find((e) => e.tier === 'mini_brain')
  const app = entities.find((e) => e.tier === 'development')

  // 2. Count agents linked to domain entities
  let agentCount = 0
  for (const entity of entities) {
    const agents = await db.query.brainEntityAgents.findMany({
      where: eq(brainEntityAgents.entityId, entity.id),
    })
    agentCount += agents.length
  }

  // 3. Check for domain-specific tables in the database
  const tableResult = await db.execute(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE ${`${domainLower}%`}`,
  )
  const existingTables = (tableResult.rows as Array<{ tablename: string }>).map((r) => r.tablename)

  // 4. Get template info from factory
  _factory ??= new MiniBrainFactory()
  const template = _factory.getTemplate(domainLower as Parameters<typeof _factory.getTemplate>[0])
  const templateId = template?.id ?? null

  // 5. Determine routes from template definition
  const registeredRoutes: string[] = []
  if (template) {
    // Standard routes based on template engines
    registeredRoutes.push(`/${domainLower}/example`)
    // Known routes for astrology (hardcoded reference)
    if (domainLower === 'astrology') {
      registeredRoutes.push(
        '/astrology/natal-summary',
        '/astrology/report',
        '/astrology/transits',
        '/astrology/timeline',
        '/astrology/synastry',
      )
    }
  }

  // 6. Suggest pages based on what a complete product needs
  const suggestedPages = [
    '/dashboard',
    `/${domainLower}`,
    `/${domainLower}/[id]`,
    '/reports',
    '/reports/[id]',
  ]

  return {
    domain: domainLower,
    hasMiniBrain: !!miniBrain,
    hasApp: !!app,
    miniBrainStatus: miniBrain?.status ?? null,
    appStatus: app?.status ?? null,
    registeredRoutes,
    existingTables,
    suggestedPages,
    templateId,
    agentCount,
    entityCount: entities.length,
  }
}
