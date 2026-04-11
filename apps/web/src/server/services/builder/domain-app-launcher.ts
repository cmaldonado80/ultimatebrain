/**
 * Domain App Launcher — unified flow that chains:
 * 1. Template detection (LLM infers domain from brief)
 * 2. SmartCreate (entity + workspace + agents)
 * 3. Project Builder (decompose + materialize + execute)
 *
 * Single entry point: "Build an astrology website with natal charts"
 * → detects astrology template → creates Mini Brain → creates project → agents build
 */

import type { Database } from '@solarc/db'
import { agents, workspaces } from '@solarc/db'
import { eq } from 'drizzle-orm'

import { logger } from '../../../lib/logger'
import {
  decomposeProject,
  executeNextWave,
  materializeProject,
} from '../orchestration/project-orchestrator'

// ── Types ────────────────────────────────────────────────────────────────

export type DomainTemplate =
  | 'astrology'
  | 'hospitality'
  | 'healthcare'
  | 'marketing'
  | 'soc-ops'
  | 'design'
  | 'engineering'

export interface LaunchResult {
  entityId: string | null
  workspaceId: string
  workspaceName: string
  projectId: string
  ticketCount: number
  template: DomainTemplate | null
  agentCount: number
  status: 'launched' | 'project_only'
}

// ── Template detection ───────────────────────────────────────────────────

const DOMAIN_KEYWORDS: Record<DomainTemplate, string[]> = {
  astrology: [
    'astrology',
    'horoscope',
    'natal chart',
    'zodiac',
    'birth chart',
    'transit',
    'synastry',
    'compatibility',
    'ephemeris',
    'planets',
    'houses',
    'signs',
  ],
  hospitality: [
    'hotel',
    'restaurant',
    'hospitality',
    'resort',
    'booking',
    'reservation',
    'guest',
    'room',
    'menu',
    'dining',
    'concierge',
    'check-in',
  ],
  healthcare: [
    'health',
    'medical',
    'clinic',
    'patient',
    'doctor',
    'appointment',
    'diagnosis',
    'prescription',
    'wellness',
    'telemedicine',
  ],
  marketing: [
    'marketing',
    'campaign',
    'social media',
    'ads',
    'brand',
    'content',
    'seo',
    'analytics',
    'leads',
    'conversion',
    'newsletter',
  ],
  'soc-ops': [
    'security',
    'soc',
    'threat',
    'incident',
    'vulnerability',
    'compliance',
    'audit',
    'firewall',
    'monitor',
    'alert',
  ],
  design: [
    'design',
    'ui',
    'ux',
    'prototype',
    'wireframe',
    'figma',
    'branding',
    'visual',
    'typography',
    'illustration',
  ],
  engineering: [
    'engineering',
    'software',
    'api',
    'backend',
    'frontend',
    'database',
    'microservice',
    'devops',
    'ci/cd',
    'architecture',
  ],
}

export function detectTemplate(brief: string): DomainTemplate | null {
  const lower = brief.toLowerCase()
  let bestMatch: DomainTemplate | null = null
  let bestScore = 0

  for (const [template, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const score = keywords.filter((k) => lower.includes(k)).length
    if (score > bestScore) {
      bestScore = score
      bestMatch = template as DomainTemplate
    }
  }

  return bestScore >= 1 ? bestMatch : null
}

// ── Find or create workspace ─────────────────────────────────────────────

async function findExistingWorkspace(
  db: Database,
  template: DomainTemplate,
): Promise<{ workspaceId: string; name: string; agentCount: number } | null> {
  // Look for an existing workspace that matches this domain
  const existing = await db.query.workspaces.findMany({
    where: eq(workspaces.icon, template),
  })

  if (existing.length === 0) return null

  const ws = existing[0]!
  const wsAgents = await db.query.agents.findMany({
    where: eq(agents.workspaceId, ws.id),
  })

  return {
    workspaceId: ws.id,
    name: ws.name,
    agentCount: wsAgents.length,
  }
}

// ── Main launch flow ─────────────────────────────────────────────────────

export async function launchDomainApp(
  db: Database,
  opts: {
    brief: string
    template?: DomainTemplate
    name?: string
    userId?: string
    organizationId?: string
  },
): Promise<LaunchResult> {
  const { brief } = opts
  const template = opts.template ?? detectTemplate(brief)

  logger.info({ brief: brief.slice(0, 80), template }, '[DomainAppLauncher] Starting launch')

  // 1 — Check for existing workspace for this domain
  let workspaceId: string | null = null
  let workspaceName = ''
  let entityId: string | null = null
  let agentCount = 0

  if (template) {
    const existing = await findExistingWorkspace(db, template)
    if (existing) {
      workspaceId = existing.workspaceId
      workspaceName = existing.name
      agentCount = existing.agentCount
      logger.info(
        { workspaceId, name: workspaceName, agents: agentCount },
        '[DomainAppLauncher] Found existing workspace',
      )
    }
  }

  // 2 — If no existing workspace, create via SmartCreate
  if (!workspaceId && template) {
    try {
      const { smartCreateMiniBrain } = await import('./smart-create-helper')
      const result = await smartCreateMiniBrain(db, {
        template,
        name: opts.name ?? `${template.charAt(0).toUpperCase() + template.slice(1)} Department`,
        userId: opts.userId,
        organizationId: opts.organizationId,
      })
      workspaceId = result.workspaceId
      workspaceName = result.workspaceName
      entityId = result.entityId
      agentCount = result.agentCount
      logger.info(
        { entityId, workspaceId, agents: agentCount },
        '[DomainAppLauncher] Created new Mini Brain',
      )
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : undefined },
        '[DomainAppLauncher] SmartCreate failed, will use general workspace',
      )
    }
  }

  // 2b — Auto-provision domain database tables (uses fallback schema, no LLM call)
  if (template && workspaceId) {
    try {
      const { executeSqlBatch } = await import('./database-builder')
      // Use simple fallback tables to avoid LLM timeout during launch
      const prefix = template.toLowerCase()
      const fallbackSql = [
        `CREATE TABLE IF NOT EXISTS ${prefix}_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, name text NOT NULL, description text, data jsonb DEFAULT '{}', status text DEFAULT 'active', created_by_user_id uuid, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now())`,
        `CREATE TABLE IF NOT EXISTS ${prefix}_reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, record_id uuid, report_type text NOT NULL, title text NOT NULL, content text, sections jsonb DEFAULT '[]', created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now())`,
        `CREATE INDEX IF NOT EXISTS ${prefix}_records_org_idx ON ${prefix}_records(organization_id)`,
        `CREATE INDEX IF NOT EXISTS ${prefix}_reports_org_idx ON ${prefix}_reports(organization_id)`,
      ]
      const results = await executeSqlBatch(db, fallbackSql)
      const created = results.filter((r) => r.success).length
      logger.info(
        { template, tablesCreated: created },
        '[DomainAppLauncher] Domain tables provisioned (fallback)',
      )
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : undefined },
        '[DomainAppLauncher] DB provisioning failed (non-blocking)',
      )
    }
  }

  // 3 — Fallback: find any workspace with idle agents
  if (!workspaceId) {
    const anyWs = await db.query.workspaces.findFirst({
      orderBy: (w, { desc }) => [desc(w.createdAt)],
    })
    if (anyWs) {
      workspaceId = anyWs.id
      workspaceName = anyWs.name
      const wsAgents = await db.query.agents.findMany({
        where: eq(agents.workspaceId, anyWs.id),
      })
      agentCount = wsAgents.length
    }
  }

  // 4 — Create the project via Project Builder
  const projectType =
    template === 'astrology'
      ? ('full-stack' as const)
      : template === 'hospitality'
        ? ('landing-page' as const)
        : ('general' as const)

  let projectId: string
  let ticketIds: string[]

  try {
    const plan = await decomposeProject(db, brief, projectType)
    const result = await materializeProject(db, plan, {
      workspaceId: workspaceId ?? undefined,
    })
    projectId = result.projectId
    ticketIds = result.ticketIds
  } catch (err) {
    // If decomposition fails, use fallback plan directly
    logger.warn(
      { err: err instanceof Error ? err.message : undefined },
      '[DomainAppLauncher] Decomposition failed, using fallback',
    )
    const plan = await decomposeProject(db, `Simple project: ${brief}`, 'landing-page')
    const result = await materializeProject(db, plan, {
      workspaceId: workspaceId ?? undefined,
    })
    projectId = result.projectId
    ticketIds = result.ticketIds
  }

  // 5 — Start execution
  await executeNextWave(db, projectId)

  logger.info(
    { projectId, tickets: ticketIds.length, workspace: workspaceName, template },
    '[DomainAppLauncher] Launch complete',
  )

  return {
    entityId,
    workspaceId: workspaceId ?? '',
    workspaceName,
    projectId,
    ticketCount: ticketIds.length,
    template,
    agentCount,
    status: entityId ? 'launched' : 'project_only',
  }
}

// ── Get launch status (delegates to project status) ──────────────────────

export { getProjectStatus } from '../orchestration/project-orchestrator'
export { executeNextWave } from '../orchestration/project-orchestrator'
