/**
 * Cross-Tier Intelligence Digest — Propagates learning across mini brain boundaries.
 *
 * Two mechanisms:
 * 1. Auto-promote soul fragments to global when adopted by 3+ agents
 * 2. Generate weekly digest of top learnings across all mini brains
 */

import type { Database } from '@solarc/db'
import { memories, soulFragments } from '@solarc/db'
import { and, desc, eq, gte, sql } from 'drizzle-orm'

import type { GatewayRouter } from '../gateway'

// ── Types ─────────────────────────────────────────────────────────────

export interface DigestResult {
  fragmentsPromoted: number
  observationsCollected: number
  digestId: string | null
}

// ── Fragment Global Promotion ────────────────────────────────────────

const ADOPTION_THRESHOLD = 3

/**
 * Promote soul fragments to global visibility when adopted by enough agents.
 * Should be called after runCrossAgentLearning().
 */
export async function promoteFragmentsToGlobal(db: Database): Promise<number> {
  const result = await db
    .update(soulFragments)
    .set({ isGlobal: true })
    .where(
      and(eq(soulFragments.isGlobal, false), gte(soulFragments.adoptedByCount, ADOPTION_THRESHOLD)),
    )
    .returning({ id: soulFragments.id })

  return result.length
}

// ── Cross-Tier Observation Propagation ──────────────────────────────

const PROOF_THRESHOLD = 10

/**
 * Copy high-proof observations to parent tier memory.
 * Prevents duplicates by checking sourceMemoryIds.
 */
export async function propagateHighProofObservations(db: Database): Promise<number> {
  // Find observations with high proof count that haven't been propagated
  const highProof = await db
    .select({
      id: memories.id,
      key: memories.key,
      content: memories.content,
      workspaceId: memories.workspaceId,
      proofCount: memories.proofCount,
    })
    .from(memories)
    .where(
      and(
        eq(memories.factType, 'observation'),
        gte(memories.proofCount, PROOF_THRESHOLD),
        eq(memories.tier, 'recall'),
      ),
    )
    .limit(50)

  let propagated = 0
  for (const obs of highProof) {
    // Check if already propagated (exists in core tier with this source)
    const existing = await db.query.memories.findFirst({
      where: and(
        eq(memories.tier, 'core'),
        sql`${memories.sourceMemoryIds} @> ARRAY[${obs.id}]::text[]`,
      ),
    })
    if (existing) continue

    // Promote to core tier
    await db
      .update(memories)
      .set({
        tier: 'core',
        confidence: sql`0.95`,
        updatedAt: new Date(),
      })
      .where(eq(memories.id, obs.id))
    propagated++
  }

  return propagated
}

// ── Weekly Learning Digest ──────────────────────────────────────────

const DIGEST_PROMPT = `You are a knowledge synthesis system for a multi-brain AI architecture. Summarize the key learnings from across all mini brains into a concise digest.

## Soul Fragments (cross-agent improvements)
{fragments}

## High-Proof Observations (verified facts)
{observations}

## Instructions
Create a brief digest (200-300 words) summarizing:
1. The most impactful improvements discovered
2. Common patterns across domains
3. Key facts the system has verified with high confidence

Write in first person plural ("we learned", "our agents discovered").
Return ONLY the digest text, no JSON wrapping.`

/**
 * Generate a weekly digest of top learnings across all mini brains.
 * Stores as a core-tier memory accessible to all agents.
 */
export async function generateCrossTierDigest(
  db: Database,
  gw: GatewayRouter,
): Promise<DigestResult> {
  // Collect top fragments from all workspaces
  const topFragments = await db
    .select({
      title: soulFragments.title,
      content: soulFragments.content,
      category: soulFragments.category,
      adoptedByCount: soulFragments.adoptedByCount,
    })
    .from(soulFragments)
    .where(gte(soulFragments.adoptedByCount, 2))
    .orderBy(desc(soulFragments.adoptedByCount))
    .limit(20)

  // Collect top observations from all mini brains
  const topObservations = await db
    .select({
      key: memories.key,
      content: memories.content,
      proofCount: memories.proofCount,
    })
    .from(memories)
    .where(and(eq(memories.factType, 'observation'), gte(memories.proofCount, 5)))
    .orderBy(desc(memories.proofCount))
    .limit(20)

  if (topFragments.length === 0 && topObservations.length === 0) {
    return { fragmentsPromoted: 0, observationsCollected: 0, digestId: null }
  }

  const fragmentsText = topFragments
    .map(
      (f) => `- [${f.category}] ${f.title}: ${f.content} (adopted by ${f.adoptedByCount} agents)`,
    )
    .join('\n')

  const observationsText = topObservations
    .map((o) => `- ${o.key}: ${o.content} (proof count: ${o.proofCount})`)
    .join('\n')

  const prompt = DIGEST_PROMPT.replace('{fragments}', fragmentsText || '(none yet)').replace(
    '{observations}',
    observationsText || '(none yet)',
  )

  try {
    const response = await gw.chat({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxTokens: 1024,
    })

    // Store digest as core-tier memory
    const [digest] = await db
      .insert(memories)
      .values({
        key: `cross-tier-digest-${new Date().toISOString().slice(0, 10)}`,
        content: response.content,
        tier: 'core',
        factType: 'observation',
        confidence: sql`0.9`,
        proofCount: topFragments.length + topObservations.length,
      })
      .returning({ id: memories.id })

    return {
      fragmentsPromoted: topFragments.length,
      observationsCollected: topObservations.length,
      digestId: digest?.id ?? null,
    }
  } catch {
    return {
      fragmentsPromoted: topFragments.length,
      observationsCollected: topObservations.length,
      digestId: null,
    }
  }
}
