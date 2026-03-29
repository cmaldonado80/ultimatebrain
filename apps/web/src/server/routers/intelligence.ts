/**
 * Intelligence Router — cognition, chat sessions, and agent messaging.
 *
 * Manages conversational AI sessions, cognitive processing pipelines,
 * and inter-agent messaging for collaborative reasoning.
 */
import type { Database } from '@solarc/db'
import { chatRuns, chatRunSteps, playbooks, runMemoryUsage } from '@solarc/db'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { GatewayRouter } from '../services/gateway'
import {
  AgentMessagingService,
  ChatSessionManager,
  CognitionManager,
} from '../services/intelligence'
import { protectedProcedure, router } from '../trpc'

let cognition: CognitionManager | null = null
let chatManager: ChatSessionManager | null = null
let messaging: AgentMessagingService | null = null
let gateway: GatewayRouter | null = null

function getCognition(db: Database) {
  return (cognition ??= new CognitionManager(db))
}
function getChatManager(db: Database) {
  return (chatManager ??= new ChatSessionManager(db))
}
function getMessaging(db: Database) {
  return (messaging ??= new AgentMessagingService(db))
}
function getGateway(db: Database) {
  return (gateway ??= new GatewayRouter(db))
}

export const intelligenceRouter = router({
  // === Cognition State ===

  features: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await getCognition(ctx.db).getFeatures()
    } catch {
      return {}
    }
  }),

  setFeature: protectedProcedure
    .input(z.object({ name: z.string().min(1), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return getCognition(ctx.db).setFeature(input.name, input.enabled)
    }),

  isFeatureEnabled: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return getCognition(ctx.db).isFeatureEnabled(input.name)
    }),

  policies: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await getCognition(ctx.db).getPolicies()
    } catch {
      return {}
    }
  }),

  setPolicy: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        value: z.union([z.string(), z.number(), z.boolean()]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getCognition(ctx.db).setPolicy(input.name, input.value)
    }),

  removePolicy: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return getCognition(ctx.db).removePolicy(input.name)
    }),

  cognitionState: protectedProcedure.query(async ({ ctx }) => {
    try {
      const state = await getCognition(ctx.db).getState()
      // Return safe default when table is empty (no singleton row yet)
      return state ?? { id: '1', features: {}, policies: {}, updatedAt: new Date() }
    } catch {
      return { id: '1', features: {}, policies: {}, updatedAt: new Date() }
    }
  }),

  // === Prompt Overlays ===

  overlays: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getCognition(ctx.db).getActiveOverlays(input?.workspaceId)
    }),

  createOverlay: protectedProcedure
    .input(
      z.object({
        content: z.string().min(1),
        workspaceId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getCognition(ctx.db).createOverlay(input.content, input.workspaceId)
    }),

  toggleOverlay: protectedProcedure
    .input(z.object({ id: z.string().uuid(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return getCognition(ctx.db).toggleOverlay(input.id, input.active)
    }),

  deleteOverlay: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getCognition(ctx.db).deleteOverlay(input.id)
    }),

  buildPromptOverlay: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getCognition(ctx.db).buildPromptOverlay(input?.workspaceId)
    }),

  // === Agent Trust Scores ===

  trustScore: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getCognition(ctx.db).getTrustScore(input.agentId)
    }),

  updateTrustScore: protectedProcedure
    .input(
      z.object({
        agentId: z.string().uuid(),
        score: z.number().min(0).max(1),
        factors: z
          .object({
            taskCompletionRate: z.number().min(0).max(1),
            errorRate: z.number().min(0).max(1),
            avgResponseTime: z.number().min(0),
            guardrailViolations: z.number().min(0),
            userRating: z.number().min(0).max(1),
          })
          .partial()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getCognition(ctx.db).updateTrustScore(input.agentId, input.score, input.factors)
    }),

  recalculateTrust: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getCognition(ctx.db).recalculateTrust(input.agentId)
    }),

  // === Chat Sessions ===

  chatSessions: protectedProcedure
    .input(
      z
        .object({
          agentId: z.string().uuid().optional(),
          workspaceId: z.string().uuid().optional(),
          limit: z.number().min(1).max(100).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return getChatManager(ctx.db).listSessions(input?.agentId, input?.limit, input?.workspaceId)
    }),

  chatSession: protectedProcedure
    .input(z.object({ id: z.string().uuid(), messageLimit: z.number().min(1).max(500).optional() }))
    .query(async ({ ctx, input }) => {
      return getChatManager(ctx.db).getSession(input.id, input.messageLimit)
    }),

  createChatSession: protectedProcedure
    .input(
      z
        .object({
          agentId: z.string().uuid().optional(),
          workspaceId: z.string().uuid().optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      return getChatManager(ctx.db).createSession(input?.agentId, input?.workspaceId)
    }),

  addChatMessage: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        role: z.string().min(1),
        text: z.string().min(1),
        attachment: z.unknown().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getChatManager(ctx.db).addMessage(
        input.sessionId,
        input.role,
        input.text,
        input.attachment,
      )
    }),

  sendChatMessage: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        text: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getChatManager(ctx.db).sendAndReply(input.sessionId, input.text, getGateway(ctx.db))
    }),

  chatContextWindow: protectedProcedure
    .input(
      z.object({ sessionId: z.string().uuid(), windowSize: z.number().min(1).max(500).optional() }),
    )
    .query(async ({ ctx, input }) => {
      return getChatManager(ctx.db).getContextWindow(input.sessionId, input.windowSize)
    }),

  compactChat: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        summary: z.string().min(1),
        keepRecent: z.number().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getChatManager(ctx.db).compact(input.sessionId, input.summary, input.keepRecent)
    }),

  autoCompactChat: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        keepRecent: z.number().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getChatManager(ctx.db).autoCompact(input.sessionId, input.keepRecent)
    }),

  deleteChatSession: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getChatManager(ctx.db).deleteSession(input.id)
    }),

  // === Execution Run Tracking ===

  /** Get a chat run with its steps */
  getRun: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.db.query.chatRuns.findFirst({
        where: eq(chatRuns.id, input.runId),
      })
      if (!run) return null
      const steps = await ctx.db.query.chatRunSteps.findMany({
        where: eq(chatRunSteps.runId, input.runId),
      })
      return { run, steps: steps.sort((a, b) => a.sequence - b.sequence) }
    }),

  /** Get full (untruncated) tool result for a step */
  getFullToolResult: protectedProcedure
    .input(z.object({ stepId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const step = await ctx.db.query.chatRunSteps.findFirst({
        where: eq(chatRunSteps.id, input.stepId),
      })
      return step
        ? { toolName: step.toolName, toolInput: step.toolInput, toolResult: step.toolResult }
        : null
    }),

  /** List runs for a session (newest first) */
  sessionRuns: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.chatRuns.findMany({
        where: eq(chatRuns.sessionId, input.sessionId),
        orderBy: desc(chatRuns.startedAt),
        limit: input.limit,
      })
    }),

  /** Save a workflow from an existing run's steps */
  saveWorkflowFromRun: protectedProcedure
    .input(z.object({ runId: z.string().uuid(), name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const run = await ctx.db.query.chatRuns.findFirst({
        where: eq(chatRuns.id, input.runId),
      })
      if (!run) throw new Error('Run not found')
      const steps = await ctx.db.query.chatRunSteps.findMany({
        where: eq(chatRunSteps.runId, input.runId),
      })
      const sortedSteps = steps.sort((a, b) => a.sequence - b.sequence)
      const playbookSteps = sortedSteps.map((s) => ({
        index: s.sequence,
        name: s.agentName ?? s.toolName ?? 'step',
        type: s.type === 'tool' ? ('api_call' as const) : ('custom' as const),
        description: s.type === 'tool' ? `Call tool: ${s.toolName}` : `Agent: ${s.agentName}`,
        parameters: (s.toolInput as Record<string, unknown>) ?? {},
      }))
      const [saved] = await ctx.db
        .insert(playbooks)
        .values({
          name: input.name,
          steps: playbookSteps,
          createdBy: `run:${input.runId}`,
        })
        .returning()
      return saved
    }),

  /** Get memory usage for a specific run */
  getRunMemories: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.runMemoryUsage.findMany({
        where: eq(runMemoryUsage.runId, input.runId),
      })
    }),

  /** Compare two runs side by side */
  compareRuns: protectedProcedure
    .input(z.object({ runIdA: z.string().uuid(), runIdB: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const fetchDetails = async (runId: string) => {
        const run = await ctx.db.query.chatRuns.findFirst({ where: eq(chatRuns.id, runId) })
        if (!run) return null
        const [steps, memUsage] = await Promise.all([
          ctx.db.query.chatRunSteps.findMany({ where: eq(chatRunSteps.runId, runId) }),
          ctx.db.query.runMemoryUsage.findMany({ where: eq(runMemoryUsage.runId, runId) }),
        ])
        return { run, steps: steps.sort((a, b) => a.sequence - b.sequence), memoryUsage: memUsage }
      }

      const [a, b] = await Promise.all([fetchDetails(input.runIdA), fetchDetails(input.runIdB)])
      if (!a || !b) throw new Error('Run not found')

      const toolCountA = a.steps.filter((s) => s.type === 'tool').length
      const toolCountB = b.steps.filter((s) => s.type === 'tool').length
      const agentNamesA = [...new Set(a.steps.filter((s) => s.agentName).map((s) => s.agentName!))]
      const agentNamesB = [...new Set(b.steps.filter((s) => s.agentName).map((s) => s.agentName!))]
      const avgConfA =
        a.memoryUsage.length > 0
          ? a.memoryUsage.reduce((sum, m) => sum + (m.confidence ?? 0), 0) / a.memoryUsage.length
          : null
      const avgConfB =
        b.memoryUsage.length > 0
          ? b.memoryUsage.reduce((sum, m) => sum + (m.confidence ?? 0), 0) / b.memoryUsage.length
          : null

      return {
        runA: { id: a.run.id, status: a.run.status, startedAt: a.run.startedAt },
        runB: { id: b.run.id, status: b.run.status, startedAt: b.run.startedAt },
        sections: [
          {
            label: 'Outcome',
            items: [
              {
                key: 'Status',
                a: a.run.status,
                b: b.run.status,
                changed: a.run.status !== b.run.status,
              },
              {
                key: 'Duration (ms)',
                a: a.run.durationMs,
                b: b.run.durationMs,
                changed: a.run.durationMs !== b.run.durationMs,
              },
            ],
          },
          {
            label: 'Execution',
            items: [
              {
                key: 'Step Count',
                a: a.run.stepCount ?? a.steps.length,
                b: b.run.stepCount ?? b.steps.length,
                changed:
                  (a.run.stepCount ?? a.steps.length) !== (b.run.stepCount ?? b.steps.length),
              },
              {
                key: 'Agents Used',
                a: agentNamesA.join(', ') || 'none',
                b: agentNamesB.join(', ') || 'none',
                changed: agentNamesA.join(',') !== agentNamesB.join(','),
              },
              {
                key: 'Tool Calls',
                a: toolCountA,
                b: toolCountB,
                changed: toolCountA !== toolCountB,
              },
            ],
          },
          {
            label: 'Memory',
            items: [
              {
                key: 'Memories Used',
                a: a.run.memoryCount ?? a.memoryUsage.length,
                b: b.run.memoryCount ?? b.memoryUsage.length,
                changed:
                  (a.run.memoryCount ?? a.memoryUsage.length) !==
                  (b.run.memoryCount ?? b.memoryUsage.length),
              },
              {
                key: 'Avg Confidence',
                a: avgConfA !== null ? Math.round(avgConfA * 100) / 100 : null,
                b: avgConfB !== null ? Math.round(avgConfB * 100) / 100 : null,
                changed: avgConfA !== avgConfB,
              },
            ],
          },
        ],
      }
    }),

  // === Agent Messaging ===

  sendMessage: protectedProcedure
    .input(
      z.object({
        fromAgentId: z.string().uuid(),
        toAgentId: z.string().uuid(),
        text: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getMessaging(ctx.db).send(input)
    }),

  broadcastMessage: protectedProcedure
    .input(
      z.object({
        fromAgentId: z.string().uuid(),
        workspaceId: z.string().uuid(),
        text: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getMessaging(ctx.db).broadcast(input.fromAgentId, input.workspaceId, input.text)
    }),

  agentInbox: protectedProcedure
    .input(z.object({ agentId: z.string().uuid(), limit: z.number().min(1).max(200).optional() }))
    .query(async ({ ctx, input }) => {
      return getMessaging(ctx.db).inbox(input.agentId, input.limit)
    }),

  agentMessageHistory: protectedProcedure
    .input(z.object({ agentId: z.string().uuid(), limit: z.number().min(1).max(500).optional() }))
    .query(async ({ ctx, input }) => {
      return getMessaging(ctx.db).history(input.agentId, input.limit)
    }),

  messageThread: protectedProcedure
    .input(
      z.object({
        agentA: z.string().uuid(),
        agentB: z.string().uuid(),
        limit: z.number().min(1).max(200).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return getMessaging(ctx.db).thread(input.agentA, input.agentB, input.limit)
    }),

  markMessagesRead: protectedProcedure
    .input(z.object({ messageIds: z.array(z.string().uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      return getMessaging(ctx.db).markRead(input.messageIds)
    }),

  markAllRead: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getMessaging(ctx.db).markAllRead(input.agentId)
    }),

  acknowledgeMessage: protectedProcedure
    .input(
      z.object({
        messageId: z.string().uuid(),
        status: z.enum(['pending', 'received', 'processed', 'failed']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getMessaging(ctx.db).acknowledge(input.messageId, input.status)
    }),

  unreadCount: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getMessaging(ctx.db).unreadCount(input.agentId)
    }),

  // === OpenClaw Proxy (for Mini Brains & Developments) ===

  // === OpenClaw Proxy (for Mini Brains & Developments) ===

  /** Entity-scoped LLM chat — Mini Brains call this instead of OpenClaw directly. */
  entityChat: protectedProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        model: z.string().min(1),
        messages: z.array(z.object({ role: z.string(), content: z.string() })),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const gw = getGateway(ctx.db)

      // Check entity budget before routing
      const budgetCheck = await gw.costTracker.checkBudget(input.entityId)
      if (!budgetCheck.allowed) {
        throw new Error(`BUDGET_EXCEEDED: Entity ${input.entityId} has reached its spending limit`)
      }

      const result = await gw.chat({
        model: input.model,
        messages: input.messages,
        agentId: input.entityId, // track cost against this entity
      })

      return result
    }),

  /** Entity-scoped skill invocation through OpenClaw. */
  entitySkillInvoke: protectedProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        skill: z.string().min(1),
        params: z.record(z.unknown()).default({}),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { getOpenClawClient } = await import('../adapters/openclaw/bootstrap')
      const client = getOpenClawClient()
      if (!client || !client.isConnected()) {
        throw new Error('OpenClaw daemon not connected — skill invocation unavailable')
      }

      // Check entity budget
      const gw = getGateway(ctx.db)
      const budgetCheck = await gw.costTracker.checkBudget(input.entityId)
      if (!budgetCheck.allowed) {
        throw new Error(`BUDGET_EXCEEDED: Entity ${input.entityId} has reached its spending limit`)
      }

      const { OpenClawSkills } = await import('../adapters/openclaw/skills')
      const skillsAdapter = new OpenClawSkills(client)
      return skillsAdapter.invokeSkill(input.skill, input.params)
    }),

  /** Entity-scoped channel send through OpenClaw. */
  entityChannelSend: protectedProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        channel: z.string().min(1),
        to: z.string().min(1),
        content: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const { getOpenClawClient } = await import('../adapters/openclaw/bootstrap')
      const client = getOpenClawClient()
      if (!client || !client.isConnected()) {
        throw new Error('OpenClaw daemon not connected — channel send unavailable')
      }

      const { OpenClawChannels } = await import('../adapters/openclaw/channels')
      const channelsAdapter = new OpenClawChannels(client)
      return channelsAdapter.sendMessage(input.channel, input.to, input.content)
    }),

  /** Get OpenClaw connection status (for dashboard health display). */
  openclawStatus: protectedProcedure.query(async () => {
    const { getOpenClawStatus } = await import('../adapters/openclaw/bootstrap')
    return getOpenClawStatus()
  }),
})
