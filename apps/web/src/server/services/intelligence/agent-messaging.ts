/**
 * Agent Messaging Service
 *
 * Inter-agent communication:
 * - Send messages between agents
 * - Inbox with read/unread tracking
 * - Acknowledgment protocol
 * - Broadcast to workspace agents
 */

import type { Database } from '@solarc/db'
import { agentMessages, agents } from '@solarc/db'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'

export type AckStatus = 'pending' | 'received' | 'processed' | 'failed'

export interface SendMessageInput {
  fromAgentId: string
  toAgentId: string
  text: string
}

export interface AgentMessage {
  id: string
  fromAgentId: string
  toAgentId: string
  text: string
  read: boolean
  ackStatus: AckStatus | null
  createdAt: Date
}

export class AgentMessagingService {
  constructor(private db: Database) {}

  /**
   * Send a message from one agent to another.
   */
  async send(input: SendMessageInput): Promise<AgentMessage> {
    const [msg] = await this.db
      .insert(agentMessages)
      .values({
        fromAgentId: input.fromAgentId,
        toAgentId: input.toAgentId,
        text: input.text,
        read: false,
        ackStatus: 'pending',
      })
      .returning()

    return toMessage(msg!)
  }

  /**
   * Broadcast a message from one agent to all agents in a workspace.
   */
  async broadcast(fromAgentId: string, workspaceId: string, text: string): Promise<AgentMessage[]> {
    const workspaceAgents = await this.db.query.agents.findMany({
      where: eq(agents.workspaceId, workspaceId),
    })

    const recipients = workspaceAgents.filter((a) => a.id !== fromAgentId)
    const messages: AgentMessage[] = []

    for (const recipient of recipients) {
      const msg = await this.send({
        fromAgentId,
        toAgentId: recipient.id,
        text,
      })
      messages.push(msg)
    }

    return messages
  }

  /**
   * Get inbox for an agent (unread messages).
   */
  async inbox(agentId: string, limit = 50): Promise<AgentMessage[]> {
    const msgs = await this.db
      .select()
      .from(agentMessages)
      .where(and(eq(agentMessages.toAgentId, agentId), eq(agentMessages.read, false)))
      .orderBy(desc(agentMessages.createdAt))
      .limit(limit)

    return msgs.map(toMessage)
  }

  /**
   * Get all messages for an agent (sent + received).
   */
  async history(agentId: string, limit = 100): Promise<AgentMessage[]> {
    const msgs = await this.db
      .select()
      .from(agentMessages)
      .where(
        sql`${agentMessages.fromAgentId} = ${agentId} OR ${agentMessages.toAgentId} = ${agentId}`,
      )
      .orderBy(desc(agentMessages.createdAt))
      .limit(limit)

    return msgs.map(toMessage)
  }

  /**
   * Get conversation thread between two agents.
   */
  async thread(agentA: string, agentB: string, limit = 50): Promise<AgentMessage[]> {
    const msgs = await this.db
      .select()
      .from(agentMessages)
      .where(
        sql`(${agentMessages.fromAgentId} = ${agentA} AND ${agentMessages.toAgentId} = ${agentB})
         OR (${agentMessages.fromAgentId} = ${agentB} AND ${agentMessages.toAgentId} = ${agentA})`,
      )
      .orderBy(desc(agentMessages.createdAt))
      .limit(limit)

    return msgs.reverse().map(toMessage)
  }

  /**
   * Mark messages as read.
   */
  async markRead(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return
    await this.db
      .update(agentMessages)
      .set({ read: true })
      .where(inArray(agentMessages.id, messageIds))
  }

  /**
   * Mark all messages in inbox as read.
   */
  async markAllRead(agentId: string): Promise<number> {
    const result = await this.db
      .update(agentMessages)
      .set({ read: true })
      .where(and(eq(agentMessages.toAgentId, agentId), eq(agentMessages.read, false)))
      .returning()
    return result.length
  }

  /**
   * Acknowledge a message.
   */
  async acknowledge(messageId: string, status: AckStatus): Promise<void> {
    await this.db
      .update(agentMessages)
      .set({ ackStatus: status })
      .where(eq(agentMessages.id, messageId))
  }

  /**
   * Get unread count for an agent.
   */
  async unreadCount(agentId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(agentMessages)
      .where(and(eq(agentMessages.toAgentId, agentId), eq(agentMessages.read, false)))

    return result[0]?.count ?? 0
  }
}

// === Helpers ===

function toMessage(row: typeof agentMessages.$inferSelect): AgentMessage {
  return {
    id: row.id,
    fromAgentId: row.fromAgentId,
    toAgentId: row.toAgentId,
    text: row.text,
    read: row.read ?? false,
    ackStatus: (row.ackStatus as AckStatus) ?? null,
    createdAt: row.createdAt,
  }
}
