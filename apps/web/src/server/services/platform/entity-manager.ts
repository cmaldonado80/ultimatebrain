/**
 * Brain Entity Manager
 *
 * Manages the brain entity hierarchy:
 * - Entity provisioning (create, configure, activate)
 * - Agent role assignment (primary, monitor, healer, specialist)
 * - Health checks and status management
 * - Strategy runs (goal → ticket decomposition)
 */

import type { Database } from '@solarc/db'
import {
  agents,
  brainEntities,
  brainEntityAgents,
  orchestratorRoutes,
  strategyRuns,
} from '@solarc/db'
import { and, desc, eq, sql } from 'drizzle-orm'

import { logger } from '../../../lib/logger'

export type EntityTier = 'brain' | 'mini_brain' | 'development'
export type EntityStatus = 'active' | 'suspended' | 'degraded' | 'provisioning'
export type AgentRole = 'primary' | 'monitor' | 'healer' | 'specialist'

export interface CreateEntityInput {
  name: string
  domain?: string
  tier: EntityTier
  parentId?: string
  enginesEnabled?: string[]
  config?: Record<string, unknown>
  endpoint?: string
  healthEndpoint?: string
}

export interface EntityHealth {
  entityId: string
  status: EntityStatus
  lastCheck: Date | null
  agentCount: number
  engineCount: number
}

export class EntityManager {
  constructor(private db: Database) {}

  /**
   * Create and provision a new brain entity.
   */
  async create(input: CreateEntityInput) {
    // Governance: validate tier hierarchy
    if (input.tier === 'brain' && input.parentId) {
      throw new Error('Brain-tier entities cannot have a parent')
    }
    if (input.tier === 'mini_brain') {
      if (input.parentId) {
        const parent = await this.db.query.brainEntities.findFirst({
          where: eq(brainEntities.id, input.parentId),
        })
        if (parent && parent.tier !== 'brain') {
          throw new Error('Mini-brain can only be a child of a brain entity')
        }
      }
    }
    if (input.tier === 'development') {
      if (!input.parentId) {
        throw new Error('Development entities must have a parent (mini_brain or brain)')
      }
    }

    const [entity] = await this.db
      .insert(brainEntities)
      .values({
        name: input.name,
        domain: input.domain,
        tier: input.tier,
        parentId: input.parentId,
        enginesEnabled: input.enginesEnabled ?? [],
        config: input.config,
        endpoint: input.endpoint,
        healthEndpoint: input.healthEndpoint,
        status: 'provisioning',
      })
      .returning()

    // Sync entity to OpenClaw daemon (non-blocking)
    this.syncEntityToOpenClaw(entity!.id).catch((err) =>
      logger.warn(
        { err: err instanceof Error ? err : undefined },
        '[EntityManager] OpenClaw sync failed',
      ),
    )

    return entity!
  }

  /**
   * Activate an entity (mark as ready).
   */
  async activate(entityId: string): Promise<void> {
    await this.db
      .update(brainEntities)
      .set({
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(brainEntities.id, entityId))
    this.syncEntityToOpenClaw(entityId).catch((err) =>
      logger.warn(
        { err: err instanceof Error ? err : undefined },
        '[EntityManager] OpenClaw sync failed',
      ),
    )
  }

  /**
   * Suspend an entity.
   */
  async suspend(entityId: string): Promise<void> {
    await this.db
      .update(brainEntities)
      .set({
        status: 'suspended',
        updatedAt: new Date(),
      })
      .where(eq(brainEntities.id, entityId))
  }

  /**
   * Mark as degraded (partial failure).
   */
  async degrade(entityId: string): Promise<void> {
    await this.db
      .update(brainEntities)
      .set({
        status: 'degraded',
        updatedAt: new Date(),
      })
      .where(eq(brainEntities.id, entityId))
  }

  /**
   * Get entity by ID.
   */
  async get(entityId: string) {
    return this.db.query.brainEntities.findFirst({
      where: eq(brainEntities.id, entityId),
    })
  }

  /**
   * List entities by tier.
   */
  async listByTier(tier?: EntityTier) {
    return this.db.query.brainEntities.findMany({
      where: tier ? eq(brainEntities.tier, tier) : undefined,
    })
  }

  /**
   * Get entity hierarchy (parent + children).
   */
  async getHierarchy(entityId: string) {
    const entity = await this.get(entityId)
    if (!entity) return null

    const children = await this.db.query.brainEntities.findMany({
      where: eq(brainEntities.parentId, entityId),
    })

    let parent = null
    if (entity.parentId) {
      parent = await this.get(entity.parentId)
    }

    return { entity, parent, children }
  }

  // === Agent Role Assignment ===

  async assignAgent(entityId: string, agentId: string, role: AgentRole): Promise<void> {
    await this.db.insert(brainEntityAgents).values({
      entityId,
      agentId,
      role,
    })
  }

  async removeAgent(entityId: string, agentId: string): Promise<void> {
    await this.db
      .delete(brainEntityAgents)
      .where(and(eq(brainEntityAgents.entityId, entityId), eq(brainEntityAgents.agentId, agentId)))
  }

  async getEntityAgents(entityId: string) {
    return this.db
      .select({
        agentId: brainEntityAgents.agentId,
        role: brainEntityAgents.role,
        agentName: agents.name,
        agentStatus: agents.status,
      })
      .from(brainEntityAgents)
      .innerJoin(agents, eq(brainEntityAgents.agentId, agents.id))
      .where(eq(brainEntityAgents.entityId, entityId))
  }

  // === Health ===

  async recordHealthCheck(entityId: string, status: EntityStatus): Promise<void> {
    await this.db
      .update(brainEntities)
      .set({
        status,
        lastHealthCheck: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(brainEntities.id, entityId))
  }

  async getHealth(entityId: string): Promise<EntityHealth | null> {
    const entity = await this.get(entityId)
    if (!entity) return null

    const agentCount = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(brainEntityAgents)
      .where(eq(brainEntityAgents.entityId, entityId))

    return {
      entityId,
      status: entity.status as EntityStatus,
      lastCheck: entity.lastHealthCheck,
      agentCount: agentCount[0]?.count ?? 0,
      engineCount: (entity.enginesEnabled ?? []).length,
    }
  }

  // === Strategy Runs ===

  async createStrategyRun(plan: string, workspaceId?: string, agentId?: string) {
    const [run] = await this.db
      .insert(strategyRuns)
      .values({
        plan,
        status: 'pending',
        workspaceId,
        agentId,
      })
      .returning()
    return run!
  }

  async startStrategyRun(runId: string, ticketIds: string[]): Promise<void> {
    await this.db
      .update(strategyRuns)
      .set({
        status: 'running',
        tickets: ticketIds,
        startedAt: new Date(),
      })
      .where(eq(strategyRuns.id, runId))
  }

  async completeStrategyRun(runId: string): Promise<void> {
    await this.db
      .update(strategyRuns)
      .set({
        status: 'completed',
        completedAt: new Date(),
      })
      .where(eq(strategyRuns.id, runId))
  }

  async failStrategyRun(runId: string): Promise<void> {
    await this.db
      .update(strategyRuns)
      .set({
        status: 'failed',
        completedAt: new Date(),
      })
      .where(eq(strategyRuns.id, runId))
  }

  async getStrategyRuns(workspaceId?: string) {
    return this.db.query.strategyRuns.findMany({
      where: workspaceId ? eq(strategyRuns.workspaceId, workspaceId) : undefined,
      orderBy: desc(strategyRuns.createdAt),
      limit: 50,
    })
  }

  // === Cross-Workspace Routing ===

  async addRoute(fromWorkspace: string, toWorkspace: string, rule: string, priority = 0) {
    const [route] = await this.db
      .insert(orchestratorRoutes)
      .values({
        fromWorkspace,
        toWorkspace,
        rule,
        priority,
      })
      .returning()
    return route!
  }

  async getRoutes(fromWorkspace?: string) {
    return this.db.query.orchestratorRoutes.findMany({
      where: fromWorkspace ? eq(orchestratorRoutes.fromWorkspace, fromWorkspace) : undefined,
      orderBy: desc(orchestratorRoutes.priority),
    })
  }

  async deleteRoute(routeId: string): Promise<void> {
    await this.db.delete(orchestratorRoutes).where(eq(orchestratorRoutes.id, routeId))
  }

  /** Push entity registration to OpenClaw daemon (fire-and-forget). */
  private async syncEntityToOpenClaw(entityId: string): Promise<void> {
    const { getOpenClawClient } = await import('../../adapters/openclaw/bootstrap')
    const client = getOpenClawClient()
    if (!client?.isConnected()) return
    const entity = await this.get(entityId)
    if (!entity) return
    client.send({
      type: 'entity.register',
      requestId: crypto.randomUUID(),
      entity: {
        id: entity.id,
        name: entity.name,
        tier: entity.tier,
        parentId: entity.parentId,
        enginesEnabled: entity.enginesEnabled,
        status: entity.status,
      },
    })
  }
}
