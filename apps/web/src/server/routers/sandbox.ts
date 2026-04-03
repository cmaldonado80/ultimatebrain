/**
 * Sandbox Router — tRPC endpoints for the sandbox execution layer.
 */
import { z } from 'zod'

import { getSandboxOrchestrator } from '../services/sandbox'
import { protectedProcedure, router } from '../trpc'

export const sandboxRouter = router({
  /** Get orchestrator status */
  status: protectedProcedure.query(() => {
    return getSandboxOrchestrator().getStatus()
  }),

  /** Get audit summary */
  auditSummary: protectedProcedure.query(() => {
    return getSandboxOrchestrator().getAudit().getSummary()
  }),

  /** Get recent audit entries */
  auditEntries: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).optional() }).optional())
    .query(({ input }) => {
      return getSandboxOrchestrator().getAudit().getRecentEntries(input?.limit)
    }),

  /** Get audit entries for a specific agent */
  agentAudit: protectedProcedure
    .input(z.object({ agentId: z.string().uuid(), limit: z.number().min(1).max(200).optional() }))
    .query(({ input }) => {
      return getSandboxOrchestrator().getAudit().getAgentEntries(input.agentId, input.limit)
    }),

  /** Get sandbox for a specific agent */
  agentSandbox: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(({ input }) => {
      return getSandboxOrchestrator().executor.getAgentSandbox(input.agentId) ?? null
    }),

  /** Get all active sandboxes */
  allSandboxes: protectedProcedure.query(() => {
    return getSandboxOrchestrator().executor.manager.getAllSandboxes()
  }),

  /** Get policy for a specific agent */
  agentPolicy: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(({ input }) => {
      return getSandboxOrchestrator().executor.getAgentPolicy(input.agentId) ?? null
    }),

  /** Get all policies */
  allPolicies: protectedProcedure.query(() => {
    return getSandboxOrchestrator().executor.policyEngine.getAllPolicies()
  }),

  /** Set department quota */
  setDepartmentQuota: protectedProcedure
    .input(
      z.object({
        departmentId: z.string(),
        maxConcurrentSandboxes: z.number().min(1).max(100).optional(),
        maxTotalExecutionsPerHour: z.number().min(1).max(10000).optional(),
      }),
    )
    .mutation(({ input }) => {
      getSandboxOrchestrator().setQuota(input.departmentId, input)
      return { success: true }
    }),

  /** Get executor stats */
  executorStats: protectedProcedure.query(() => {
    return getSandboxOrchestrator().executor.getStats()
  }),

  /** Get pool stats */
  poolStats: protectedProcedure.query(() => {
    return getSandboxOrchestrator().executor.manager.getStats()
  }),

  /** Discover available tools with classifications */
  discoverTools: protectedProcedure
    .input(
      z
        .object({
          tier: z.enum(['safe', 'privileged', 'raw']).optional(),
          destructiveOnly: z.boolean().optional(),
          networkOnly: z.boolean().optional(),
        })
        .optional(),
    )
    .query(({ input }) => {
      const { discoverTools } =
        require('../services/chat/tool-discovery') as typeof import('../services/chat/tool-discovery')
      return discoverTools(input ?? undefined)
    }),

  /** Get documentation for a specific tool */
  toolDoc: protectedProcedure.input(z.object({ toolName: z.string() })).query(({ input }) => {
    const { getToolDoc } =
      require('../services/chat/tool-discovery') as typeof import('../services/chat/tool-discovery')
    return getToolDoc(input.toolName)
  }),
})
