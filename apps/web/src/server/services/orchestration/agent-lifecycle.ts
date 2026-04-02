/**
 * Agent Lifecycle — Employee lifecycle management for the AI corporation.
 *
 * Maps agent operations to corporate employee events:
 *   onboard → Create agent, assign to department, configure initial role
 *   assign  → Move agent to a department (brainEntity)
 *   promote → Evolve agent soul (performance-based improvement)
 *   review  → Analyze agent performance with metrics
 *   terminate → Deactivate agent with audit trail
 *
 * All events are logged for organizational accountability.
 */

import type { Database } from '@solarc/db'
import { agents, brainEntityAgents, chatRunSteps } from '@solarc/db'
import { eq, sql } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

export type LifecycleEvent =
  | 'onboarded'
  | 'assigned_to_department'
  | 'promoted'
  | 'performance_reviewed'
  | 'role_changed'
  | 'terminated'
  | 'reactivated'

export interface LifecycleRecord {
  agentId: string
  agentName: string
  event: LifecycleEvent
  detail: string
  timestamp: number
}

export interface OnboardInput {
  name: string
  departmentEntityId: string
  role: 'primary' | 'monitor' | 'healer' | 'specialist'
  workspaceId: string
  type?: string
  soul?: string
  model?: string
  skills?: string[]
}

export interface PerformanceReview {
  agentId: string
  agentName: string
  department: string | null
  status: string
  totalRuns: number
  successRate: number
  avgDurationMs: number
  recommendation: 'promote' | 'retain' | 'improve' | 'terminate'
  reasoning: string
}

// ── In-Memory Event Log ─────────────────────────────────────────────

const lifecycleLog: LifecycleRecord[] = []
const MAX_LOG_SIZE = 500

function logEvent(agentId: string, agentName: string, event: LifecycleEvent, detail: string): void {
  lifecycleLog.push({ agentId, agentName, event, detail, timestamp: Date.now() })
  if (lifecycleLog.length > MAX_LOG_SIZE) lifecycleLog.shift()
}

export function getLifecycleLog(agentId?: string): LifecycleRecord[] {
  if (agentId) return lifecycleLog.filter((r) => r.agentId === agentId)
  return [...lifecycleLog]
}

// ── Onboard (Hire) ──────────────────────────────────────────────────

/**
 * Onboard a new agent into the corporation.
 * Creates the agent, assigns to department, logs the hire event.
 */
export async function onboardAgent(
  db: Database,
  input: OnboardInput,
): Promise<{ agentId: string }> {
  // Create the agent
  const [created] = await db
    .insert(agents)
    .values({
      name: input.name,
      type: input.type ?? 'specialist',
      workspaceId: input.workspaceId,
      soul: input.soul ?? `You are ${input.name}, a specialist agent.`,
      model: input.model,
      skills: input.skills,
      status: 'idle',
    })
    .returning({ id: agents.id })

  const agentId = created!.id

  // Assign to department
  await db.insert(brainEntityAgents).values({
    entityId: input.departmentEntityId,
    agentId,
    role: input.role,
  })

  logEvent(
    agentId,
    input.name,
    'onboarded',
    `Hired as ${input.role} in department ${input.departmentEntityId}`,
  )

  return { agentId }
}

// ── Assign to Department ────────────────────────────────────────────

/**
 * Move an agent to a new department (brainEntity).
 */
export async function assignToDepartment(
  db: Database,
  agentId: string,
  newDepartmentId: string,
  role: 'primary' | 'monitor' | 'healer' | 'specialist',
): Promise<void> {
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent) throw new Error(`Agent ${agentId} not found`)

  // Remove from old department
  await db.delete(brainEntityAgents).where(eq(brainEntityAgents.agentId, agentId))

  // Assign to new department
  await db.insert(brainEntityAgents).values({ entityId: newDepartmentId, agentId, role })

  logEvent(
    agentId,
    agent.name,
    'assigned_to_department',
    `Transferred to department ${newDepartmentId} as ${role}`,
  )
}

// ── Performance Review ──────────────────────────────────────────────

/**
 * Generate a performance review for an agent based on execution history.
 */
export async function reviewPerformance(db: Database, agentId: string): Promise<PerformanceReview> {
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent) throw new Error(`Agent ${agentId} not found`)

  // Get department info
  const entityLink = await db.query.brainEntityAgents.findFirst({
    where: eq(brainEntityAgents.agentId, agentId),
  })

  // Count runs and success rate from chatRunSteps
  const [stats] = await db
    .select({
      totalRuns: sql<number>`count(*)::int`,
      completedRuns: sql<number>`count(*) filter (where ${chatRunSteps.status} = 'completed')::int`,
      avgDuration: sql<number>`coalesce(avg(${chatRunSteps.durationMs}), 0)::int`,
    })
    .from(chatRunSteps)
    .where(eq(chatRunSteps.agentId, agentId))

  const totalRuns = stats?.totalRuns ?? 0
  const completedRuns = stats?.completedRuns ?? 0
  const successRate = totalRuns > 0 ? completedRuns / totalRuns : 0
  const avgDurationMs = stats?.avgDuration ?? 0

  // Generate recommendation
  let recommendation: PerformanceReview['recommendation']
  let reasoning: string

  if (totalRuns === 0) {
    recommendation = 'retain'
    reasoning = 'No execution history yet — retain for evaluation period.'
  } else if (successRate >= 0.9 && totalRuns >= 10) {
    recommendation = 'promote'
    reasoning = `Excellent performance: ${(successRate * 100).toFixed(0)}% success rate across ${totalRuns} runs. Recommend evolution.`
  } else if (successRate >= 0.7) {
    recommendation = 'retain'
    reasoning = `Solid performance: ${(successRate * 100).toFixed(0)}% success rate. Meeting expectations.`
  } else if (successRate >= 0.5) {
    recommendation = 'improve'
    reasoning = `Below target: ${(successRate * 100).toFixed(0)}% success rate. Recommend soul refinement.`
  } else {
    recommendation = 'terminate'
    reasoning = `Poor performance: ${(successRate * 100).toFixed(0)}% success rate across ${totalRuns} runs. Consider deactivation.`
  }

  logEvent(agentId, agent.name, 'performance_reviewed', `${recommendation}: ${reasoning}`)

  return {
    agentId,
    agentName: agent.name,
    department: entityLink?.entityId ?? null,
    status: agent.status,
    totalRuns,
    successRate,
    avgDurationMs,
    recommendation,
    reasoning,
  }
}

// ── Terminate (Fire) ────────────────────────────────────────────────

/**
 * Deactivate an agent — the corporate equivalent of firing.
 * Sets status to offline, removes from active department roster.
 */
export async function terminateAgent(db: Database, agentId: string, reason: string): Promise<void> {
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent) throw new Error(`Agent ${agentId} not found`)

  await db
    .update(agents)
    .set({ status: 'offline', updatedAt: new Date() })
    .where(eq(agents.id, agentId))

  logEvent(agentId, agent.name, 'terminated', reason)
}

/**
 * Reactivate a terminated agent.
 */
export async function reactivateAgent(db: Database, agentId: string): Promise<void> {
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent) throw new Error(`Agent ${agentId} not found`)

  await db
    .update(agents)
    .set({ status: 'idle', updatedAt: new Date() })
    .where(eq(agents.id, agentId))

  logEvent(agentId, agent.name, 'reactivated', 'Agent reactivated')
}
