/**
 * Organization Model — Interprets Solarc Brain's three-tier hierarchy as a corporation.
 *
 * Brain = The Corporation (mission holder, root entity)
 * Mini Brains = Departments (domain specialists with budgets, teams, goals)
 * Development = Products (apps the corporation builds and maintains)
 * Agents = Employees (roles, reporting lines, performance, specialties)
 *
 * No schema changes — this is a SERVICE LAYER that reads existing tables
 * and assembles the organizational interpretation.
 */

import type { Database } from '@solarc/db'
import { agents, brainEntities, brainEntityAgents, workspaces } from '@solarc/db'
// ── Types ─────────────────────────────────────────────────────────────

export interface CorporateEntity {
  id: string
  name: string
  role: 'corporation' | 'department' | 'product'
  domain: string | null
  status: string
  mission: string | null
  parentId: string | null
}

export interface Employee {
  id: string
  name: string
  orgRole: 'ceo' | 'department_head' | 'specialist' | 'monitor' | 'healer'
  department: string | null
  departmentId: string | null
  status: string
  reportsTo: string | null
  reportsToName: string | null
  skills: string[]
  model: string | null
}

export interface OrgChart {
  corporation: CorporateEntity
  departments: Array<CorporateEntity & { employees: Employee[]; products: CorporateEntity[] }>
  stats: {
    totalDepartments: number
    totalEmployees: number
    totalProducts: number
    activeEmployees: number
  }
}

export interface DepartmentProfile {
  entity: CorporateEntity
  head: Employee | null
  employees: Employee[]
  products: CorporateEntity[]
  workspaceGoal: string | null
  agentCount: number
}

// ── Org Chart Assembly ──────────────────────────────────────────────

/**
 * Build the full organizational chart from existing entities and agents.
 * Reads brainEntities (tiers), brainEntityAgents (roles), agents, and workspaces.
 */
export async function buildOrgChart(db: Database): Promise<OrgChart> {
  // 1. Get all brain entities grouped by tier
  const allEntities = await db
    .select({
      id: brainEntities.id,
      name: brainEntities.name,
      tier: brainEntities.tier,
      domain: brainEntities.domain,
      status: brainEntities.status,
      parentId: brainEntities.parentId,
      config: brainEntities.config,
    })
    .from(brainEntities)

  const brain = allEntities.find((e) => e.tier === 'brain')
  const miniBrains = allEntities.filter((e) => e.tier === 'mini_brain')
  const developments = allEntities.filter((e) => e.tier === 'development')

  // 2. Get all entity-agent relationships
  const entityAgentLinks = await db
    .select({
      entityId: brainEntityAgents.entityId,
      agentId: brainEntityAgents.agentId,
      role: brainEntityAgents.role,
    })
    .from(brainEntityAgents)

  // 3. Get all agents
  const allAgents = await db
    .select({
      id: agents.id,
      name: agents.name,
      type: agents.type,
      status: agents.status,
      workspaceId: agents.workspaceId,
      isWsOrchestrator: agents.isWsOrchestrator,
      parentOrchestratorId: agents.parentOrchestratorId,
      skills: agents.skills,
      model: agents.model,
    })
    .from(agents)

  const agentMap = new Map(allAgents.map((a) => [a.id, a]))

  // 4. Get workspace goals for department context
  const allWorkspaces = await db
    .select({ id: workspaces.id, name: workspaces.name, goal: workspaces.goal })
    .from(workspaces)
  const wsMap = new Map(allWorkspaces.map((w) => [w.id, w]))

  // 5. Build corporation entity
  const corporation: CorporateEntity = {
    id: brain?.id ?? 'system',
    name: brain?.name ?? 'Solarc Brain',
    role: 'corporation',
    domain: null,
    status: brain?.status ?? 'active',
    mission: getMission(brain?.config),
    parentId: null,
  }

  // 6. Build department entities with employees
  // PRIMARY: use agent.workspaceId as the single source of truth
  // SECONDARY: use brainEntityAgents for role info (department_head vs specialist)
  const departments = miniBrains.map((mb) => {
    const deptAgentLinks = entityAgentLinks.filter((l) => l.entityId === mb.id)
    const deptProducts = developments.filter((d) => d.parentId === mb.id)

    // Get department's workspace ID
    const config = (mb.config ?? {}) as Record<string, unknown>
    const wsId = typeof config.workspaceId === 'string' ? config.workspaceId : null

    // Find ALL agents in this department's workspace (single source of truth)
    const deptAgents = wsId
      ? allAgents.filter((a) => a.workspaceId === wsId)
      : // Fallback: if no workspace, use brainEntityAgents links
        (deptAgentLinks.map((l) => agentMap.get(l.agentId)).filter(Boolean) as typeof allAgents)

    // Build employee list from workspace agents
    const employees: Employee[] = deptAgents.map((agent) => {
      // Check if this agent has a role defined in brainEntityAgents
      const link = deptAgentLinks.find((l) => l.agentId === agent.id)
      const reportsToId = agent.isWsOrchestrator ? null : agent.parentOrchestratorId
      const reportsToAgent = reportsToId ? agentMap.get(reportsToId) : null

      return {
        id: agent.id,
        name: agent.name,
        orgRole: link
          ? resolveOrgRole(agent, link.role)
          : agent.isWsOrchestrator
            ? 'department_head'
            : 'specialist',
        department: mb.domain,
        departmentId: mb.id,
        status: agent.status,
        reportsTo: reportsToId ?? null,
        reportsToName: reportsToAgent?.name ?? null,
        skills: (agent.skills as string[]) ?? [],
        model: agent.model,
      }
    })

    const ws = wsId ? wsMap.get(wsId) : null

    return {
      id: mb.id,
      name: mb.name,
      role: 'department' as const,
      domain: mb.domain,
      status: mb.status,
      mission: ws?.goal ?? getMission(mb.config),
      parentId: mb.parentId,
      employees,
      products: deptProducts.map((d) => ({
        id: d.id,
        name: d.name,
        role: 'product' as const,
        domain: d.domain,
        status: d.status,
        mission: getMission(d.config),
        parentId: d.parentId,
      })),
    }
  })

  const totalEmployees = departments.reduce((sum, d) => sum + d.employees.length, 0)
  const activeEmployees = departments.reduce(
    (sum, d) =>
      sum + d.employees.filter((e) => e.status !== 'offline' && e.status !== 'error').length,
    0,
  )

  return {
    corporation,
    departments,
    stats: {
      totalDepartments: departments.length,
      totalEmployees,
      totalProducts: developments.length,
      activeEmployees,
    },
  }
}

/**
 * Get a specific department's full profile.
 */
export async function getDepartmentProfile(
  db: Database,
  entityId: string,
): Promise<DepartmentProfile | null> {
  const orgChart = await buildOrgChart(db)
  const dept = orgChart.departments.find((d) => d.id === entityId)
  if (!dept) return null

  const head = dept.employees.find((e) => e.orgRole === 'department_head') ?? null

  return {
    entity: {
      id: dept.id,
      name: dept.name,
      role: 'department',
      domain: dept.domain,
      status: dept.status,
      mission: dept.mission,
      parentId: dept.parentId,
    },
    head,
    employees: dept.employees,
    products: dept.products,
    workspaceGoal: dept.mission,
    agentCount: dept.employees.length,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function getMission(config: unknown): string | null {
  if (!config || typeof config !== 'object') return null
  const c = config as Record<string, unknown>
  if (typeof c.mission === 'string') return c.mission
  if (typeof c.goal === 'string') return c.goal
  return null
}

function mapEntityRole(role: string): Employee['orgRole'] {
  switch (role) {
    case 'primary':
      return 'department_head'
    case 'monitor':
      return 'monitor'
    case 'healer':
      return 'healer'
    case 'specialist':
      return 'specialist'
    default:
      return 'specialist'
  }
}

function resolveOrgRole(
  agent: { isWsOrchestrator: boolean | null; type: string | null },
  entityRole: string,
): Employee['orgRole'] {
  if (agent.isWsOrchestrator) return 'department_head'
  if (entityRole === 'primary') return 'department_head'
  return mapEntityRole(entityRole)
}
