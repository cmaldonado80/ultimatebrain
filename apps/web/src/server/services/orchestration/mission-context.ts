/**
 * Mission Context — Rich organizational context injected into agent prompts.
 *
 * Replaces the simple "Strategic Context" with full corporate awareness:
 *   - Corporation mission
 *   - Department mission and team roster
 *   - Agent's role and reporting line
 *   - Current department goals
 *
 * This is what transforms agents from isolated tools into corporate employees
 * who understand WHERE they sit and WHY their work matters.
 */

import type { Database } from '@solarc/db'
import { agents, brainEntities, brainEntityAgents, workspaces } from '@solarc/db'
import { eq } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

export interface OrgContext {
  /** Full formatted context block for system prompt injection */
  contextString: string
  /** Structured data for programmatic use */
  data: {
    corporationName: string
    corporationMission: string | null
    departmentName: string | null
    departmentMission: string | null
    agentRole: string | null
    reportsTo: string | null
    teammates: string[]
  }
}

// ── Context Builder ─────────────────────────────────────────────────

/**
 * Build the full organizational context for an agent.
 * This replaces resolveAgentGoalContext() with a much richer picture.
 */
export async function buildOrgContext(
  db: Database,
  agentId: string,
  workspaceId?: string,
): Promise<OrgContext> {
  const empty: OrgContext = {
    contextString: '',
    data: {
      corporationName: 'Solarc Brain',
      corporationMission: null,
      departmentName: null,
      departmentMission: null,
      agentRole: null,
      reportsTo: null,
      teammates: [],
    },
  }

  // 1. Get the agent
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent) return empty

  // 2. Find which entity (department) this agent belongs to
  const entityLink = await db.query.brainEntityAgents.findFirst({
    where: eq(brainEntityAgents.agentId, agentId),
  })

  let departmentEntity: {
    name: string
    domain: string | null
    parentId: string | null
    config: unknown
  } | null = null
  let corporationEntity: { name: string; config: unknown } | null = null
  let entityRole: string | null = null

  if (entityLink) {
    entityRole = entityLink.role
    const entity = await db.query.brainEntities.findFirst({
      where: eq(brainEntities.id, entityLink.entityId),
    })
    if (entity) {
      departmentEntity = entity

      // 3. Get the corporation (parent of department)
      if (entity.parentId) {
        const parent = await db.query.brainEntities.findFirst({
          where: eq(brainEntities.id, entity.parentId),
        })
        if (parent) corporationEntity = parent
      }
    }
  }

  // 4. Get workspace goal (department mission)
  let departmentMission: string | null = null
  const wsId = workspaceId ?? agent.workspaceId
  if (wsId) {
    const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, wsId) })
    if (ws) departmentMission = ws.goal
  }

  // 5. Find teammates (other agents in same workspace)
  const teammates: string[] = []
  if (wsId) {
    const wsAgents = await db
      .select({ id: agents.id, name: agents.name, isOrch: agents.isWsOrchestrator })
      .from(agents)
      .where(eq(agents.workspaceId, wsId))

    for (const a of wsAgents) {
      if (a.id === agentId) continue
      teammates.push(a.isOrch ? `${a.name} (Department Head)` : a.name)
    }
  }

  // 6. Find reporting line
  let reportsTo: string | null = null
  if (agent.parentOrchestratorId) {
    const manager = await db.query.agents.findFirst({
      where: eq(agents.id, agent.parentOrchestratorId),
    })
    if (manager) reportsTo = manager.name
  }

  // 7. Resolve role label
  const roleLabel = resolveRoleLabel(agent, entityRole)

  // 8. Build context string
  const corpName = corporationEntity?.name ?? 'Solarc Brain'
  const corpMission = getMissionFromConfig(corporationEntity?.config)
  const deptName = departmentEntity?.name ?? null
  const deptDomain = departmentEntity?.domain ?? null

  const data: OrgContext['data'] = {
    corporationName: corpName,
    corporationMission: corpMission,
    departmentName: deptName,
    departmentMission: departmentMission ?? getMissionFromConfig(departmentEntity?.config),
    agentRole: roleLabel,
    reportsTo,
    teammates,
  }

  const contextString = formatOrgContext(agent.name, data, deptDomain)

  return { contextString, data }
}

// ── Formatting ──────────────────────────────────────────────────────

function formatOrgContext(
  agentName: string,
  data: OrgContext['data'],
  domain: string | null,
): string {
  const lines: string[] = ['\n\n[Organizational Context]']

  // Corporation
  lines.push(`Corporation: ${data.corporationName}`)
  if (data.corporationMission) {
    lines.push(`Corporation Mission: ${data.corporationMission}`)
  }

  // Department
  if (data.departmentName) {
    lines.push(`Department: ${data.departmentName}${domain ? ` (${domain})` : ''}`)
  }
  if (data.departmentMission) {
    lines.push(`Department Mission: ${data.departmentMission}`)
  }

  // Agent's position
  lines.push(`Your Name: ${agentName}`)
  if (data.agentRole) {
    lines.push(`Your Role: ${data.agentRole}`)
  }
  if (data.reportsTo) {
    lines.push(`Reports To: ${data.reportsTo}`)
  }

  // Team awareness
  if (data.teammates.length > 0) {
    lines.push(
      `Your Team: ${data.teammates.slice(0, 8).join(', ')}${data.teammates.length > 8 ? ` (+${data.teammates.length - 8} more)` : ''}`,
    )
  }

  // Behavioral directive
  lines.push('')
  lines.push(
    'Make decisions that serve your department mission and the corporation mission. ' +
      'Collaborate with your teammates when needed. Report blockers to your manager.',
  )

  return lines.join('\n')
}

// ── Helpers ──────────────────────────────────────────────────────────

function getMissionFromConfig(config: unknown): string | null {
  if (!config || typeof config !== 'object') return null
  const c = config as Record<string, unknown>
  return (
    (typeof c.mission === 'string' ? c.mission : null) ??
    (typeof c.goal === 'string' ? c.goal : null)
  )
}

function resolveRoleLabel(
  agent: { isWsOrchestrator: boolean | null; type: string | null },
  entityRole: string | null,
): string {
  if (agent.isWsOrchestrator) return 'Department Head'
  if (entityRole === 'primary') return 'Lead Specialist'
  if (entityRole === 'monitor') return 'Operations Monitor'
  if (entityRole === 'healer') return 'Self-Healing Agent'
  if (agent.type === 'executor') return 'Execution Specialist'
  if (agent.type === 'planner') return 'Strategic Planner'
  if (agent.type === 'reviewer') return 'Quality Reviewer'
  return 'Specialist'
}
