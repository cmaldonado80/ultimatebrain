/**
 * Session Rotation — Auto-rotate bloated chat sessions.
 *
 * Inspired by Paperclip AI's session compaction with threshold rotation.
 * When a session exceeds thresholds (message count, token usage, or age),
 * create a new session with a summary handoff from the old one.
 *
 * Prevents sessions from growing unbounded and keeps agent context fresh.
 */

import type { Database } from '@solarc/db'
import { chatMessages, chatSessions } from '@solarc/db'
import { desc, eq, sql } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

export interface RotationConfig {
  /** Max messages before rotation (default: 100) */
  maxMessages: number
  /** Max estimated tokens before rotation (default: 200,000) */
  maxTokens: number
  /** Max age in hours before rotation (default: 24) */
  maxAgeHours: number
}

export interface RotationCheck {
  needsRotation: boolean
  reason: string | null
  messageCount: number
  estimatedTokens: number
  ageHours: number
}

export interface RotationResult {
  rotated: boolean
  oldSessionId: string
  newSessionId: string | null
  reason: string | null
  handoffSummary: string | null
}

// ── Defaults ────────────────────────────────────────────────────────

const DEFAULT_CONFIG: RotationConfig = {
  maxMessages: 100,
  maxTokens: 200_000,
  maxAgeHours: 24,
}

// ── Session Health Check ────────────────────────────────────────────

/**
 * Check if a session needs rotation based on thresholds.
 */
export async function checkSessionHealth(
  db: Database,
  sessionId: string,
  config: RotationConfig = DEFAULT_CONFIG,
): Promise<RotationCheck> {
  // Count messages
  const [msgCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))

  const messageCount = msgCount?.count ?? 0

  // Estimate tokens (rough: avg message ~200 tokens)
  const [tokenEst] = await db
    .select({
      chars: sql<number>`coalesce(sum(length(${chatMessages.text})), 0)::int`,
    })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))

  const estimatedTokens = Math.ceil((tokenEst?.chars ?? 0) / 4)

  // Session age
  const session = await db.query.chatSessions.findFirst({
    where: eq(chatSessions.id, sessionId),
  })
  const ageMs = session ? Date.now() - session.createdAt.getTime() : 0
  const ageHours = ageMs / (1000 * 60 * 60)

  // Check thresholds
  let reason: string | null = null
  if (messageCount >= config.maxMessages) {
    reason = `Message limit exceeded (${messageCount}/${config.maxMessages})`
  } else if (estimatedTokens >= config.maxTokens) {
    reason = `Token limit exceeded (~${estimatedTokens}/${config.maxTokens})`
  } else if (ageHours >= config.maxAgeHours) {
    reason = `Age limit exceeded (${ageHours.toFixed(1)}h/${config.maxAgeHours}h)`
  }

  return {
    needsRotation: reason !== null,
    reason,
    messageCount,
    estimatedTokens,
    ageHours,
  }
}

/**
 * Rotate a session — create a new session with a handoff summary
 * from the old session's last messages.
 */
export async function rotateSession(
  db: Database,
  oldSessionId: string,
  generateSummary?: (messages: Array<{ role: string; content: string }>) => Promise<string>,
): Promise<RotationResult> {
  // Get the old session
  const oldSession = await db.query.chatSessions.findFirst({
    where: eq(chatSessions.id, oldSessionId),
  })
  if (!oldSession) {
    return {
      rotated: false,
      oldSessionId,
      newSessionId: null,
      reason: 'Session not found',
      handoffSummary: null,
    }
  }

  // Get last 10 messages for handoff context
  const recentMessages = await db
    .select({ role: chatMessages.role, text: chatMessages.text })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, oldSessionId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(10)

  const handoffMessages = recentMessages.reverse().map((m) => ({ role: m.role, content: m.text }))

  // Generate handoff summary (if summarizer provided)
  let handoffSummary: string | null = null
  if (generateSummary && handoffMessages.length > 0) {
    try {
      handoffSummary = await generateSummary(handoffMessages)
    } catch {
      // Fallback: use last user message as summary
      const lastUser = [...handoffMessages].reverse().find((m) => m.role === 'user')
      handoffSummary = lastUser
        ? `[Session rotated] Last topic: ${lastUser.content.slice(0, 500)}`
        : '[Session rotated due to threshold]'
    }
  }

  // Create new session linked to old one
  const [newSession] = await db
    .insert(chatSessions)
    .values({
      agentId: oldSession.agentId,
      workspaceId: oldSession.workspaceId,
      modelOverride: oldSession.modelOverride,
      parentSessionId: oldSessionId,
    })
    .returning({ id: chatSessions.id })

  if (!newSession?.id) {
    return {
      rotated: false,
      oldSessionId,
      newSessionId: null,
      reason: 'Failed to create new session',
      handoffSummary,
    }
  }

  // Insert handoff summary as first system message in new session
  if (handoffSummary) {
    await db.insert(chatMessages).values({
      sessionId: newSession.id,
      role: 'system',
      text: `[Handoff from previous session]\n\n${handoffSummary}`,
    })
  }

  return {
    rotated: true,
    oldSessionId,
    newSessionId: newSession.id,
    reason: 'Session rotated to fresh context',
    handoffSummary,
  }
}
