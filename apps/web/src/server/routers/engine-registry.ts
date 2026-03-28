/**
 * Engine Registry Router — centralized engine health and usage tracking.
 */
import { z } from 'zod'

import type { EngineId } from '../services/engine-registry/registry'
import { EngineRegistry } from '../services/engine-registry/registry'
import { protectedProcedure, router } from '../trpc'

let _registry: EngineRegistry | null = null
function getRegistry() {
  return (_registry ??= new EngineRegistry())
}

const engineIdEnum = z.enum([
  'llm',
  'memory',
  'eval',
  'guardrails',
  'a2a',
  'healing',
  'orchestration',
  'gateway',
  'mcp',
  'playbooks',
  'visual-qa',
  'presence',
  'adaptive',
  'skills',
])

export const engineRegistryRouter = router({
  /** List all engines with health status */
  list: protectedProcedure.query(() => {
    return getRegistry().listEngines()
  }),

  /** Get a single engine by ID */
  get: protectedProcedure.input(z.object({ id: engineIdEnum })).query(({ input }) => {
    return getRegistry().getEngine(input.id as EngineId)
  }),

  /** Update engine health status */
  updateStatus: protectedProcedure
    .input(
      z.object({ id: engineIdEnum, status: z.enum(['healthy', 'degraded', 'down', 'unknown']) }),
    )
    .mutation(({ input }) => {
      getRegistry().updateStatus(input.id as EngineId, input.status)
      return { updated: true }
    }),

  /** Connect an app to an engine */
  connectApp: protectedProcedure
    .input(z.object({ appId: z.string(), appName: z.string(), engineId: engineIdEnum }))
    .mutation(({ input }) => {
      getRegistry().connectApp(input.appId, input.appName, input.engineId as EngineId)
      return { connected: true }
    }),

  /** Register a custom engine */
  registerEngine: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().default(''),
        domain: z.string().optional(),
      }),
    )
    .mutation(({ input }) => {
      return getRegistry().registerCustomEngine(input)
    }),

  /** List engines by category */
  listByCategory: protectedProcedure
    .input(z.object({ category: z.enum(['system', 'domain', 'custom']) }))
    .query(({ input }) => {
      return getRegistry().listByCategory(input.category)
    }),

  /** Record a request to an engine from an app */
  recordRequest: protectedProcedure
    .input(
      z.object({
        appId: z.string(),
        engineId: engineIdEnum,
        durationMs: z.number().min(0),
        error: z.boolean().default(false),
      }),
    )
    .mutation(({ input }) => {
      getRegistry().recordRequest(
        input.appId,
        input.engineId as EngineId,
        input.durationMs,
        input.error,
      )
      return { recorded: true }
    }),
})
