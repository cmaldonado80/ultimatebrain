/**
 * Mini Brain Factory Router — scaffold and manage Mini Brains and Developments.
 */
import {
  agents,
  brainEntities,
  brainEntityAgents,
  workspaceBindings,
  workspaceLifecycleEvents,
  workspaces,
} from '@solarc/db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { MiniBrainFactory, type MiniBrainTemplate } from '../services/mini-brain-factory/factory'
import { createNeonBranch, deleteNeonBranch, maskConnectionUri } from '../services/neon/neon-api'
import { getAgentSoul } from '../services/orchestration/agents'
import { auditEvent } from '../services/platform/audit'
import { advanceWorkflow, createDeploymentWorkflow } from '../services/platform/deployment-workflow'
import { generateEntityApiKey } from '../services/platform/entity-auth'
import { assertPermission } from '../services/platform/permissions'
import { protectedProcedure, router } from '../trpc'

let _factory: MiniBrainFactory | null = null
function getFactory() {
  return (_factory ??= new MiniBrainFactory())
}

/** Resolve the best Ollama cloud model for a given agent role */
function modelForRole(role: string): string {
  if (role.includes('orchestrat')) return 'deepseek-v3.2:cloud'
  if (role.includes('review') || role.includes('judge')) return 'deepseek-v3.2:cloud'
  if (role.includes('plan') || role.includes('reason')) return 'deepseek-v3.2:cloud'
  if (role.includes('vision') || role.includes('multimodal')) return 'llama-3.2-11b-vision:cloud'
  if (role.includes('guard') || role.includes('safety')) return 'llama-guard-3:cloud'
  // Default for specialists, executors, coders, and general agentic work
  return 'qwen3.5:cloud'
}

const ORCHESTRATOR_MODEL = 'deepseek-v3.2:cloud'

const templateEnum = z.enum(['astrology', 'hospitality', 'healthcare', 'marketing', 'soc-ops'])

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
      // Governance: only platform_owner can create Mini Brains
      await assertPermission(ctx.db, ctx.session.userId, 'create_brain')

      const template = getFactory().getTemplate(input.template as MiniBrainTemplate)
      if (!template) throw new Error(`Template '${input.template}' not found`)

      // Wrap core provisioning in a transaction for atomicity
      const txResult = await ctx.db.transaction(async (tx) => {
        // 1. Create brain entity
        // Generate entity API key for Brain SDK auth
        const { apiKey: entityApiKey, apiKeyHash } = generateEntityApiKey()

        const [entity] = await tx
          .insert(brainEntities)
          .values({
            name: input.name,
            tier: 'mini_brain',
            domain: template.domain,
            parentId: input.parentId,
            enginesEnabled: template.engines,
            status: 'provisioning',
            apiKeyHash,
            ownerUserId: ctx.session.userId,
            organizationId: ctx.session.organizationId,
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
            organizationId: ctx.session.organizationId,
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
            soul:
              getAgentSoul('workflow-orchestrator')?.soul ??
              `You are the orchestrator for ${input.name}, a ${template.domain} mini-brain. Coordinate domain agents, route tasks, monitor health. Engines: ${template.engines.join(', ')}.`,
            skills: ['coordination', 'task-routing', 'domain-routing', 'monitoring'],
            model: ORCHESTRATOR_MODEL,
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
                getAgentSoul(agentDef.name)?.soul ??
                agentDef.soul ??
                `You are ${agentDef.name}, a ${template.domain} specialist. Role: ${agentDef.role}. Capabilities: ${agentDef.capabilities.join(', ')}. Be domain-expert, precise, and actionable.`,
              skills: agentDef.capabilities,
              model: modelForRole(agentDef.role),
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
              console.error(
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

        // 7. Activate workspace (workspace is immediately usable, entity goes through deploy workflow)
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

        // 8. Entity stays at 'provisioning' — deployment workflow handles lifecycle
        return { entity, ws, agentIds, entityApiKey }
      })

      // 9. Create deployment workflow and auto-advance through provision_db + configure
      let workflowId: string | null = null
      try {
        workflowId = await createDeploymentWorkflow(
          ctx.db,
          txResult.entity.id,
          null,
          ctx.session.userId,
        )
        // Auto-advance provision_db and configure steps
        await advanceWorkflow(ctx.db, workflowId, ctx.session.userId)
      } catch (err) {
        // Deployment failed — rollback entity to failed state so it's visible in UI
        console.error(
          `[smartCreate] Deployment workflow failed for ${txResult.entity.id}, marking as failed:`,
          err,
        )
        await ctx.db
          .update(brainEntities)
          .set({ status: 'suspended' })
          .where(eq(brainEntities.id, txResult.entity.id))
      }

      // Audit: log Mini Brain creation
      await auditEvent(
        ctx.db,
        ctx.session.userId,
        'create_mini_brain',
        'brain_entity',
        txResult.entity.id,
        {
          template: template.id,
          name: input.name,
          workspaceId: txResult.ws.id,
          workflowId,
        },
      )

      return {
        entity: {
          id: txResult.entity.id,
          name: txResult.entity.name,
          tier: txResult.entity.tier,
          status: 'provisioning',
        },
        workspace: { id: txResult.ws.id, name: txResult.ws.name },
        agentCount: txResult.agentIds.length + 1, // +1 for orchestrator
        template: template.id,
        workflowId,
        // API key shown once — only hash stored in DB
        apiKey: txResult.entityApiKey,
      }
    }),

  /** Regenerate API key for an entity (returns new key, old key invalidated) */
  regenerateEntityApiKey: protectedProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertPermission(ctx.db, ctx.session.userId, 'rotate_key', {
        type: 'brain_entity',
        id: input.entityId,
      })
      const { apiKey, apiKeyHash } = generateEntityApiKey()
      await ctx.db
        .update(brainEntities)
        .set({ apiKeyHash })
        .where(eq(brainEntities.id, input.entityId))
      await auditEvent(ctx.db, ctx.session.userId, 'rotate_key', 'brain_entity', input.entityId)
      return { apiKey }
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

      // Resolve template before transaction — fuzzy match with parent fallback
      const templateId = input.template ?? input.name.toLowerCase().replace(/\s+/g, '-')
      const devTemplate = getFactory().findDevelopmentTemplate(
        parent.domain as MiniBrainTemplate,
        templateId,
      )
      // Fallback: if no development template matches, use parent mini-brain's template agents
      const parentTemplate = !devTemplate
        ? getFactory().getTemplate(parent.domain as MiniBrainTemplate)
        : null

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
          soul:
            getAgentSoul('workflow-orchestrator')?.soul ??
            `You are the orchestrator for ${input.name}, a development app under ${parent.name}.`,
          skills: ['coordination', 'task-routing'],
          model: ORCHESTRATOR_MODEL,
          requiredModelType: 'router',
        })

        // 5. Create development-specific domain agents from template (or parent fallback)
        const agentDefs = devTemplate?.agents ?? parentTemplate?.agents ?? []
        const agentSource = devTemplate
          ? devTemplate.id
          : parentTemplate
            ? `${parentTemplate.id}-fallback`
            : 'none'
        const agentDomain = devTemplate?.domain ?? parent.domain ?? 'unknown'
        const devAgentIds: string[] = []
        for (const agentDef of agentDefs) {
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
                `You are ${agentDef.name}, a ${agentDomain} specialist. Role: ${agentDef.role}. Capabilities: ${agentDef.capabilities.join(', ')}.`,
              skills: agentDef.capabilities,
              model: modelForRole(agentDef.role),
              requiredModelType: 'agentic',
              tags: [parent.domain ?? 'unknown', agentSource, 'development-agent'],
            })
            .returning()

          if (agent) {
            devAgentIds.push(agent.id)
            try {
              await tx
                .insert(brainEntityAgents)
                .values({ entityId: entity.id, agentId: agent.id, role: 'primary' })
            } catch (linkErr) {
              console.error(
                `[smartCreateDev] Failed to link agent ${agent.id} to entity ${entity.id}:`,
                linkErr,
              )
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

        // 7. Activate workspace, entity stays at 'provisioning' for deployment workflow
        await tx
          .update(workspaces)
          .set({ lifecycleState: 'active' })
          .where(eq(workspaces.id, ws.id))

        return { entity, ws, devAgentIds }
      })

      // 8. Create deployment workflow for the development entity
      let workflowId: string | null = null
      try {
        workflowId = await createDeploymentWorkflow(
          ctx.db,
          input.miniBrainId,
          txResult.entity.id,
          ctx.session.userId,
        )
        await advanceWorkflow(ctx.db, workflowId, ctx.session.userId)
      } catch (err) {
        console.error(`[smartCreateDev] Deployment workflow failed for ${txResult.entity.id}:`, err)
      }

      return {
        entity: {
          id: txResult.entity.id,
          name: txResult.entity.name,
          tier: 'development',
          status: 'provisioning',
        },
        workspace: { id: txResult.ws.id, name: txResult.ws.name },
        agentCount: txResult.devAgentIds.length + 1, // +1 for orchestrator
        template: devTemplate?.id ?? null,
        workflowId,
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

      // 3. Find matching development template (fuzzy match)
      const devTemplate = getFactory().findDevelopmentTemplate(
        domain,
        entity.name.toLowerCase().replace(/\s+/g, '-'),
      )

      // Also try parent template (for mini-brains themselves)
      const parentTemplate = !devTemplate ? getFactory().getTemplate(domain) : null

      const templateAgents = devTemplate?.agents ?? parentTemplate?.agents ?? []

      // 4. Find or create workspace for this entity
      let wsId: string | null = null

      // Try binding lookup first
      const existingBinding = await ctx.db.query.workspaceBindings.findFirst({
        where: eq(workspaceBindings.bindingKey, entity.parentId ?? input.entityId),
      })
      wsId = existingBinding?.workspaceId ?? null

      // Fallback: match by entity name
      if (!wsId) {
        const ws = await ctx.db.query.workspaces.findFirst({
          where: eq(workspaces.name, entity.name),
        })
        wsId = ws?.id ?? null
      }

      // Create workspace if none exists
      if (!wsId) {
        const [ws] = await ctx.db
          .insert(workspaces)
          .values({
            name: entity.name,
            type: 'development',
            goal: `Development app under ${parent?.name ?? 'Brain'}`,
          })
          .returning()
        if (ws) wsId = ws.id
      }

      if (!wsId) throw new Error('Failed to find or create workspace')

      // 5. Ensure binding exists (link workspace → parent entity)
      if (!existingBinding && entity.parentId) {
        try {
          await ctx.db.insert(workspaceBindings).values({
            workspaceId: wsId,
            bindingType: 'brain',
            bindingKey: entity.parentId,
            enabled: true,
          })
        } catch (bindErr) {
          console.error(`[reprovision] Failed to create binding:`, bindErr)
        }
      }

      // 6. Get existing agents for this entity
      let existingAgentNames: string[] = []
      let hasOrchestrator = false
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

      // Also check workspace agents for orchestrator
      const wsAgents = await ctx.db.query.agents.findMany({
        where: eq(agents.workspaceId, wsId),
      })
      hasOrchestrator = wsAgents.some((a) => a.isWsOrchestrator)
      // Merge workspace agent names into existing list
      for (const a of wsAgents) {
        if (!existingAgentNames.includes(a.name.toLowerCase())) {
          existingAgentNames.push(a.name.toLowerCase())
        }
      }

      let added = 0

      // 7. Create orchestrator if missing
      if (!hasOrchestrator) {
        const parentWs = parent
          ? await ctx.db.query.workspaces.findFirst({
              where: eq(workspaces.name, parent.name),
            })
          : null
        const parentOrch = parentWs
          ? await ctx.db.query.agents.findFirst({
              where: and(eq(agents.workspaceId, parentWs.id), eq(agents.isWsOrchestrator, true)),
            })
          : null

        const [orch] = await ctx.db
          .insert(agents)
          .values({
            name: `${entity.name} Orchestrator`,
            type: 'orchestrator',
            workspaceId: wsId,
            isWsOrchestrator: true,
            parentOrchestratorId: parentOrch?.id ?? null,
            soul:
              getAgentSoul('workflow-orchestrator')?.soul ??
              `You are the orchestrator for ${entity.name}, a development app under ${parent?.name ?? 'Brain'}.`,
            skills: ['coordination', 'task-routing'],
            model: ORCHESTRATOR_MODEL,
            requiredModelType: 'router',
            tags: [domain, 'reprovisioned'],
          })
          .returning()

        if (orch) {
          try {
            await ctx.db
              .insert(brainEntityAgents)
              .values({ entityId: input.entityId, agentId: orch.id, role: 'primary' })
          } catch (linkErr) {
            console.error(`[reprovision] Failed to link orchestrator:`, linkErr)
          }
          added++
        }
      }

      // 8. Create missing domain agents from template
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
            workspaceId: wsId,
            description: `${agentDef.role} — ${agentDef.capabilities.join(', ')}`,
            soul:
              agentDef.soul ??
              `You are ${agentDef.name}, a ${domain} specialist. Role: ${agentDef.role}. Capabilities: ${agentDef.capabilities.join(', ')}.`,
            skills: agentDef.capabilities,
            model: modelForRole(agentDef.role),
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
            console.error(
              `[reprovision] Failed to link agent ${agent.id} to entity ${input.entityId}:`,
              linkErr,
            )
          }
          added++
        }
      }

      // 9. Activate workspace and entity if agents were provisioned
      if (added > 0) {
        await ctx.db
          .update(workspaces)
          .set({ lifecycleState: 'active' })
          .where(eq(workspaces.id, wsId))
        await ctx.db
          .update(brainEntities)
          .set({ status: 'active' })
          .where(eq(brainEntities.id, input.entityId))
      }

      return { added, existing: existingAgentNames.length, activated: added > 0 }
    }),
})
