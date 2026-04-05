/**
 * System Orchestrator
 *
 * Manages the system-wide orchestrator workspace and orchestrator hierarchy:
 * - Bootstrap: ensures system workspace + brain orchestrator agent exist
 * - Orchestrator hierarchy: parent-child links between orchestrators
 * - Cross-workspace task routing, delegation, and escalation
 * - Workspace health monitoring and governance
 * - Budget enforcement and policy compliance
 * - Agent rebalancing and auto-scaling
 */

import type { Database } from '@solarc/db'
import {
  agents,
  orchestratorRoutes,
  tickets,
  tokenLedger,
  workspaceLifecycleEvents,
  workspaces,
} from '@solarc/db'
import { and, desc, eq, or } from 'drizzle-orm'

import { logger } from '../../../lib/logger'
import { NotFoundError, ValidationError } from '../../errors'

// ── Types ───────────────────────────────────────────────────────────────

export interface OrchestratorNode {
  id: string
  name: string
  workspaceId: string | null
  workspaceName: string | null
  parentOrchestratorId: string | null
  status: string
  skills: string[] | null
  children: OrchestratorNode[]
}

export interface WorkspaceHealthSummary {
  workspaceId: string
  workspaceName: string
  lifecycleState: string
  agentCount: number
  idleAgents: number
  busyAgents: number
  errorAgents: number
  activeTickets: number
  failedTickets: number
  hasOrchestrator: boolean
}

export interface EscalationResult {
  ticketId: string
  fromOrchestrator: string
  toOrchestrator: string
  reason: string
  escalatedAt: Date
}

export interface DelegationResult {
  ticketId: string
  fromOrchestrator: string
  toWorkspaceId: string
  toOrchestrator: string | null
  delegatedAt: Date
}

// ── Service ─────────────────────────────────────────────────────────────

export class SystemOrchestrator {
  private systemWorkspaceId: string | null = null

  constructor(private db: Database) {}

  // ── Bootstrap ───────────────────────────────────────────────────────

  /**
   * Ensure the system workspace and its orchestrator agent exist.
   * Idempotent — safe to call multiple times.
   */
  async ensureSystemWorkspace(): Promise<{ workspaceId: string; orchestratorId: string }> {
    // Check if system workspace already exists (by name, not just type — avoids confusing with
    // other 'system' type workspaces like Quality & Security)
    let systemWs = await this.db.query.workspaces.findFirst({
      where: and(eq(workspaces.name, 'System Orchestrator'), eq(workspaces.type, 'system')),
    })

    // Fallback: check by isSystemProtected flag
    if (!systemWs) {
      systemWs = await this.db.query.workspaces.findFirst({
        where: eq(workspaces.isSystemProtected, true),
      })
    }

    if (!systemWs) {
      const [created] = await this.db
        .insert(workspaces)
        .values({
          name: 'System Orchestrator',
          type: 'system',
          goal: 'Govern all workspaces, route tasks, enforce policies, monitor health',
          autonomyLevel: 5,
          lifecycleState: 'active',
          isSystemProtected: true,
        })
        .returning()
      systemWs = created

      await this.db.insert(workspaceLifecycleEvents).values({
        workspaceId: systemWs.id,
        eventType: 'system_bootstrap',
        toState: 'active',
        payload: { bootstrappedAt: new Date().toISOString() },
      })
    }

    this.systemWorkspaceId = systemWs.id

    // Ensure orchestrator agent exists
    let orchestrator = await this.db.query.agents.findFirst({
      where: and(eq(agents.workspaceId, systemWs.id), eq(agents.isWsOrchestrator, true)),
    })

    if (!orchestrator) {
      const [created] = await this.db
        .insert(agents)
        .values({
          name: 'Brain Orchestrator',
          type: 'orchestrator',
          workspaceId: systemWs.id,
          isWsOrchestrator: true,
          parentOrchestratorId: null,
          description: 'System-wide orchestrator — governs all workspace orchestrators',
          skills: [
            'cross-workspace-routing',
            'budget-governance',
            'policy-enforcement',
            'health-monitoring',
            'agent-allocation',
            'auto-scaling',
          ],
          triggerMode: 'auto',
        })
        .returning()
      orchestrator = created
    }

    return { workspaceId: systemWs.id, orchestratorId: orchestrator.id }
  }

  /** Get the cached system workspace ID, bootstrapping if needed. */
  private async getSystemWorkspaceId(): Promise<string> {
    if (!this.systemWorkspaceId) {
      const result = await this.ensureSystemWorkspace()
      this.systemWorkspaceId = result.workspaceId
    }
    return this.systemWorkspaceId
  }

  // ── Orchestrator Hierarchy ──────────────────────────────────────────

  /**
   * Get the full orchestrator tree starting from the system orchestrator.
   */
  async getOrchestratorTree(): Promise<OrchestratorNode> {
    const allOrchestrators = await this.db.query.agents.findMany({
      where: eq(agents.isWsOrchestrator, true),
    })

    // Build workspace name lookup
    const wsIds = [
      ...new Set(allOrchestrators.map((a) => a.workspaceId).filter(Boolean)),
    ] as string[]
    const wsList = wsIds.length > 0 ? await this.db.query.workspaces.findMany() : []
    const wsMap = new Map(wsList.map((w) => [w.id, w.name]))

    // Build tree
    const nodeMap = new Map<string, OrchestratorNode>()
    for (const orch of allOrchestrators) {
      nodeMap.set(orch.id, {
        id: orch.id,
        name: orch.name,
        workspaceId: orch.workspaceId,
        workspaceName: orch.workspaceId ? (wsMap.get(orch.workspaceId) ?? null) : null,
        parentOrchestratorId: orch.parentOrchestratorId,
        status: orch.status,
        skills: orch.skills,
        children: [],
      })
    }

    // Link children to parents
    let root: OrchestratorNode | null = null
    for (const node of nodeMap.values()) {
      if (node.parentOrchestratorId && nodeMap.has(node.parentOrchestratorId)) {
        nodeMap.get(node.parentOrchestratorId)!.children.push(node)
      } else if (!node.parentOrchestratorId) {
        root = node
      }
    }

    // If no root found, return the first orchestrator
    if (!root && nodeMap.size > 0) {
      root = nodeMap.values().next().value!
    }

    if (!root) {
      throw new NotFoundError('Orchestrator', 'system')
    }

    return root
  }

  /**
   * Link a child orchestrator to a parent orchestrator.
   */
  async linkOrchestrator(childOrchestratorId: string, parentOrchestratorId: string): Promise<void> {
    const child = await this.db.query.agents.findFirst({
      where: and(eq(agents.id, childOrchestratorId), eq(agents.isWsOrchestrator, true)),
    })
    if (!child) throw new NotFoundError('Orchestrator', childOrchestratorId)

    const parent = await this.db.query.agents.findFirst({
      where: and(eq(agents.id, parentOrchestratorId), eq(agents.isWsOrchestrator, true)),
    })
    if (!parent) throw new NotFoundError('Orchestrator', parentOrchestratorId)

    // Prevent circular links
    if (childOrchestratorId === parentOrchestratorId) {
      throw new ValidationError('Cannot link orchestrator to itself')
    }

    await this.db
      .update(agents)
      .set({ parentOrchestratorId, updatedAt: new Date() })
      .where(eq(agents.id, childOrchestratorId))
  }

  /**
   * Get all child orchestrators for a given orchestrator.
   */
  async getChildOrchestrators(orchestratorId: string): Promise<
    Array<{
      id: string
      name: string
      workspaceId: string | null
      status: string
    }>
  > {
    return this.db.query.agents.findMany({
      where: and(
        eq(agents.parentOrchestratorId, orchestratorId),
        eq(agents.isWsOrchestrator, true),
      ),
      columns: { id: true, name: true, workspaceId: true, status: true },
    })
  }

  // ── Escalation & Delegation ─────────────────────────────────────────

  /**
   * Escalate a ticket from a workspace orchestrator to its parent.
   */
  async escalate(
    workspaceOrchestratorId: string,
    ticketId: string,
    reason: string,
  ): Promise<EscalationResult> {
    const orch = await this.db.query.agents.findFirst({
      where: and(eq(agents.id, workspaceOrchestratorId), eq(agents.isWsOrchestrator, true)),
    })
    if (!orch) throw new NotFoundError('Orchestrator', workspaceOrchestratorId)
    if (!orch.parentOrchestratorId) {
      throw new ValidationError('System orchestrator has no parent to escalate to')
    }

    const parent = await this.db.query.agents.findFirst({
      where: eq(agents.id, orch.parentOrchestratorId),
    })
    if (!parent) throw new NotFoundError('Parent orchestrator', orch.parentOrchestratorId)

    // Reassign ticket to parent orchestrator's workspace
    if (parent.workspaceId) {
      await this.db
        .update(tickets)
        .set({
          workspaceId: parent.workspaceId,
          assignedAgentId: parent.id,
          updatedAt: new Date(),
        })
        .where(eq(tickets.id, ticketId))
    }

    return {
      ticketId,
      fromOrchestrator: workspaceOrchestratorId,
      toOrchestrator: orch.parentOrchestratorId,
      reason,
      escalatedAt: new Date(),
    }
  }

  /**
   * Delegate a ticket from the system orchestrator to a workspace orchestrator.
   */
  async delegate(ticketId: string, targetWorkspaceId: string): Promise<DelegationResult> {
    const systemWsId = await this.getSystemWorkspaceId()
    const systemOrch = await this.db.query.agents.findFirst({
      where: and(eq(agents.workspaceId, systemWsId), eq(agents.isWsOrchestrator, true)),
    })
    if (!systemOrch) throw new NotFoundError('System orchestrator', 'system')

    // Find target workspace orchestrator
    const targetOrch = await this.db.query.agents.findFirst({
      where: and(eq(agents.workspaceId, targetWorkspaceId), eq(agents.isWsOrchestrator, true)),
    })

    // Reassign ticket
    await this.db
      .update(tickets)
      .set({
        workspaceId: targetWorkspaceId,
        assignedAgentId: targetOrch?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, ticketId))

    return {
      ticketId,
      fromOrchestrator: systemOrch.id,
      toWorkspaceId: targetWorkspaceId,
      toOrchestrator: targetOrch?.id ?? null,
      delegatedAt: new Date(),
    }
  }

  // ── Cross-Workspace Routing ─────────────────────────────────────────

  /**
   * Route a ticket to the best workspace based on orchestrator routes and agent availability.
   */
  async routeTask(ticketId: string): Promise<{ workspaceId: string; reason: string } | null> {
    const ticket = await this.db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    })
    if (!ticket) throw new NotFoundError('Ticket', ticketId)

    if (!ticket.workspaceId) return null

    // Get routes from current workspace
    const routes = await this.db.query.orchestratorRoutes.findMany({
      where: eq(orchestratorRoutes.fromWorkspace, ticket.workspaceId),
      orderBy: desc(orchestratorRoutes.priority),
    })

    for (const route of routes) {
      if (!route.toWorkspace) continue

      // Check target workspace has idle agents
      const idleAgents = await this.db.query.agents.findMany({
        where: and(eq(agents.workspaceId, route.toWorkspace), eq(agents.status, 'idle')),
      })

      if (idleAgents.length > 0) {
        return {
          workspaceId: route.toWorkspace,
          reason: `Route rule: ${route.rule ?? 'default'} (${idleAgents.length} idle agents)`,
        }
      }
    }

    return null
  }

  // ── Workspace Health ────────────────────────────────────────────────

  /**
   * Get health summary for a single workspace.
   */
  async getWorkspaceHealth(workspaceId: string): Promise<WorkspaceHealthSummary> {
    const ws = await this.db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    })
    if (!ws) throw new NotFoundError('Workspace', workspaceId)

    const wsAgents = await this.db.query.agents.findMany({
      where: eq(agents.workspaceId, workspaceId),
    })

    const activeTickets = await this.db.query.tickets.findMany({
      where: and(eq(tickets.workspaceId, workspaceId), eq(tickets.status, 'in_progress')),
    })

    const failedTickets = await this.db.query.tickets.findMany({
      where: and(eq(tickets.workspaceId, workspaceId), eq(tickets.status, 'failed')),
    })

    return {
      workspaceId,
      workspaceName: ws.name,
      lifecycleState: ws.lifecycleState,
      agentCount: wsAgents.length,
      idleAgents: wsAgents.filter((a) => a.status === 'idle').length,
      busyAgents: wsAgents.filter((a) => ['planning', 'executing', 'reviewing'].includes(a.status))
        .length,
      errorAgents: wsAgents.filter((a) => a.status === 'error').length,
      activeTickets: activeTickets.length,
      failedTickets: failedTickets.length,
      hasOrchestrator: wsAgents.some((a) => a.isWsOrchestrator),
    }
  }

  /**
   * Get health summaries for all active workspaces.
   */
  async getAllWorkspacesHealth(): Promise<WorkspaceHealthSummary[]> {
    const activeWorkspaces = await this.db.query.workspaces.findMany({
      where: eq(workspaces.lifecycleState, 'active'),
    })

    const results: WorkspaceHealthSummary[] = []
    for (const ws of activeWorkspaces) {
      results.push(await this.getWorkspaceHealth(ws.id))
    }

    return results
  }

  // ── Agent Rebalancing ───────────────────────────────────────────────

  /**
   * Get agent distribution across workspaces.
   */
  async getAgentAllocation(): Promise<
    Array<{
      workspaceId: string
      workspaceName: string
      total: number
      idle: number
      busy: number
      error: number
    }>
  > {
    const activeWorkspaces = await this.db.query.workspaces.findMany({
      where: eq(workspaces.lifecycleState, 'active'),
    })

    const allocation = []
    for (const ws of activeWorkspaces) {
      const wsAgents = await this.db.query.agents.findMany({
        where: eq(agents.workspaceId, ws.id),
      })
      allocation.push({
        workspaceId: ws.id,
        workspaceName: ws.name,
        total: wsAgents.length,
        idle: wsAgents.filter((a) => a.status === 'idle').length,
        busy: wsAgents.filter((a) => ['planning', 'executing', 'reviewing'].includes(a.status))
          .length,
        error: wsAgents.filter((a) => a.status === 'error').length,
      })
    }

    return allocation
  }

  /**
   * Rebalance idle agents from underloaded to overloaded workspaces.
   * Only moves idle, non-orchestrator agents.
   */
  async rebalanceAgents(): Promise<Array<{ agentId: string; from: string; to: string }>> {
    const allocation = await this.getAgentAllocation()
    const moves: Array<{ agentId: string; from: string; to: string }> = []

    // Find overloaded workspaces (all agents busy, has queued tickets)
    const overloaded = []
    for (const ws of allocation) {
      if (ws.idle === 0 && ws.busy > 0) {
        const queuedTickets = await this.db.query.tickets.findMany({
          where: and(eq(tickets.workspaceId, ws.workspaceId), eq(tickets.status, 'queued')),
        })
        if (queuedTickets.length > 0) {
          overloaded.push({ ...ws, queuedCount: queuedTickets.length })
        }
      }
    }

    // Find underloaded workspaces (have idle non-orchestrator agents)
    for (const target of overloaded) {
      for (const source of allocation) {
        if (source.workspaceId === target.workspaceId) continue
        if (source.idle <= 1) continue // Keep at least 1 idle agent

        // Find a moveable idle agent (non-orchestrator)
        const idleAgent = await this.db.query.agents.findFirst({
          where: and(
            eq(agents.workspaceId, source.workspaceId),
            eq(agents.status, 'idle'),
            eq(agents.isWsOrchestrator, false),
          ),
        })

        if (idleAgent) {
          await this.db
            .update(agents)
            .set({ workspaceId: target.workspaceId, updatedAt: new Date() })
            .where(eq(agents.id, idleAgent.id))

          moves.push({
            agentId: idleAgent.id,
            from: source.workspaceId,
            to: target.workspaceId,
          })
          break // One agent per overloaded workspace per run
        }
      }
    }

    return moves
  }

  // ── Budget Governance ───────────────────────────────────────────────

  /**
   * Get system-wide budget summary (placeholder — integrates with TokenLedger).
   */
  async getSystemBudgetSummary(): Promise<{
    totalWorkspaces: number
    activeWorkspaces: number
    workspacesOverBudget: number
    budgetDetails: Array<{ entityId: string; spent: number; limit: number }>
  }> {
    const all = await this.db.query.workspaces.findMany()
    const active = all.filter((w) => w.lifecycleState === 'active')

    // Check budget status for entities with budget limits
    const budgets = await this.db.query.tokenBudgets.findMany()
    const budgetDetails: Array<{ entityId: string; spent: number; limit: number }> = []

    for (const budget of budgets) {
      if (!budget.dailyLimitUsd) continue

      // Sum today's spend for this entity
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const ledgerEntries = await this.db.query.tokenLedger.findMany({
        where: eq(tokenLedger.entityId, budget.entityId),
      })
      const totalSpent = ledgerEntries.reduce((sum, e) => sum + (e.costUsd ?? 0), 0)

      budgetDetails.push({
        entityId: budget.entityId,
        spent: totalSpent,
        limit: budget.dailyLimitUsd,
      })
    }

    return {
      totalWorkspaces: all.length,
      activeWorkspaces: active.length,
      workspacesOverBudget: budgetDetails.filter((b) => b.spent > b.limit).length,
      budgetDetails,
    }
  }

  // ── Health Monitoring ───────────────────────────────────────────────

  /**
   * Run a health monitoring sweep across all active workspaces.
   * Logs lifecycle events for degraded workspaces.
   */
  async monitorHealth(): Promise<{
    checkedAt: Date
    workspacesChecked: number
    issues: Array<{ workspaceId: string; issue: string; severity: 'warning' | 'critical' }>
  }> {
    const healthReports = await this.getAllWorkspacesHealth()
    const issues: Array<{ workspaceId: string; issue: string; severity: 'warning' | 'critical' }> =
      []

    for (const report of healthReports) {
      // Check for workspaces without orchestrators
      if (!report.hasOrchestrator) {
        issues.push({
          workspaceId: report.workspaceId,
          issue: 'Missing orchestrator agent',
          severity: 'critical',
        })
      }

      // Check for workspaces with all agents in error state
      if (report.agentCount > 0 && report.errorAgents === report.agentCount) {
        issues.push({
          workspaceId: report.workspaceId,
          issue: 'All agents in error state',
          severity: 'critical',
        })
      }

      // Check for high failure rate
      if (report.failedTickets > 5) {
        issues.push({
          workspaceId: report.workspaceId,
          issue: `High ticket failure count: ${report.failedTickets}`,
          severity: 'warning',
        })
      }

      // Check for all agents busy with no idle capacity
      if (report.agentCount > 0 && report.idleAgents === 0 && report.busyAgents > 0) {
        issues.push({
          workspaceId: report.workspaceId,
          issue: 'No idle agent capacity',
          severity: 'warning',
        })
      }
    }

    // Log critical issues as lifecycle events
    for (const issue of issues.filter((i) => i.severity === 'critical')) {
      await this.db.insert(workspaceLifecycleEvents).values({
        workspaceId: issue.workspaceId,
        eventType: 'health_alert',
        payload: {
          issue: issue.issue,
          severity: issue.severity,
          checkedAt: new Date().toISOString(),
        },
      })
    }

    return {
      checkedAt: new Date(),
      workspacesChecked: healthReports.length,
      issues,
    }
  }

  /**
   * Remove duplicate system workspaces and orphaned agents.
   * Keeps the first system workspace (by creation date) and removes the rest.
   */
  async cleanupDuplicates(): Promise<{ removedWorkspaces: number; removedAgents: number }> {
    // Find all system workspaces with isSystemProtected or name='System Orchestrator'
    const systemWorkspaces = await this.db.query.workspaces.findMany({
      where: or(
        eq(workspaces.isSystemProtected, true),
        and(eq(workspaces.name, 'System Orchestrator'), eq(workspaces.type, 'system')),
      ),
    })

    if (systemWorkspaces.length <= 1) return { removedWorkspaces: 0, removedAgents: 0 }

    // Keep the oldest, remove the rest
    const sorted = systemWorkspaces.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    const toRemove = sorted.slice(1)

    let removedAgents = 0
    for (const ws of toRemove) {
      // Delete agents in the duplicate workspace
      const wsAgents = await this.db.query.agents.findMany({
        where: eq(agents.workspaceId, ws.id),
      })
      for (const agent of wsAgents) {
        await this.db.delete(agents).where(eq(agents.id, agent.id))
        removedAgents++
      }
      // Delete the workspace
      await this.db
        .delete(workspaces)
        .where(eq(workspaces.id, ws.id))
        .catch((err) => {
          logger.error(
            { err: err instanceof Error ? err : undefined },
            '[SystemOrchestrator] Failed to delete workspace',
          )
        })
    }

    return { removedWorkspaces: toRemove.length, removedAgents }
  }
}
