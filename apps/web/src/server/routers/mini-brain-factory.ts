/**
 * Mini Brain Factory Router — scaffold and manage Mini Brains and Developments.
 */
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { MiniBrainFactory, type MiniBrainTemplate } from '../services/mini-brain-factory/factory'
import {
  workspaces,
  agents,
  workspaceBindings,
  workspaceLifecycleEvents,
  brainEntities,
  brainEntityAgents,
} from '@solarc/db'
import { eq, and } from 'drizzle-orm'
import { createNeonBranch, deleteNeonBranch, maskConnectionUri } from '../services/neon/neon-api'

let _factory: MiniBrainFactory | null = null
function getFactory() {
  return (_factory ??= new MiniBrainFactory())
}

const templateEnum = z.enum([
  'astrology',
  'hospitality',
  'healthcare',
  'legal',
  'marketing',
  'soc-ops',
])

export const miniBrainFactoryRouter = router({
  /** List available Mini Brain templates */
  templates: protectedProcedure.query(() => {
    return getFactory().getTemplates()
  }),

  /** Get a single template definition */
  template: protectedProcedure.input(z.object({ id: templateEnum })).query(({ input }) => {
    return getFactory().getTemplate(input.id as MiniBrainTemplate)
  }),

  /** Get development templates for a Mini Brain template */
  developmentTemplates: protectedProcedure
    .input(z.object({ template: templateEnum }))
    .query(({ input }) => {
      return getFactory().getDevelopmentTemplates(input.template as MiniBrainTemplate)
    }),

  /** Create a new Mini Brain from template (legacy — filesystem-based) */
  create: protectedProcedure
    .input(
      z.object({
        template: templateEnum,
        name: z.string().min(1),
        brainEndpoint: z.string().default('http://localhost:3000'),
        brainApiKey: z.string().default('dev-key'),
        databaseUrl: z.string().optional(),
        targetDir: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return getFactory().createMiniBrain({
        ...input,
        template: input.template as MiniBrainTemplate,
      })
    }),

  /** Create a Development app from a Mini Brain template (legacy) */
  createDevelopment: protectedProcedure
    .input(
      z.object({
        template: z.string().min(1),
        name: z.string().min(1),
        miniBrainId: z.string().uuid(),
        targetDir: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return getFactory().createDevelopment(input)
    }),

  /**
   * Smart Create — one-click mini-brain provisioning.
   * Creates: entity + workspace + orchestrator + template agents + binding + activates both.
   */
  smartCreate: protectedProcedure
    .input(
      z.object({
        template: templateEnum,
        name: z.string().min(1),
        parentId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const template = getFactory().getTemplate(input.template as MiniBrainTemplate)
      if (!template) throw new Error(`Template '${input.template}' not found`)

      // Wrap core provisioning in a transaction for atomicity
      const txResult = await ctx.db.transaction(async (tx) => {
        // 1. Create brain entity
        const [entity] = await tx
          .insert(brainEntities)
          .values({
            name: input.name,
            tier: 'mini_brain',
            domain: template.domain,
            parentId: input.parentId,
            enginesEnabled: template.engines,
            status: 'provisioning',
          })
          .returning()
        if (!entity) throw new Error('Failed to create entity')

        // 2. Create workspace
        const [ws] = await tx
          .insert(workspaces)
          .values({
            name: input.name,
            type: 'general',
            goal: `${template.domain} domain — ${template.engines.join(', ')}`,
            icon: template.id,
          })
          .returning()
        if (!ws) throw new Error('Failed to create workspace')

        await tx.insert(workspaceLifecycleEvents).values({
          workspaceId: ws.id,
          eventType: 'created',
          toState: 'draft',
          payload: { template: template.id, seededBy: 'smart-create' },
        })

        // 3. Find system orchestrator for parent linking
        const systemWs = await tx.query.workspaces.findFirst({
          where: eq(workspaces.isSystemProtected, true),
        })
        let parentOrchestratorId: string | null = null
        if (systemWs) {
          const systemOrch = await tx.query.agents.findFirst({
            where: and(eq(agents.workspaceId, systemWs.id), eq(agents.isWsOrchestrator, true)),
          })
          parentOrchestratorId = systemOrch?.id ?? null
        }

        // 4. Create orchestrator agent
        await tx
          .insert(agents)
          .values({
            name: `${input.name} Orchestrator`,
            type: 'orchestrator',
            workspaceId: ws.id,
            isWsOrchestrator: true,
            parentOrchestratorId,
            soul: `You are the orchestrator for ${input.name}, a ${template.domain} mini-brain. Coordinate domain agents, route tasks, monitor health. Engines: ${template.engines.join(', ')}.`,
            skills: ['coordination', 'task-routing', 'domain-routing', 'monitoring'],
            requiredModelType: 'router',
            tags: ['orchestrator', template.id],
          })
          .returning()

        // 5. Create template agents + link to entity
        const agentIds: string[] = []
        for (const agentDef of template.agents) {
          const [agent] = await tx
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
                agentDef.soul ??
                `You are ${agentDef.name}, a ${template.domain} specialist. Role: ${agentDef.role}. Capabilities: ${agentDef.capabilities.join(', ')}. Be domain-expert, precise, and actionable.`,
              skills: agentDef.capabilities,
              requiredModelType: 'agentic',
              tags: [template.id, 'domain-agent'],
            })
            .returning()

          if (agent) {
            agentIds.push(agent.id)
            // Link agent to entity — log on failure instead of silent swallow
            try {
              await tx.insert(brainEntityAgents).values({
                entityId: entity.id,
                agentId: agent.id,
                role: 'primary',
              })
            } catch (linkErr) {
              console.warn(
                `[smartCreate] Failed to link agent ${agent.id} to entity ${entity.id}:`,
                linkErr,
              )
            }
          }
        }

        // 6. Add workspace binding to entity
        await tx.insert(workspaceBindings).values({
          workspaceId: ws.id,
          bindingType: 'brain',
          bindingKey: entity.id,
          enabled: true,
        })

        // 7. Activate workspace
        await tx
          .update(workspaces)
          .set({ lifecycleState: 'active' })
          .where(eq(workspaces.id, ws.id))

        await tx.insert(workspaceLifecycleEvents).values({
          workspaceId: ws.id,
          eventType: 'activated',
          fromState: 'draft',
          toState: 'active',
          payload: { activatedBy: 'smart-create' },
        })

        // 8. Activate entity
        await tx
          .update(brainEntities)
          .set({ status: 'active' })
          .where(eq(brainEntities.id, entity.id))

        return { entity, ws, agentIds }
      })

      // 9. Auto-provision Neon database (outside transaction — non-blocking)
      let databaseHost: string | null = null
      const apiKey = process.env.NEON_API_KEY
      const projectId = process.env.NEON_PROJECT_ID

      if (apiKey && projectId) {
        try {
          const branchName = `mb-${txResult.entity.id.slice(0, 8)}-${input.name.replace(/\W/g, '-').toLowerCase().slice(0, 20)}`
          const result = await createNeonBranch({ apiKey, projectId, branchName })

          await ctx.db
            .update(brainEntities)
            .set({
              databaseUrl: result.connectionUri,
              config: {
                neon: {
                  branchId: result.branchId,
                  endpointId: result.endpointId,
                  host: result.host,
                  databaseName: result.databaseName,
                  createdAt: new Date().toISOString(),
                },
              },
            })
            .where(eq(brainEntities.id, txResult.entity.id))

          databaseHost = result.host
        } catch (err) {
          console.warn(`[smartCreate] Neon auto-provision failed for ${txResult.entity.id}:`, err)
        }
      }

      return {
        entity: {
          id: txResult.entity.id,
          name: txResult.entity.name,
          tier: txResult.entity.tier,
          status: 'active',
        },
        workspace: { id: txResult.ws.id, name: txResult.ws.name },
        agentCount: txResult.agentIds.length + 1, // +1 for orchestrator
        template: template.id,
        database: databaseHost ? { host: databaseHost, provisioned: true } : null,
      }
    }),

  /**
   * Smart Create Development — creates a development under a mini-brain.
   */
  smartCreateDevelopment: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        miniBrainId: z.string().uuid(),
        template: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Verify parent exists
      const parent = await ctx.db.query.brainEntities.findFirst({
        where: eq(brainEntities.id, input.miniBrainId),
      })
      if (!parent) throw new Error('Parent mini-brain not found')

      // Resolve template before transaction
      const templateId = input.template ?? input.name.toLowerCase().replace(/\s+/g, '-')
      const devTemplate = getFactory().getDevelopmentTemplate(
        parent.domain as MiniBrainTemplate,
        templateId,
      )

      // Wrap core provisioning in a transaction
      const txResult = await ctx.db.transaction(async (tx) => {
        // 2. Create development entity
        const [entity] = await tx
          .insert(brainEntities)
          .values({
            name: input.name,
            tier: 'development',
            domain: parent.domain,
            parentId: input.miniBrainId,
            enginesEnabled: parent.enginesEnabled,
            status: 'provisioning',
          })
          .returning()
        if (!entity) throw new Error('Failed to create development entity')

        // 3. Create workspace
        const [ws] = await tx
          .insert(workspaces)
          .values({
            name: input.name,
            type: 'development',
            goal: `Development app under ${parent.name}`,
          })
          .returning()
        if (!ws) throw new Error('Failed to create workspace')

        // 4. Create orchestrator linked to parent's orchestrator
        const parentWs = await tx.query.workspaces.findFirst({
          where: eq(workspaces.name, parent.name),
        })
        const parentOrch = parentWs
          ? await tx.query.agents.findFirst({
              where: and(eq(agents.workspaceId, parentWs.id), eq(agents.isWsOrchestrator, true)),
            })
          : null

        await tx.insert(agents).values({
          name: `${input.name} Orchestrator`,
          type: 'orchestrator',
          workspaceId: ws.id,
          isWsOrchestrator: true,
          parentOrchestratorId: parentOrch?.id ?? null,
          soul: `You are the orchestrator for ${input.name}, a development app under ${parent.name}.`,
          skills: ['coordination', 'task-routing'],
          requiredModelType: 'router',
        })

        // 5. Create development-specific domain agents from template
        const devAgentIds: string[] = []
        if (devTemplate) {
          for (const agentDef of devTemplate.agents) {
            const [agent] = await tx
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
                  agentDef.soul ??
                  `You are ${agentDef.name}, a ${devTemplate.domain} specialist. Role: ${agentDef.role}. Capabilities: ${agentDef.capabilities.join(', ')}.`,
                skills: agentDef.capabilities,
                requiredModelType: 'agentic',
                tags: [parent.domain ?? 'unknown', devTemplate.id, 'development-agent'],
              })
              .returning()

            if (agent) {
              devAgentIds.push(agent.id)
              try {
                await tx
                  .insert(brainEntityAgents)
                  .values({ entityId: entity.id, agentId: agent.id, role: 'primary' })
              } catch (linkErr) {
                console.warn(
                  `[smartCreateDev] Failed to link agent ${agent.id} to entity ${entity.id}:`,
                  linkErr,
                )
              }
            }
          }
        }

        // 6. Add binding
        await tx.insert(workspaceBindings).values({
          workspaceId: ws.id,
          bindingType: 'brain',
          bindingKey: input.miniBrainId,
          enabled: true,
        })

        // 7. Activate both
        await tx
          .update(workspaces)
          .set({ lifecycleState: 'active' })
          .where(eq(workspaces.id, ws.id))
        await tx
          .update(brainEntities)
          .set({ status: 'active' })
          .where(eq(brainEntities.id, entity.id))

        return { entity, ws, devAgentIds }
      })

      // 8. Auto-provision Neon database (outside transaction — non-blocking)
      let databaseHost: string | null = null
      const apiKey = process.env.NEON_API_KEY
      const projectId = process.env.NEON_PROJECT_ID

      if (apiKey && projectId) {
        try {
          const branchName = `dev-${txResult.entity.id.slice(0, 8)}-${input.name.replace(/\W/g, '-').toLowerCase().slice(0, 20)}`
          const result = await createNeonBranch({ apiKey, projectId, branchName })

          await ctx.db
            .update(brainEntities)
            .set({
              databaseUrl: result.connectionUri,
              config: {
                neon: {
                  branchId: result.branchId,
                  endpointId: result.endpointId,
                  host: result.host,
                  databaseName: result.databaseName,
                  createdAt: new Date().toISOString(),
                },
              },
            })
            .where(eq(brainEntities.id, txResult.entity.id))

          databaseHost = result.host
        } catch (err) {
          console.warn(
            `[smartCreateDev] Neon auto-provision failed for ${txResult.entity.id}:`,
            err,
          )
        }
      }

      return {
        entity: {
          id: txResult.entity.id,
          name: txResult.entity.name,
          tier: 'development',
          status: 'active',
        },
        workspace: { id: txResult.ws.id, name: txResult.ws.name },
        agentCount: txResult.devAgentIds.length + 1, // +1 for orchestrator
        template: devTemplate?.id ?? null,
        database: databaseHost ? { host: databaseHost, provisioned: true } : null,
      }
    }),

  // ── Database Provisioning ──────────────────────────────────────────────

  /**
   * Check whether Neon provisioning is available and get database status for an entity.
   */
  databaseStatus: protectedProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const entity = await ctx.db.query.brainEntities.findFirst({
        where: eq(brainEntities.id, input.entityId),
      })
      if (!entity) throw new Error('Entity not found')

      const neonAvailable = !!(process.env.NEON_API_KEY && process.env.NEON_PROJECT_ID)
      const config = (entity.config as Record<string, unknown>) ?? {}
      const neonConfig = config.neon as { branchId?: string } | undefined

      return {
        provisioned: !!entity.databaseUrl,
        host: entity.databaseUrl ? maskConnectionUri(entity.databaseUrl) : null,
        branchId: neonConfig?.branchId ?? null,
        neonAvailable,
      }
    }),

  /**
   * Provision a dedicated Neon database branch for a mini-brain.
   */
  provisionDatabase: protectedProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const apiKey = process.env.NEON_API_KEY
      const projectId = process.env.NEON_PROJECT_ID
      if (!apiKey || !projectId) {
        throw new Error(
          'Neon API not configured. Set NEON_API_KEY and NEON_PROJECT_ID in environment.',
        )
      }

      const entity = await ctx.db.query.brainEntities.findFirst({
        where: eq(brainEntities.id, input.entityId),
      })
      if (!entity) throw new Error('Entity not found')
      if (entity.databaseUrl) throw new Error('Database already provisioned for this entity')

      // Set provisioning status
      await ctx.db
        .update(brainEntities)
        .set({ status: 'provisioning' })
        .where(eq(brainEntities.id, input.entityId))

      try {
        const branchName = `mb-${input.entityId.slice(0, 8)}-${entity.name.replace(/\W/g, '-').toLowerCase().slice(0, 20)}`
        const result = await createNeonBranch({
          apiKey,
          projectId,
          branchName,
        })

        // Store database URL and branch metadata
        const existingConfig = (entity.config as Record<string, unknown>) ?? {}
        await ctx.db
          .update(brainEntities)
          .set({
            databaseUrl: result.connectionUri,
            status: 'active',
            config: {
              ...existingConfig,
              neon: {
                branchId: result.branchId,
                endpointId: result.endpointId,
                host: result.host,
                databaseName: result.databaseName,
                createdAt: new Date().toISOString(),
              },
            },
          })
          .where(eq(brainEntities.id, input.entityId))

        return {
          success: true,
          branchId: result.branchId,
          host: result.host,
          maskedUri: maskConnectionUri(result.connectionUri),
        }
      } catch (err) {
        // Restore active status on failure
        await ctx.db
          .update(brainEntities)
          .set({ status: 'active' })
          .where(eq(brainEntities.id, input.entityId))
        throw err
      }
    }),

  /**
   * Deprovision (delete) a mini-brain's dedicated database branch.
   */
  deprovisionDatabase: protectedProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const apiKey = process.env.NEON_API_KEY
      const projectId = process.env.NEON_PROJECT_ID
      if (!apiKey || !projectId) {
        throw new Error('Neon API not configured')
      }

      const entity = await ctx.db.query.brainEntities.findFirst({
        where: eq(brainEntities.id, input.entityId),
      })
      if (!entity) throw new Error('Entity not found')

      const config = (entity.config as Record<string, unknown>) ?? {}
      const neonConfig = config.neon as { branchId?: string } | undefined
      if (!neonConfig?.branchId) throw new Error('No Neon branch found for this entity')

      await deleteNeonBranch({
        apiKey,
        projectId,
        branchId: neonConfig.branchId,
      })

      // Clear database URL and neon config
      const { neon: _, ...restConfig } = config
      await ctx.db
        .update(brainEntities)
        .set({
          databaseUrl: null,
          config: Object.keys(restConfig).length > 0 ? restConfig : null,
        })
        .where(eq(brainEntities.id, input.entityId))

      return { success: true }
    }),

  /**
   * Reprovision agents for an existing development entity from its template.
   * Adds missing template agents without duplicating existing ones.
   */
  reprovisionAgents: protectedProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // 1. Load entity
      const entity = await ctx.db.query.brainEntities.findFirst({
        where: eq(brainEntities.id, input.entityId),
      })
      if (!entity) throw new Error('Entity not found')

      // 2. Find parent to determine domain
      const parent = entity.parentId
        ? await ctx.db.query.brainEntities.findFirst({
            where: eq(brainEntities.id, entity.parentId),
          })
        : null

      const domain = (parent?.domain ?? entity.domain) as MiniBrainTemplate
      if (!domain) throw new Error('Cannot determine domain for template lookup')

      // 3. Find matching development template
      const devTemplate = getFactory().getDevelopmentTemplate(
        domain,
        entity.name.toLowerCase().replace(/\s+/g, '-'),
      )

      // Also try parent template (for mini-brains themselves)
      const parentTemplate = !devTemplate ? getFactory().getTemplate(domain) : null

      const templateAgents = devTemplate?.agents ?? parentTemplate?.agents ?? []
      if (templateAgents.length === 0) {
        return { added: 0, existing: 0, message: 'No matching template found' }
      }

      // 4. Get existing agents for this entity
      let existingAgentNames: string[] = []
      try {
        const links = await ctx.db.query.brainEntityAgents.findMany({
          where: eq(brainEntityAgents.entityId, input.entityId),
        })
        const agentIds = links.map((l) => l.agentId)
        if (agentIds.length > 0) {
          const existingAgents = await Promise.all(
            agentIds.map((id) => ctx.db.query.agents.findFirst({ where: eq(agents.id, id) })),
          )
          existingAgentNames = existingAgents.filter(Boolean).map((a) => a!.name.toLowerCase())
        }
      } catch {
        // brainEntityAgents may not exist yet
      }

      // 5. Find the workspace for this entity (via workspace bindings)
      const binding = await ctx.db.query.workspaceBindings.findFirst({
        where: eq(workspaceBindings.bindingKey, entity.parentId ?? input.entityId),
      })

      // Also check by entity name matching workspace name
      let wsId = binding?.workspaceId
      if (!wsId) {
        const ws = await ctx.db.query.workspaces.findFirst({
          where: eq(workspaces.name, entity.name),
        })
        wsId = ws?.id
      }

      // 6. Create missing agents
      let added = 0
      for (const agentDef of templateAgents) {
        if (existingAgentNames.includes(agentDef.name.toLowerCase())) continue

        const [agent] = await ctx.db
          .insert(agents)
          .values({
            name: agentDef.name,
            type: agentDef.role.includes('review')
              ? 'reviewer'
              : agentDef.role.includes('plan')
                ? 'planner'
                : 'specialist',
            workspaceId: wsId ?? null,
            description: `${agentDef.role} — ${agentDef.capabilities.join(', ')}`,
            soul:
              agentDef.soul ??
              `You are ${agentDef.name}, a specialist. Role: ${agentDef.role}. Capabilities: ${agentDef.capabilities.join(', ')}.`,
            skills: agentDef.capabilities,
            requiredModelType: 'agentic',
            tags: [domain, 'reprovisioned'],
          })
          .returning()

        if (agent) {
          try {
            await ctx.db
              .insert(brainEntityAgents)
              .values({ entityId: input.entityId, agentId: agent.id, role: 'primary' })
          } catch (linkErr) {
            console.warn(
              `[reprovision] Failed to link agent ${agent.id} to entity ${input.entityId}:`,
              linkErr,
            )
          }
          added++
        }
      }

      return { added, existing: existingAgentNames.length }
    }),
})
