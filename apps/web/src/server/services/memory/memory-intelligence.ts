/**
 * Memory Intelligence — LLM-driven fact extraction and deduplication.
 *
 * Inspired by mem0's two-pass memory management:
 *   Pass 1: Extract facts from conversation via LLM
 *   Pass 2: Compare against existing memories → ADD/UPDATE/DELETE/NONE
 *
 * Closes the gap in our MemoryService: instead of blindly appending,
 * this module intelligently merges, updates contradictions, and deduplicates.
 */

import type { Database } from '@solarc/db'
import { memories } from '@solarc/db'
import { eq } from 'drizzle-orm'

import type { GatewayRouter } from '../gateway'
import { MemoryService } from './memory-service'

// ── Types ─────────────────────────────────────────────────────────────

export interface ExtractedFact {
  text: string
  category: 'preference' | 'personal' | 'plan' | 'professional' | 'health' | 'misc'
}

export type MemoryAction = 'ADD' | 'UPDATE' | 'DELETE' | 'NONE'

export interface MemoryDecision {
  action: MemoryAction
  fact: string
  existingMemoryId?: string
  existingMemoryText?: string
  reason: string
}

export interface SmartAddResult {
  extracted: ExtractedFact[]
  decisions: MemoryDecision[]
  added: number
  updated: number
  deleted: number
  unchanged: number
}

// ── Prompts ───────────────────────────────────────────────────────────

const FACT_EXTRACTION_PROMPT = `You are a fact extraction system. Extract distinct, atomic facts from the conversation below.

Focus on:
1. Personal preferences (likes, dislikes, choices)
2. Important personal details (names, relationships, dates)
3. Plans and intentions (upcoming events, goals)
4. Professional details (role, skills, work habits)
5. Health/wellness preferences
6. Miscellaneous notable information

Rules:
- Extract facts from USER messages only. Ignore assistant/system messages.
- Each fact should be a single, self-contained statement.
- Skip greetings, filler, and trivial observations.
- Detect the language of the input and record facts in the same language.
- Return ONLY valid JSON.

Return format:
{"facts": [{"text": "...", "category": "preference|personal|plan|professional|health|misc"}, ...]}

If no facts found, return: {"facts": []}
`

function buildMergePrompt(
  existingMemories: Array<{ id: string; text: string }>,
  newFacts: string[],
): string {
  return `You are a memory manager. Compare new facts against existing memories and decide what to do with each.

## Existing Memories
${JSON.stringify(existingMemories, null, 2)}

## New Facts
${JSON.stringify(newFacts)}

## Rules
For each new fact, decide ONE action:
- **ADD**: New information not present in any existing memory. Use id "new".
- **UPDATE**: Overlaps with an existing memory but adds/changes information. Use the existing memory's id. Merge the information (don't lose existing details).
- **DELETE**: Contradicts an existing memory (e.g., "Likes X" vs "Dislikes X"). Use the existing memory's id.
- **NONE**: Already present in an existing memory with no new information. Use the existing memory's id.

Important:
- Only use IDs from the existing memories list above. Never invent IDs.
- When UPDATE merging, keep ALL information from both old and new.
- DELETE only for genuine contradictions, not just different topics.
- Prefer UPDATE over ADD when the fact relates to an existing memory.

Return ONLY valid JSON:
{"actions": [{"action": "ADD|UPDATE|DELETE|NONE", "fact": "the fact text", "id": "existing memory id or 'new'", "merged_text": "merged text for UPDATE actions", "reason": "brief explanation"}, ...]}
`
}

// ── UUID-to-Integer Mapping (prevents LLM hallucination) ──────────────

function mapToIntegers(items: Array<{ id: string; text: string }>): {
  mapped: Array<{ id: string; text: string }>
  reverseMap: Map<string, string>
} {
  const reverseMap = new Map<string, string>()
  const mapped = items.map((item, idx) => {
    const intId = String(idx)
    reverseMap.set(intId, item.id)
    return { id: intId, text: item.text }
  })
  return { mapped, reverseMap }
}

// ── Core Intelligence ─────────────────────────────────────────────────

/**
 * Extract facts from a conversation using LLM.
 */
export async function extractFacts(
  gw: GatewayRouter,
  messages: Array<{ role: string; content: string }>,
  model?: string,
): Promise<ExtractedFact[]> {
  const conversationText = messages.map((m) => `${m.role}: ${m.content}`).join('\n')

  const response = await gw.chat({
    model,
    messages: [
      { role: 'system', content: FACT_EXTRACTION_PROMPT },
      { role: 'user', content: conversationText },
    ],
    temperature: 0.1,
    maxTokens: 2048,
  })

  try {
    const cleaned = response.content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    const parsed = JSON.parse(cleaned)
    const facts: ExtractedFact[] = (parsed.facts ?? []).map(
      (f: { text?: string; category?: string }) => ({
        text: typeof f === 'string' ? f : (f.text ?? ''),
        category: (typeof f === 'object' && f.category) || 'misc',
      }),
    )
    return facts.filter((f) => f.text.length > 0)
  } catch {
    return []
  }
}

/**
 * Smart memory add — the two-pass mem0 pattern adapted for Solarc Brain.
 *
 * 1. Extract facts from conversation via LLM
 * 2. Search existing memories for each fact
 * 3. LLM decides ADD/UPDATE/DELETE/NONE per fact
 * 4. Execute the decisions against MemoryService
 */
export async function smartMemoryAdd(
  db: Database,
  gw: GatewayRouter,
  messages: Array<{ role: string; content: string }>,
  opts?: {
    workspaceId?: string
    sourceAgentId?: string
    model?: string
  },
): Promise<SmartAddResult> {
  const memoryService = new MemoryService(db)

  // Pass 1: Extract facts
  const facts = await extractFacts(gw, messages, opts?.model)
  if (facts.length === 0) {
    return { extracted: [], decisions: [], added: 0, updated: 0, deleted: 0, unchanged: 0 }
  }

  // Find existing memories related to each fact
  const allRelated = new Map<string, { id: string; text: string }>()
  for (const fact of facts) {
    const results = await memoryService.search(fact.text, {
      workspaceId: opts?.workspaceId,
      limit: 5,
    })
    for (const r of results) {
      if (r.score > 0.3) {
        allRelated.set(r.id, { id: r.id, text: r.content })
      }
    }
  }

  const existingMemories = [...allRelated.values()]

  // Pass 2: LLM decides merge actions
  let decisions: MemoryDecision[] = []

  if (existingMemories.length === 0) {
    // No existing memories — all facts are ADDs
    decisions = facts.map((f) => ({
      action: 'ADD' as MemoryAction,
      fact: f.text,
      reason: 'No related existing memories found',
    }))
  } else {
    // Map UUIDs to integers to prevent LLM hallucination
    const { mapped, reverseMap } = mapToIntegers(existingMemories)

    const mergePrompt = buildMergePrompt(
      mapped,
      facts.map((f) => f.text),
    )

    const mergeResponse = await gw.chat({
      model: opts?.model,
      messages: [{ role: 'user', content: mergePrompt }],
      temperature: 0.1,
      maxTokens: 4096,
    })

    try {
      const cleaned = mergeResponse.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()
      const parsed = JSON.parse(cleaned)
      const actions = parsed.actions ?? []

      decisions = actions.map(
        (a: {
          action: string
          fact: string
          id: string
          merged_text?: string
          reason?: string
        }) => {
          const realId = a.id === 'new' ? undefined : (reverseMap.get(a.id) ?? a.id)
          const existing = realId ? allRelated.get(realId) : undefined
          return {
            action: (['ADD', 'UPDATE', 'DELETE', 'NONE'].includes(a.action)
              ? a.action
              : 'NONE') as MemoryAction,
            fact: a.merged_text ?? a.fact,
            existingMemoryId: realId,
            existingMemoryText: existing?.text,
            reason: a.reason ?? '',
          }
        },
      )
    } catch {
      // Fallback: treat all as ADDs
      decisions = facts.map((f) => ({
        action: 'ADD' as MemoryAction,
        fact: f.text,
        reason: 'Merge decision failed, defaulting to ADD',
      }))
    }
  }

  // Execute decisions
  let added = 0
  let updated = 0
  let deleted = 0
  let unchanged = 0

  for (const decision of decisions) {
    try {
      switch (decision.action) {
        case 'ADD': {
          await memoryService.store({
            key: decision.fact.slice(0, 100),
            content: decision.fact,
            tier: 'recall',
            workspaceId: opts?.workspaceId,
            sourceAgentId: opts?.sourceAgentId,
          })
          added++
          break
        }
        case 'UPDATE': {
          if (decision.existingMemoryId) {
            // Update the content of the existing memory
            await db
              .update(memories)
              .set({
                content: decision.fact,
                key: decision.fact.slice(0, 100),
                updatedAt: new Date(),
              })
              .where(eq(memories.id, decision.existingMemoryId))
            updated++
          }
          break
        }
        case 'DELETE': {
          if (decision.existingMemoryId) {
            await memoryService.delete(decision.existingMemoryId)
            deleted++
          }
          break
        }
        case 'NONE': {
          unchanged++
          break
        }
      }
    } catch (err) {
      console.error(`[MemoryIntelligence] Failed to execute ${decision.action}:`, err)
    }
  }

  return {
    extracted: facts,
    decisions,
    added,
    updated,
    deleted,
    unchanged,
  }
}
