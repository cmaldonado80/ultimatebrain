import { z } from 'zod'
import { router, publicProcedure, protectedProcedure } from '../trpc'
import { CrewEngine } from '../services/crews/crew-engine'
import { RecallFlow } from '../services/memory/recall-flow'

let _crewEngine: CrewEngine | null = null
let _recallFlow: RecallFlow | null = null

function getCrewEngine(db: any) { return _crewEngine ??= new CrewEngine(db) }
function getRecallFlow(db: any, embed: (text: string) => Promise<number[]>) {
  return _recallFlow ??= new RecallFlow(db, embed)
}

// Stub embed function — real impl calls GatewayRouter embed endpoint
const stubEmbed = async (_text: string): Promise<number[]> =>
  new Array(1536).fill(0).map(() => Math.random() - 0.5)

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
        agents: input.agents.map((a) => ({
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
      return getRecallFlow(ctx.db, stubEmbed).search(input)
    }),

  /** Search memory and return a formatted context block for agent injection */
  recallAndInject: publicProcedure
    .input(recallQuerySchema)
    .query(async ({ ctx, input }) => {
      return getRecallFlow(ctx.db, stubEmbed).searchAndInject(input)
    }),

  /** Promote memory IDs that were useful in an agent turn */
  promoteMemories: protectedProcedure
    .input(z.object({ memoryIds: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      await getRecallFlow(ctx.db, stubEmbed).promoteUsedMemories(input.memoryIds)
      return { promoted: input.memoryIds.length }
    }),
})
