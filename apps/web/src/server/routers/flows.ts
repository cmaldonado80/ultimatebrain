import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { CrewEngine } from '../services/crews/crew-engine'
import { RecallFlow } from '../services/memory/recall-flow'

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
  runCrew: publicProcedure
    .input(crewDefinitionSchema)
    .mutation(async ({ ctx, input }) => {
      const engine = new CrewEngine(ctx.db)
      return engine.run({
        name: input.name,
        task: input.task,
        verbose: input.verbose,
        agents: input.agents.map((a) => ({
          ...a,
          tools: [], // tools injected server-side in full impl
        })),
      })
    }),

  /** Run a single agent through the ReAct loop */
  runAgent: publicProcedure
    .input(
      z.object({
        agent: agentDefinitionSchema,
        task: z.string(),
        crewId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const engine = new CrewEngine(ctx.db)
      return engine.runAgent(
        { ...input.agent, tools: [] },
        input.task,
        input.crewId ?? crypto.randomUUID(),
        []
      )
    }),

  // ── Recall Flow ───────────────────────────────────────────────────────

  /** Tiered memory search with confidence-based early exit */
  recall: publicProcedure
    .input(recallQuerySchema)
    .query(async ({ ctx, input }) => {
      // Stub embed function — real impl calls GatewayRouter embed endpoint
      const stubEmbed = async (_text: string): Promise<number[]> =>
        new Array(1536).fill(0).map(() => Math.random() - 0.5)

      const recallFlow = new RecallFlow(ctx.db, stubEmbed)
      return recallFlow.search(input)
    }),

  /** Search memory and return a formatted context block for agent injection */
  recallAndInject: publicProcedure
    .input(recallQuerySchema)
    .query(async ({ ctx, input }) => {
      const stubEmbed = async (_text: string): Promise<number[]> =>
        new Array(1536).fill(0).map(() => Math.random() - 0.5)

      const recallFlow = new RecallFlow(ctx.db, stubEmbed)
      return recallFlow.searchAndInject(input)
    }),

  /** Promote memory IDs that were useful in an agent turn */
  promoteMemories: publicProcedure
    .input(z.object({ memoryIds: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      const stubEmbed = async (_text: string): Promise<number[]> => []
      const recallFlow = new RecallFlow(ctx.db, stubEmbed)
      await recallFlow.promoteUsedMemories(input.memoryIds)
      return { promoted: input.memoryIds.length }
    }),
})
