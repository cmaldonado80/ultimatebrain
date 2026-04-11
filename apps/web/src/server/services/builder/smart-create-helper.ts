/**
 * SmartCreate Helper — programmatic Mini Brain creation extracted from
 * the mini-brain-factory router for use by the Domain App Launcher.
 */

import type { Database } from '@solarc/db'
import {
  agents,
  brainEntities,
  brainEntityAgents,
  workspaceBindings,
  workspaceLifecycleEvents,
  workspaces,
} from '@solarc/db'
import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'

import { logger } from '../../../lib/logger'
import { MiniBrainFactory, type MiniBrainTemplate } from '../mini-brain-factory/factory'
import { getAgentSoul } from '../orchestration/agents'

const ORCHESTRATOR_MODEL = 'deepseek-v3.2:cloud'

function modelForRole(role: string): string {
  if (role.includes('orchestrat')) return 'deepseek-v3.2:cloud'
  if (role.includes('review') || role.includes('judge')) return 'deepseek-v3.2:cloud'
  if (role.includes('plan') || role.includes('reason')) return 'deepseek-v3.2:cloud'
  if (role.includes('vision') || role.includes('multimodal')) return 'llama-3.2-11b-vision:cloud'
  if (role.includes('guard') || role.includes('safety')) return 'llama-guard-3:cloud'
  return 'qwen3.5:cloud'
}

export async function smartCreateMiniBrain(
  db: Database,
  opts: {
    template: MiniBrainTemplate
    name: string
    userId?: string
    organizationId?: string
  },
): Promise<{
  entityId: string
  workspaceId: string
  workspaceName: string
  agentCount: number
}> {
  const factory = new MiniBrainFactory()
  const template = factory.getTemplate(opts.template)
  if (!template) throw new Error(`Unknown template: ${opts.template}`)

  // Generate API key
  const apiKey = `mb_${randomUUID().replace(/-/g, '')}`
  const apiKeyHash = Buffer.from(apiKey).toString('base64')

  // Create entity
  const [entity] = await db
    .insert(brainEntities)
    .values({
      name: opts.name,
      tier: 'mini_brain',
      domain: template.domain,
      enginesEnabled: template.engines,
      status: 'provisioning',
      apiKeyHash,
      ownerUserId: opts.userId ?? null,
      organizationId: opts.organizationId ?? null,
    })
    .returning()

  // Create workspace
  const [ws] = await db
    .insert(workspaces)
    .values({
      name: opts.name,
      type: 'general',
      goal: `${template.domain} domain — ${template.engines.join(', ')}`,
      icon: opts.template,
      lifecycleState: 'active',
      organizationId: opts.organizationId ?? null,
    })
    .returning()

  // Log lifecycle event
  await db.insert(workspaceLifecycleEvents).values({
    workspaceId: ws.id,
    eventType: 'created',
    toState: 'active',
    payload: { source: 'domain-app-launcher', domain: template.domain },
  })

  // Find system orchestrator for parent chain
  let systemOrchId: string | null = null
  try {
    const sysWs = await db.query.workspaces.findFirst({
      where: eq(workspaces.isSystemProtected, true),
    })
    if (sysWs) {
      const sysOrch = await db.query.agents.findFirst({
        where: eq(agents.workspaceId, sysWs.id),
      })
      if (sysOrch) systemOrchId = sysOrch.id
    }
  } catch {
    // non-critical
  }

  // Create orchestrator
  const [orch] = await db
    .insert(agents)
    .values({
      name: `${opts.name} Orchestrator`,
      type: 'orchestrator',
      workspaceId: ws.id,
      isWsOrchestrator: true,
      parentOrchestratorId: systemOrchId,
      description: `Orchestrator for ${opts.name} (${template.domain})`,
      soul:
        getAgentSoul('workflow-orchestrator')?.soul ??
        `You are the orchestrator for ${opts.name}, a ${template.domain} department. Coordinate domain agents, route tasks, monitor health.`,
      skills: ['coordination', 'task-routing', 'domain-routing', 'monitoring'],
      model: ORCHESTRATOR_MODEL,
      requiredModelType: 'router',
      tags: ['orchestrator', opts.template],
      toolAccess: [
        'create_ticket',
        'query_system',
        'memory_store',
        'memory_search',
        'workspace_files',
        'web_search',
        'db_query',
      ],
    })
    .returning()

  let agentCount = 1 // orchestrator

  // Create template agents
  for (const agentDef of template.agents) {
    const [agent] = await db
      .insert(agents)
      .values({
        name: agentDef.name,
        type: agentDef.role.includes('review')
          ? 'reviewer'
          : agentDef.role.includes('plan')
            ? 'planner'
            : 'specialist',
        workspaceId: ws.id,
        description: `${agentDef.role} — ${agentDef.capabilities.join(', ')}`,
        soul:
          getAgentSoul(agentDef.name)?.soul ??
          agentDef.soul ??
          `You are ${agentDef.name}, a ${template.domain} specialist. Role: ${agentDef.role}. Capabilities: ${agentDef.capabilities.join(', ')}.`,
        skills: agentDef.capabilities,
        model: modelForRole(agentDef.role),
        requiredModelType: 'agentic',
        tags: [opts.template, 'domain-agent'],
        toolAccess: [
          'workspace_files',
          'web_search',
          'web_scrape',
          'memory_store',
          'memory_search',
          'db_query',
          'file_system',
          'render_preview',
          'generate_design_system',
          'design_intelligence',
          'code_review',
          'guest_review_analyze',
          'guest_review_history',
          // Ephemeris tools for astrology
          ...(opts.template === 'astrology'
            ? [
                'ephemeris_natal_chart',
                'ephemeris_current_transits',
                'ephemeris_moon_phase',
                'ephemeris_synastry',
                'ephemeris_transit_calendar',
                'ephemeris_solar_return',
                'ephemeris_profections',
                'ephemeris_report',
                'ephemeris_dasha',
                'ephemeris_progressions',
                'ephemeris_arabic_parts',
                'ephemeris_patterns',
              ]
            : []),
        ],
      })
      .returning()

    if (agent) {
      agentCount++
      try {
        await db.insert(brainEntityAgents).values({
          entityId: entity.id,
          agentId: agent.id,
          role: 'primary',
        })
      } catch {
        // non-critical
      }
    }
  }

  // Link orchestrator to entity
  try {
    await db.insert(brainEntityAgents).values({
      entityId: entity.id,
      agentId: orch.id,
      role: 'primary',
    })
  } catch {
    // non-critical
  }

  // Workspace binding
  await db.insert(workspaceBindings).values({
    workspaceId: ws.id,
    bindingType: 'brain',
    bindingKey: entity.id,
  })

  // Auto-create domain database tables
  try {
    const { generateSchemaProposal, executeSqlBatch } = await import('./database-builder')
    const domainBrief = `${template.domain} application with tables for: ${template.dbTables.join(', ')}`
    const schema = await generateSchemaProposal(db, domainBrief, template.domain)
    if (schema.sql) {
      const stmts = schema.sql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 10)
      const results = await executeSqlBatch(db, stmts)
      const created = results.filter((r) => r.success).length
      logger.info(
        { template: opts.template, tablesCreated: created },
        '[SmartCreateHelper] Domain database tables provisioned',
      )
    }
  } catch (dbErr) {
    logger.warn(
      { err: dbErr instanceof Error ? dbErr.message : undefined },
      '[SmartCreateHelper] DB provisioning failed (non-blocking)',
    )
  }

  logger.info(
    { entityId: entity.id, workspaceId: ws.id, agents: agentCount, template: opts.template },
    '[SmartCreateHelper] Mini Brain created',
  )

  return {
    entityId: entity.id,
    workspaceId: ws.id,
    workspaceName: ws.name,
    agentCount,
  }
}
