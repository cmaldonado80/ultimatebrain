/**
 * Work Dispatcher — Auto-assign unassigned tickets to idle agents.
 *
 * Called after heartbeat sweep to make the corporation autonomous.
 * For each healthy department, finds unassigned tickets and matches
 * them to idle agents using atomic checkout.
 */

import type { Database } from '@solarc/db'
import { agents, brainEntities, brainEntityAgents, tickets } from '@solarc/db'
import { and, eq, inArray, isNull } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

export interface DispatchResult {
  dispatched: number
  skipped: number
  assignments: Array<{ ticketId: string; ticketTitle: string; agentId: string; agentName: string }>
  errors: string[]
}

// ── Work Dispatch ───────────────────────────────────────────────────

/**
 * Scan all active departments for unassigned tickets and idle agents.
 * Auto-assign using atomic checkout for race safety.
 */
export async function dispatchPendingWork(db: Database): Promise<DispatchResult> {
  const result: DispatchResult = {
    dispatched: 0,
    skipped: 0,
    assignments: [],
    errors: [],
  }

  // 1. Get all active mini brain entities
  const activeDepts = await db
    .select({
      id: brainEntities.id,
      name: brainEntities.name,
      config: brainEntities.config,
    })
    .from(brainEntities)
    .where(and(eq(brainEntities.tier, 'mini_brain'), eq(brainEntities.status, 'active')))

  for (const dept of activeDepts) {
    // 2. Find workspace ID for this department
    const config = (dept.config ?? {}) as Record<string, unknown>
    const wsId = typeof config.workspaceId === 'string' ? config.workspaceId : null
    if (!wsId) continue

    // 3. Find unassigned tickets in this workspace (backlog or queued, no agent)
    const unassigned = await db
      .select({ id: tickets.id, title: tickets.title, priority: tickets.priority })
      .from(tickets)
      .where(
        and(
          eq(tickets.workspaceId, wsId),
          inArray(tickets.status, ['backlog', 'queued']),
          isNull(tickets.assignedAgentId),
        ),
      )
      .limit(5) // Don't overwhelm — max 5 per sweep

    if (unassigned.length === 0) continue

    // 4. Find idle agents in this department
    const deptAgentLinks = await db
      .select({ agentId: brainEntityAgents.agentId, role: brainEntityAgents.role })
      .from(brainEntityAgents)
      .where(eq(brainEntityAgents.entityId, dept.id))

    if (deptAgentLinks.length === 0) continue

    const agentIds = deptAgentLinks
      .filter((l) => l.role === 'specialist' || l.role === 'primary')
      .map((l) => l.agentId)

    if (agentIds.length === 0) continue

    const idleAgents = await db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(and(inArray(agents.id, agentIds), eq(agents.status, 'idle')))

    if (idleAgents.length === 0) {
      result.skipped += unassigned.length
      continue
    }

    // 5. Match tickets to agents (round-robin)
    for (let i = 0; i < unassigned.length && i < idleAgents.length; i++) {
      const ticket = unassigned[i]!
      const agent = idleAgents[i]!

      try {
        // Use atomic checkout for race-safe assignment
        const { atomicCheckout } = await import('./atomic-checkout')
        const checkout = await atomicCheckout(db, ticket.id, agent.id, dept.id)

        if (checkout.success) {
          result.dispatched++
          result.assignments.push({
            ticketId: ticket.id,
            ticketTitle: ticket.title,
            agentId: agent.id,
            agentName: agent.name,
          })
        } else {
          result.skipped++
        }
      } catch (err) {
        result.errors.push(
          `Failed to assign ${ticket.title} to ${agent.name}: ${err instanceof Error ? err.message : 'unknown'}`,
        )
      }
    }
  }

  return result
}
