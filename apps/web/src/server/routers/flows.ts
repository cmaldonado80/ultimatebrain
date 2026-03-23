import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import type { Database } from '@solarc/db'
import { CrewEngine, type AgentDefinition } from '../services/crews/crew-engine'
import { RecallFlow, type RecallQuery } from '../services/memory/recall-flow'
import { GatewayRouter } from '../services/gateway'

let _crewEngine: CrewEngine | null = null
let _recallFlow: RecallFlow | null = null
let _gateway: GatewayRouter | null = null

function getCrewEngine(db: Database) { return _crewEngine ??= new CrewEngine(db) }
function getGateway(db: Database) { return _gateway ??= new GatewayRouter(db) }

const realEmbed = async (text: string, db: Database): Promise<number[]> => {
  try { const result = await getGateway(db).embed(text); return result.embedding } catch { return Array(1536).fill(0) }
}

function getRecallFlow(db: Database) {
  return _recallFlow ??= new RecallFlow(db, (text: string) => realEmbed(text, db))
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
  // ── Crew Execution ────────────────────────────────────────────────────

  /** Run a crew on a task (ReAct loop, auto-delegation) */
  runCrew: protectedProcedure
    .input(crewDefinitionSchema)
    .mutation(async ({ ctx, input }) => {
      return getCrewEngine(ctx.db).run({
        name: input.name,
        task: input.task,
        verbose: input.verbose,
        agents: input.agents.map((a): AgentDefinition => ({
          ...a,
          tools: [], // tools injected server-side in full impl
        })),
      })
    }),

  /** Run a single agent through the ReAct loop */
  runAgent: protectedProcedure
    .input(
      z.object({
        agent: agentDefinitionSchema,
        task: z.string(),
        crewId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return getCrewEngine(ctx.db).runAgent(
        { ...input.agent, tools: [] } as AgentDefinition,
        input.task,
        input.crewId ?? crypto.randomUUID(),
        []
      )
    }),

  // ── Recall Flow ───────────────────────────────────────────────────────

  /** Tiered memory search with confidence-based early exit */
  recall: protectedProcedure
    .input(recallQuerySchema)
    .query(async ({ ctx, input }) => {
      return getRecallFlow(ctx.db).search(input as RecallQuery)
    }),

  /** Search memory and return a formatted context block for agent injection */
  recallAndInject: protectedProcedure
    .input(recallQuerySchema)
    .query(async ({ ctx, input }) => {
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
