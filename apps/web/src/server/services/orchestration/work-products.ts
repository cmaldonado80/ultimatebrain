/**
 * Work Products — Track agent deliverables with review state.
 *
 * Inspired by Paperclip AI's work products service.
 * Uses the existing artifacts table (id, name, content, ticketId, agentId, type).
 * Review state and metadata stored as JSON in the content field prefix.
 */

import type { Database } from '@solarc/db'
import { artifacts } from '@solarc/db'
import { desc, eq } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

export type ReviewState = 'pending' | 'approved' | 'rejected' | 'needs_revision'

export interface WorkProduct {
  id: string
  ticketId: string | null
  name: string
  type: string | null
  content: string | null
  reviewState: ReviewState
  isPrimary: boolean
  agentId: string | null
  createdAt: Date
}

export interface CreateWorkProductInput {
  ticketId: string
  name: string
  type?: string
  content?: string
  agentId?: string
  isPrimary?: boolean
}

// ── Metadata Encoding ───────────────────────────────────────────────
// We store review state in the type field as "type:reviewState:isPrimary"

function encodeType(type: string, reviewState: ReviewState, isPrimary: boolean): string {
  return `${type}|${reviewState}|${isPrimary ? '1' : '0'}`
}

function decodeType(encoded: string | null): {
  type: string
  reviewState: ReviewState
  isPrimary: boolean
} {
  if (!encoded || !encoded.includes('|')) {
    return { type: encoded ?? 'other', reviewState: 'pending', isPrimary: false }
  }
  const [type, state, primary] = encoded.split('|')
  return {
    type: type ?? 'other',
    reviewState: (state as ReviewState) ?? 'pending',
    isPrimary: primary === '1',
  }
}

// ── Service ─────────────────────────────────────────────────────────

export async function createWorkProduct(
  db: Database,
  input: CreateWorkProductInput,
): Promise<{ id: string }> {
  const [created] = await db
    .insert(artifacts)
    .values({
      name: input.name,
      content: input.content ?? null,
      ticketId: input.ticketId,
      agentId: input.agentId ?? null,
      type: encodeType(input.type ?? 'other', 'pending', input.isPrimary ?? false),
    })
    .returning({ id: artifacts.id })

  return { id: created!.id }
}

export async function listWorkProducts(db: Database, ticketId: string): Promise<WorkProduct[]> {
  const results = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.ticketId, ticketId))
    .orderBy(desc(artifacts.createdAt))

  return results.map((r) => {
    const decoded = decodeType(r.type)
    return {
      id: r.id,
      ticketId: r.ticketId,
      name: r.name,
      type: decoded.type,
      content: r.content,
      reviewState: decoded.reviewState,
      isPrimary: decoded.isPrimary,
      agentId: r.agentId,
      createdAt: r.createdAt,
    }
  })
}

export async function reviewWorkProduct(
  db: Database,
  artifactId: string,
  reviewState: ReviewState,
): Promise<void> {
  const existing = await db.query.artifacts.findFirst({
    where: eq(artifacts.id, artifactId),
  })
  if (!existing) return

  const decoded = decodeType(existing.type)
  await db
    .update(artifacts)
    .set({
      type: encodeType(decoded.type, reviewState, decoded.isPrimary),
      updatedAt: new Date(),
    })
    .where(eq(artifacts.id, artifactId))
}
