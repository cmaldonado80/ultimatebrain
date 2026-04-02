/**
 * Goal Ancestry — Tasks carry full goal lineage back to company mission.
 *
 * Inspired by Paperclip AI's goal-aware execution pattern.
 * Every task/ticket knows WHY it exists by tracing through:
 *   Company Mission → Strategic Goal → Project Milestone → This Task
 *
 * Agents receive this ancestry as context so they make globally-optimal decisions.
 */

import type { Database } from '@solarc/db'
import { projects, tickets, workspaces } from '@solarc/db'
import { eq } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

export interface GoalAncestor {
  level: 'mission' | 'goal' | 'project' | 'milestone' | 'task'
  id: string
  title: string
  description: string | null
}

export interface GoalAncestry {
  /** Full chain from mission down to task */
  chain: GoalAncestor[]
  /** Formatted context string for injection into agent prompts */
  contextString: string
}

// ── Ancestry Resolution ─────────────────────────────────────────────

/**
 * Resolve the full goal ancestry for a ticket/task.
 * Traces: ticket → project → workspace → mission
 */
export async function resolveGoalAncestry(db: Database, ticketId: string): Promise<GoalAncestry> {
  const chain: GoalAncestor[] = []

  // 1. Get the ticket itself
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
  })
  if (!ticket) return { chain: [], contextString: '' }

  chain.push({
    level: 'task',
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
  })

  // 2. Get the project (if ticket belongs to one)
  if (ticket.projectId) {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, ticket.projectId),
    })
    if (project) {
      chain.unshift({
        level: 'project',
        id: project.id,
        title: project.name,
        description: project.goal ?? null,
      })
    }
  }

  // 3. Get the workspace (acts as strategic goal/department)
  if (ticket.workspaceId) {
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, ticket.workspaceId),
    })
    if (workspace) {
      chain.unshift({
        level: 'goal',
        id: workspace.id,
        title: workspace.name,
        description: workspace.goal ?? null,
      })
    }
  }

  // 4. Build the context string for agent prompt injection
  const contextString = formatAncestryContext(chain)

  return { chain, contextString }
}

/**
 * Resolve goal ancestry for an agent (based on its workspace).
 * Returns the strategic context for what this agent should be working toward.
 */
export async function resolveAgentGoalContext(
  db: Database,
  _agentId: string,
  workspaceId?: string,
): Promise<string> {
  if (!workspaceId) return ''

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  })
  if (!workspace) return ''

  return `\n\n[Strategic Context] You are operating within "${workspace.name}"${workspace.goal ? `: ${workspace.goal}` : ''}. Align your decisions with this strategic objective.`
}

// ── Formatting ──────────────────────────────────────────────────────

function formatAncestryContext(chain: GoalAncestor[]): string {
  if (chain.length === 0) return ''

  const lines = ['[Goal Ancestry — Why this task exists]']
  for (const ancestor of chain) {
    const prefix = ancestor.level === 'task' ? '→' : '  '
    const label = ancestor.level.charAt(0).toUpperCase() + ancestor.level.slice(1)
    lines.push(
      `${prefix} ${label}: ${ancestor.title}${ancestor.description ? ` — ${ancestor.description.slice(0, 200)}` : ''}`,
    )
  }
  lines.push('Make decisions that serve the full chain above, not just the immediate task.')

  return lines.join('\n')
}
