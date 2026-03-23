/**
 * Chat Session Manager
 *
 * Multi-turn conversation state management:
 * - Session creation and retrieval
 * - Message history with role tracking
 * - Context window management (sliding window + summarization hook)
 * - Session compaction for long conversations
 */

import type { Database } from '@solarc/db'
import { chatSessions, chatMessages } from '@solarc/db'
import { eq, desc, asc, sql } from 'drizzle-orm'

export interface ChatMessage {
  id: string
  role: string
  text: string
  attachment?: unknown
  createdAt: Date
}

export interface SessionWithMessages {
  session: typeof chatSessions.$inferSelect
  messages: ChatMessage[]
  totalMessages: number
}

/** Max messages to keep in context window */
const DEFAULT_CONTEXT_WINDOW = 50

export class ChatSessionManager {
  constructor(private db: Database) {}

  /**
   * Create a new chat session.
   */
  async createSession(agentId?: string) {
    const [session] = await this.db.insert(chatSessions).values({
      agentId,
    }).returning()
    return session!
  }

  /**
   * Get a session with its messages.
   */
  async getSession(sessionId: string, messageLimit?: number): Promise<SessionWithMessages | null> {
    const session = await this.db.query.chatSessions.findFirst({
      where: eq(chatSessions.id, sessionId),
    })
    if (!session) return null

    const [msgs, countResult] = await Promise.all([
      this.db.query.chatMessages.findMany({
        where: eq(chatMessages.sessionId, sessionId),
        orderBy: desc(chatMessages.createdAt),
        limit: messageLimit ?? DEFAULT_CONTEXT_WINDOW,
      }),
      this.db.select({ count: sql<number>`count(*)` })
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId)),
    ])

    return {
      session,
      messages: msgs.reverse().map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        attachment: m.attachment,
        createdAt: m.createdAt,
      })),
      totalMessages: countResult[0]?.count ?? 0,
    }
  }

  /**
   * Add a message to a session.
   */
  async addMessage(
    sessionId: string,
    role: string,
    text: string,
    attachment?: unknown,
  ): Promise<ChatMessage> {
    const [msg] = await this.db.insert(chatMessages).values({
      sessionId,
      role,
      text,
      attachment,
    }).returning()

    // Touch session updatedAt
    await this.db.update(chatSessions).set({ updatedAt: new Date() })
      .where(eq(chatSessions.id, sessionId))

    return {
      id: msg!.id,
      role: msg!.role,
      text: msg!.text,
      attachment: msg!.attachment,
      createdAt: msg!.createdAt,
    }
  }

  /**
   * Get the context window for a session: the last N messages
   * formatted for LLM consumption.
   */
  async getContextWindow(
    sessionId: string,
    windowSize?: number,
  ): Promise<Array<{ role: string; content: string }>> {
    const limit = windowSize ?? DEFAULT_CONTEXT_WINDOW

    const msgs = await this.db.query.chatMessages.findMany({
      where: eq(chatMessages.sessionId, sessionId),
      orderBy: desc(chatMessages.createdAt),
      limit,
    })

    return msgs.reverse().map((m) => ({
      role: m.role,
      content: m.text,
    }))
  }

  /**
   * Compact a session: summarize old messages into a single system message.
   * Keeps the last `keepRecent` messages intact.
   */
  async compact(
    sessionId: string,
    summary: string,
    keepRecent = 10,
  ): Promise<{ removed: number }> {
    const allMsgs = await this.db.query.chatMessages.findMany({
      where: eq(chatMessages.sessionId, sessionId),
      orderBy: asc(chatMessages.createdAt),
    })

    if (allMsgs.length <= keepRecent + 1) return { removed: 0 }

    const toRemove = allMsgs.slice(0, allMsgs.length - keepRecent)

    // Delete old messages
    for (const msg of toRemove) {
      await this.db.delete(chatMessages).where(eq(chatMessages.id, msg.id))
    }

    // Insert summary as first message
    await this.db.insert(chatMessages).values({
      sessionId,
      role: 'system',
      text: `[Session Summary]\n${summary}`,
    })

    return { removed: toRemove.length }
  }

  /**
   * List recent sessions for an agent.
   */
  async listSessions(agentId?: string, limit = 20) {
    return this.db.query.chatSessions.findMany({
      where: agentId ? eq(chatSessions.agentId, agentId) : undefined,
      orderBy: desc(chatSessions.updatedAt),
      limit,
    })
  }

  /**
   * Delete a session and all its messages.
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.db.delete(chatMessages).where(eq(chatMessages.sessionId, sessionId))
    await this.db.delete(chatSessions).where(eq(chatSessions.id, sessionId))
  }
}
