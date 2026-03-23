import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { CognitionManager, ChatSessionManager, AgentMessagingService } from '../services/intelligence'

let cognition: CognitionManager | null = null
let chatManager: ChatSessionManager | null = null
let messaging: AgentMessagingService | null = null

function getCognition(db: any) { return cognition ??= new CognitionManager(db) }
function getChatManager(db: any) { return chatManager ??= new ChatSessionManager(db) }
function getMessaging(db: any) { return messaging ??= new AgentMessagingService(db) }

export const intelligenceRouter = router({
  // === Cognition State ===

  features: publicProcedure.query(async ({ ctx }) => {
    return getCognition(ctx.db).getFeatures()
  }),

  setFeature: publicProcedure
    .input(z.object({ name: z.string().min(1), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return getCognition(ctx.db).setFeature(input.name, input.enabled)
    }),

  isFeatureEnabled: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return getCognition(ctx.db).isFeatureEnabled(input.name)
    }),

  policies: publicProcedure.query(async ({ ctx }) => {
    return getCognition(ctx.db).getPolicies()
  }),

  setPolicy: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      value: z.union([z.string(), z.number(), z.boolean()]),
    }))
    .mutation(async ({ ctx, input }) => {
      return getCognition(ctx.db).setPolicy(input.name, input.value)
    }),

  removePolicy: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return getCognition(ctx.db).removePolicy(input.name)
    }),

  cognitionState: publicProcedure.query(async ({ ctx }) => {
    return getCognition(ctx.db).getState()
  }),

  // === Prompt Overlays ===

  overlays: publicProcedure
    .input(z.object({ workspaceId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getCognition(ctx.db).getActiveOverlays(input?.workspaceId)
    }),

  createOverlay: publicProcedure
    .input(z.object({
      content: z.string().min(1),
      workspaceId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getCognition(ctx.db).createOverlay(input.content, input.workspaceId)
    }),

  toggleOverlay: publicProcedure
    .input(z.object({ id: z.string().uuid(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return getCognition(ctx.db).toggleOverlay(input.id, input.active)
    }),

  deleteOverlay: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getCognition(ctx.db).deleteOverlay(input.id)
    }),

  buildPromptOverlay: publicProcedure
    .input(z.object({ workspaceId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getCognition(ctx.db).buildPromptOverlay(input?.workspaceId)
    }),

  // === Agent Trust Scores ===

  trustScore: publicProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getCognition(ctx.db).getTrustScore(input.agentId)
    }),

  updateTrustScore: publicProcedure
    .input(z.object({
      agentId: z.string().uuid(),
      score: z.number().min(0).max(1),
      factors: z.object({
        taskCompletionRate: z.number().min(0).max(1),
        errorRate: z.number().min(0).max(1),
        avgResponseTime: z.number().min(0),
        guardrailViolations: z.number().min(0),
        userRating: z.number().min(0).max(1),
      }).partial().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getCognition(ctx.db).updateTrustScore(input.agentId, input.score, input.factors)
    }),

  recalculateTrust: publicProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getCognition(ctx.db).recalculateTrust(input.agentId)
    }),

  // === Chat Sessions ===

  chatSessions: publicProcedure
    .input(z.object({ agentId: z.string().uuid().optional(), limit: z.number().min(1).max(100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getChatManager(ctx.db).listSessions(input?.agentId, input?.limit)
    }),

  chatSession: publicProcedure
    .input(z.object({ id: z.string().uuid(), messageLimit: z.number().min(1).max(500).optional() }))
    .query(async ({ ctx, input }) => {
      return getChatManager(ctx.db).getSession(input.id, input.messageLimit)
    }),

  createChatSession: publicProcedure
    .input(z.object({ agentId: z.string().uuid().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      return getChatManager(ctx.db).createSession(input?.agentId)
    }),

  addChatMessage: publicProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      role: z.string().min(1),
      text: z.string().min(1),
      attachment: z.unknown().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getChatManager(ctx.db).addMessage(input.sessionId, input.role, input.text, input.attachment)
    }),

  chatContextWindow: publicProcedure
    .input(z.object({ sessionId: z.string().uuid(), windowSize: z.number().min(1).max(500).optional() }))
    .query(async ({ ctx, input }) => {
      return getChatManager(ctx.db).getContextWindow(input.sessionId, input.windowSize)
    }),

  compactChat: publicProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      summary: z.string().min(1),
      keepRecent: z.number().min(1).max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return getChatManager(ctx.db).compact(input.sessionId, input.summary, input.keepRecent)
    }),

  deleteChatSession: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getChatManager(ctx.db).deleteSession(input.id)
    }),

  // === Agent Messaging ===

  sendMessage: publicProcedure
    .input(z.object({
      fromAgentId: z.string().uuid(),
      toAgentId: z.string().uuid(),
      text: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return getMessaging(ctx.db).send(input)
    }),

  broadcastMessage: publicProcedure
    .input(z.object({
      fromAgentId: z.string().uuid(),
      workspaceId: z.string().uuid(),
      text: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return getMessaging(ctx.db).broadcast(input.fromAgentId, input.workspaceId, input.text)
    }),

  agentInbox: publicProcedure
    .input(z.object({ agentId: z.string().uuid(), limit: z.number().min(1).max(200).optional() }))
    .query(async ({ ctx, input }) => {
      return getMessaging(ctx.db).inbox(input.agentId, input.limit)
    }),

  agentMessageHistory: publicProcedure
    .input(z.object({ agentId: z.string().uuid(), limit: z.number().min(1).max(500).optional() }))
    .query(async ({ ctx, input }) => {
      return getMessaging(ctx.db).history(input.agentId, input.limit)
    }),

  messageThread: publicProcedure
    .input(z.object({
      agentA: z.string().uuid(),
      agentB: z.string().uuid(),
      limit: z.number().min(1).max(200).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return getMessaging(ctx.db).thread(input.agentA, input.agentB, input.limit)
    }),

  markMessagesRead: publicProcedure
    .input(z.object({ messageIds: z.array(z.string().uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      return getMessaging(ctx.db).markRead(input.messageIds)
    }),

  markAllRead: publicProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return getMessaging(ctx.db).markAllRead(input.agentId)
    }),

  acknowledgeMessage: publicProcedure
    .input(z.object({
      messageId: z.string().uuid(),
      status: z.enum(['pending', 'received', 'processed', 'failed']),
    }))
    .mutation(async ({ ctx, input }) => {
      return getMessaging(ctx.db).acknowledge(input.messageId, input.status)
    }),

  unreadCount: publicProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getMessaging(ctx.db).unreadCount(input.agentId)
    }),
})
