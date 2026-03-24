/**
 * Ephemeral Swarm Engine
 *
 * Dynamically forms agent teams for complex tasks:
 * - Formation: select agents by skills/availability
 * - Role assignment: lead, worker, reviewer
 * - Lifecycle: active → completed / disbanded
 * - Task distribution across swarm members
 */

import type { Database } from '@solarc/db'
import { ephemeralSwarms, swarmAgents, agents } from '@solarc/db'
import { eq, and, inArray } from 'drizzle-orm'

export type SwarmStatus = 'active' | 'completed' | 'disbanded'
export type SwarmRole = 'lead' | 'worker' | 'reviewer' | 'specialist'

export interface SwarmFormationInput {
  task: string
  /** Required skills for the swarm */
  requiredSkills?: string[]
  /** Minimum number of agents */
  minAgents?: number
  /** Maximum number of agents */
  maxAgents?: number
  /** Workspace to recruit from */
  workspaceId?: string
  /** Pre-selected agent IDs */
  agentIds?: string[]
}

export interface SwarmMember {
  agentId: string
  role: SwarmRole
  agentName: string
}

export interface SwarmInfo {
  id: string
  task: string
  status: string
  members: SwarmMember[]
  createdAt: Date
}

export class SwarmEngine {
  constructor(private db: Database) {}

  /**
   * Form a new ephemeral swarm.
   * Auto-selects agents if agentIds not provided.
   */
  async form(input: SwarmFormationInput): Promise<SwarmInfo> {
    const minAgents = input.minAgents ?? 2
    const maxAgents = input.maxAgents ?? 5

    // Select agents
    let selectedAgents: Array<{ id: string; name: string; skills: string[] | null }>

    if (input.agentIds?.length) {
      selectedAgents = await this.db.query.agents.findMany({
        where: inArray(agents.id, input.agentIds),
      })
    } else {
      // Auto-select available agents
      const conditions = [eq(agents.status, 'idle')]
      if (input.workspaceId) conditions.push(eq(agents.workspaceId, input.workspaceId))

      const available = await this.db.query.agents.findMany({
        where: and(...conditions),
      })

      if (input.requiredSkills?.length) {
        // Score by skill overlap and sort
        const scored = available.map((a) => ({
          ...a,
          skillScore: (a.skills ?? []).filter((s) => input.requiredSkills!.includes(s)).length,
        }))

        // Boost agents whose skills are backed by OpenClaw
        try {
          const { getOpenClawClient } = await import('../../adapters/openclaw/bootstrap')
          const client = getOpenClawClient()
          if (client?.isConnected()) {
            const { OpenClawSkills } = await import('../../adapters/openclaw/skills')
            const ocSkills = new OpenClawSkills(client)
            const catalog = await ocSkills.discoverSkills()
            const ocNames = new Set(catalog.map((s) => s.name))
            for (const agent of scored) {
              const ocMatch = (agent.skills ?? []).filter((s) => ocNames.has(s)).length
              agent.skillScore += ocMatch * 0.1 // bonus for OpenClaw-backed skills
            }
          }
        } catch {
          /* silent fallback to local scoring */
        }

        scored.sort((a, b) => b.skillScore - a.skillScore)
        selectedAgents = scored.slice(0, maxAgents)
      } else {
        selectedAgents = available.slice(0, maxAgents)
      }
    }

    if (selectedAgents.length < minAgents) {
      throw new Error(
        `Not enough agents available: need ${minAgents}, found ${selectedAgents.length}`,
      )
    }

    // Create swarm
    const [swarm] = await this.db
      .insert(ephemeralSwarms)
      .values({
        task: input.task,
        status: 'active',
      })
      .returning()

    // Assign roles
    const members: SwarmMember[] = selectedAgents.map((agent, i) => ({
      agentId: agent.id,
      agentName: agent.name,
      role: assignRole(i, selectedAgents.length),
    }))

    // Insert swarm agents
    await this.db.insert(swarmAgents).values(
      members.map((m) => ({
        swarmId: swarm!.id,
        agentId: m.agentId,
        role: m.role,
      })),
    )

    // Update agent statuses to 'executing'
    await this.db
      .update(agents)
      .set({
        status: 'executing',
        updatedAt: new Date(),
      })
      .where(
        inArray(
          agents.id,
          selectedAgents.map((a) => a.id),
        ),
      )

    return {
      id: swarm!.id,
      task: input.task,
      status: 'active',
      members,
      createdAt: swarm!.createdAt,
    }
  }

  /**
   * Get swarm info including members.
   */
  async get(swarmId: string): Promise<SwarmInfo | null> {
    const swarm = await this.db.query.ephemeralSwarms.findFirst({
      where: eq(ephemeralSwarms.id, swarmId),
    })
    if (!swarm) return null

    const memberRows = await this.db
      .select({
        agentId: swarmAgents.agentId,
        role: swarmAgents.role,
        agentName: agents.name,
      })
      .from(swarmAgents)
      .innerJoin(agents, eq(swarmAgents.agentId, agents.id))
      .where(eq(swarmAgents.swarmId, swarmId))

    return {
      id: swarm.id,
      task: swarm.task,
      status: swarm.status ?? 'active',
      members: memberRows.map((m) => ({
        agentId: m.agentId,
        role: (m.role ?? 'worker') as SwarmRole,
        agentName: m.agentName,
      })),
      createdAt: swarm.createdAt,
    }
  }

  /**
   * Complete a swarm, releasing all agents back to idle.
   */
  async complete(swarmId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(ephemeralSwarms)
        .set({ status: 'completed' })
        .where(eq(ephemeralSwarms.id, swarmId))

      const memberIds = await tx
        .select({ agentId: swarmAgents.agentId })
        .from(swarmAgents)
        .where(eq(swarmAgents.swarmId, swarmId))

      if (memberIds.length > 0) {
        await tx
          .update(agents)
          .set({
            status: 'idle',
            updatedAt: new Date(),
          })
          .where(
            inArray(
              agents.id,
              memberIds.map((m) => m.agentId),
            ),
          )
      }
    })
  }

  /**
   * Disband a swarm (cancel without completion).
   */
  async disband(swarmId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(ephemeralSwarms)
        .set({ status: 'disbanded' })
        .where(eq(ephemeralSwarms.id, swarmId))

      const memberIds = await tx
        .select({ agentId: swarmAgents.agentId })
        .from(swarmAgents)
        .where(eq(swarmAgents.swarmId, swarmId))

      if (memberIds.length > 0) {
        await tx
          .update(agents)
          .set({
            status: 'idle',
            updatedAt: new Date(),
          })
          .where(
            inArray(
              agents.id,
              memberIds.map((m) => m.agentId),
            ),
          )
      }
    })
  }

  /**
   * Add an agent to an existing swarm.
   */
  async addMember(swarmId: string, agentId: string, role: SwarmRole = 'worker'): Promise<void> {
    await this.db.insert(swarmAgents).values({ swarmId, agentId, role })
    await this.db
      .update(agents)
      .set({ status: 'executing', updatedAt: new Date() })
      .where(eq(agents.id, agentId))
  }

  /**
   * Remove an agent from a swarm.
   */
  async removeMember(swarmId: string, agentId: string): Promise<void> {
    await this.db
      .delete(swarmAgents)
      .where(and(eq(swarmAgents.swarmId, swarmId), eq(swarmAgents.agentId, agentId)))
    await this.db
      .update(agents)
      .set({ status: 'idle', updatedAt: new Date() })
      .where(eq(agents.id, agentId))
  }

  /**
   * List active swarms.
   */
  async listActive(): Promise<SwarmInfo[]> {
    const swarms = await this.db.query.ephemeralSwarms.findMany({
      where: eq(ephemeralSwarms.status, 'active'),
    })

    const results: SwarmInfo[] = []
    for (const s of swarms) {
      const info = await this.get(s.id)
      if (info) results.push(info)
    }
    return results
  }
}

// === Helpers ===

function assignRole(index: number, totalCount: number): SwarmRole {
  if (index === 0) return 'lead'
  if (index === totalCount - 1 && totalCount >= 3) return 'reviewer'
  return 'worker'
}
