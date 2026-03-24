/**
 * Flows Router — deterministic orchestration of crew execution.
 *
 * Flows handle the WHEN — invoking crews with memory recall and gateway integration.
 * Coordinates agent definitions, recall queries, and crew engine execution.
 */
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import type { Database } from '@solarc/db'
import { tickets } from '@solarc/db'
import {
  CrewEngine,
  type AgentDefinition,
  type ToolDefinition,
} from '../services/crews/crew-engine'
import { RecallFlow, type RecallQuery } from '../services/memory/recall-flow'
import { GatewayRouter } from '../services/gateway'
import { MemoryService } from '../services/memory/memory-service'

let _crewEngine: CrewEngine | null = null
let _recallFlow: RecallFlow | null = null
let _gateway: GatewayRouter | null = null
let _memoryService: MemoryService | null = null

function getCrewEngine(db: Database) {
  return (_crewEngine ??= new CrewEngine(db))
}
function getGateway(db: Database) {
  return (_gateway ??= new GatewayRouter(db))
}
function getMemoryService(db: Database) {
  const svc = (_memoryService ??= new MemoryService(db))
  svc.setEmbedFunction((text: string) => realEmbed(text, db))
  return svc
}

/** Build platform tools available to all crew agents */
function buildPlatformTools(db: Database): ToolDefinition[] {
  return [
    {
      name: 'search_memory',
      description:
        "Search the brain's memory system for relevant knowledge. Returns top matches from core, recall, and archival tiers.",
      parameters: {
        query: { type: 'string', description: 'Search query', required: true },
        tier: { type: 'string', description: 'Memory tier: core, recall, or archival (optional)' },
      },
      execute: async (args) => {
        const results = await getMemoryService(db).search(String(args.query), {
          tier: args.tier as 'core' | 'recall' | 'archival' | undefined,
          limit: 5,
        })
        if (results.length === 0) return 'No memories found for this query.'
        return results
          .map((r) => `[${r.tier}] ${r.key}: ${r.content} (score: ${r.score.toFixed(2)})`)
          .join('\n')
      },
    },
    {
      name: 'store_memory',
      description: "Store a new piece of knowledge in the brain's memory system.",
      parameters: {
        key: { type: 'string', description: 'Short identifier for this memory', required: true },
        content: { type: 'string', description: 'The knowledge content to store', required: true },
        tier: {
          type: 'string',
          description: 'Memory tier: core, recall, or archival. Default: recall',
        },
      },
      execute: async (args) => {
        const mem = await getMemoryService(db).store({
          key: String(args.key),
          content: String(args.content),
          tier: (args.tier as 'core' | 'recall' | 'archival') ?? 'recall',
        })
        return `Stored memory "${mem.key}" in ${mem.tier} tier.`
      },
    },
    {
      name: 'create_ticket',
      description: 'Create a new task ticket for another agent or for later execution.',
      parameters: {
        title: { type: 'string', description: 'Ticket title', required: true },
        description: {
          type: 'string',
          description: 'Detailed description of the task',
          required: true,
        },
        priority: {
          type: 'string',
          description: 'Priority: low, medium, high, critical. Default: medium',
        },
      },
      execute: async (args) => {
        const [ticket] = await db
          .insert(tickets)
          .values({
            title: String(args.title),
            description: String(args.description),
            priority: (args.priority as 'low' | 'medium' | 'high' | 'critical') ?? 'medium',
          })
          .returning()
        return `Created ticket "${ticket!.title}" (${ticket!.id.slice(0, 8)}) with priority ${ticket!.priority}.`
      },
    },
    {
      name: 'call_llm',
      description:
        'Make an LLM call for analysis, summarization, or generation. Use this when you need AI reasoning on specific content.',
      parameters: {
        prompt: { type: 'string', description: 'The prompt to send to the LLM', required: true },
      },
      execute: async (args) => {
        const result = await getGateway(db).chat({
          messages: [{ role: 'user', content: String(args.prompt) }],
        })
        return result.content
      },
    },
  ]
}

const realEmbed = async (text: string, db: Database): Promise<number[]> => {
  try {
    const result = await getGateway(db).embed(text)
    return result.embedding
  } catch (err) {
    console.warn('[Flows] Embedding failed, using zero vector:', err)
    return Array(1536).fill(0)
  }
}

function getRecallFlow(db: Database) {
  return (_recallFlow ??= new RecallFlow(db, (text: string) => realEmbed(text, db)))
}

const agentDefinitionSchema = z.object({
  id: z.string(),
  role: z.string(),
  goal: z.string(),
  backstory: z.string(),
  allowDelegation: z.boolean().optional(),
  maxIterations: z.number().int().min(1).max(50).optional(),
  verbose: z.boolean().optional(),
})

const crewDefinitionSchema = z.object({
  name: z.string(),
  agents: z.array(agentDefinitionSchema).min(1),
  task: z.string(),
  verbose: z.boolean().optional(),
})

const recallQuerySchema = z.object({
  query: z.string(),
  agentId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  topK: z.number().int().min(1).max(20).optional(),
  coreConfidenceThreshold: z.number().min(0).max(1).optional(),
  includeArchival: z.boolean().optional(),
})

export const flowsRouter = router({
  /** List saved flow definitions */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.flows.findMany({ limit: 100 })
  }),

  // ── Crew Execution ────────────────────────────────────────────────────

  /** Run a crew on a task (ReAct loop, auto-delegation) */
  runCrew: protectedProcedure.input(crewDefinitionSchema).mutation(async ({ ctx, input }) => {
    const platformTools = buildPlatformTools(ctx.db)
    return getCrewEngine(ctx.db).run({
      name: input.name,
      task: input.task,
      verbose: input.verbose,
      agents: input.agents.map(
        (a): AgentDefinition => ({
          ...a,
          tools: platformTools,
        }),
      ),
    })
  }),

  /** Run a single agent through the ReAct loop */
  runAgent: protectedProcedure
    .input(
      z.object({
        agent: agentDefinitionSchema,
        task: z.string(),
        crewId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const platformTools = buildPlatformTools(ctx.db)
      return getCrewEngine(ctx.db).runAgent(
        { ...input.agent, tools: platformTools } as AgentDefinition,
        input.task,
        input.crewId ?? crypto.randomUUID(),
        platformTools,
      )
    }),

  // ── Recall Flow ───────────────────────────────────────────────────────

  /** Tiered memory search with confidence-based early exit */
  recall: protectedProcedure.input(recallQuerySchema).query(async ({ ctx, input }) => {
    return getRecallFlow(ctx.db).search(input as RecallQuery)
  }),

  /** Search memory and return a formatted context block for agent injection */
  recallAndInject: protectedProcedure.input(recallQuerySchema).query(async ({ ctx, input }) => {
    return getRecallFlow(ctx.db).searchAndInject(input as RecallQuery)
  }),

  /** Promote memory IDs that were useful in an agent turn */
  promoteMemories: protectedProcedure
    .input(z.object({ memoryIds: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      await getRecallFlow(ctx.db).promoteUsedMemories(input.memoryIds)
      return { promoted: input.memoryIds.length }
    }),
})
