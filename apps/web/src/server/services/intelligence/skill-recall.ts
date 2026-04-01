/**
 * State-Indexed Skill Recall — Context-aware skill suggestions.
 *
 * Inspired by PRAXIS (Procedural Recall for Agents with eXperiences Indexed by State).
 * When save_skill stores a procedure, we also store context signatures (tools used,
 * domain, error patterns). On future similar contexts, auto-suggest relevant skills.
 */

import type { Database } from '@solarc/db'
import { memories } from '@solarc/db'
import { and, eq, sql } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────────────

export interface SkillContext {
  /** Tools that were used in the skill execution */
  toolsUsed: string[]
  /** Domain or workspace of the skill */
  domain: string | null
  /** Error patterns that triggered the skill (if it was a fix) */
  errorPatterns: string[]
  /** Keywords extracted from the task */
  keywords: string[]
}

export interface SkillSuggestion {
  skillId: string
  skillName: string
  content: string
  relevanceScore: number
  matchReason: string
}

// ── Skill Context Extraction ────────────────────────────────────────

/**
 * Extract a context signature from the current agent state.
 * Used for both saving skills and querying for relevant ones.
 */
export function extractContextSignature(
  userMessage: string,
  toolHistory: Array<{ toolName: string; args?: unknown }>,
  errorMessages: string[] = [],
): SkillContext {
  return {
    toolsUsed: [...new Set(toolHistory.map((t) => t.toolName))],
    domain: detectDomain(userMessage),
    errorPatterns: errorMessages
      .map((e) => extractErrorPattern(e))
      .filter((p): p is string => p !== null),
    keywords: extractKeywords(userMessage),
  }
}

/**
 * Build a context tag string for storage alongside a skill.
 * Stored in the skill memory's key field for efficient retrieval.
 */
export function buildContextTag(ctx: SkillContext): string {
  const parts: string[] = []
  if (ctx.toolsUsed.length > 0) parts.push(`tools:${ctx.toolsUsed.join(',')}`)
  if (ctx.domain) parts.push(`domain:${ctx.domain}`)
  if (ctx.errorPatterns.length > 0) parts.push(`errors:${ctx.errorPatterns.join(',')}`)
  if (ctx.keywords.length > 0) parts.push(`kw:${ctx.keywords.slice(0, 5).join(',')}`)
  return parts.join('|')
}

// ── Skill Recall ────────────────────────────────────────────────────

/**
 * Find skills that match the current context.
 * Uses keyword overlap + tool overlap scoring for fast retrieval without embeddings.
 */
export async function recallRelevantSkills(
  db: Database,
  currentContext: SkillContext,
  workspaceId?: string,
  limit: number = 3,
): Promise<SkillSuggestion[]> {
  // Query all skill memories
  const conditions = [sql`${memories.key} LIKE 'skill:%'`]
  if (workspaceId) conditions.push(eq(memories.workspaceId, workspaceId))

  const skills = await db
    .select({
      id: memories.id,
      key: memories.key,
      content: memories.content,
    })
    .from(memories)
    .where(and(...conditions))
    .limit(50)

  if (skills.length === 0) return []

  // Score each skill by context overlap
  const scored: SkillSuggestion[] = []

  for (const skill of skills) {
    let score = 0
    const reasons: string[] = []
    const content = skill.content.toLowerCase()
    const skillName = skill.key.replace('skill:', '')

    // Tool overlap — highest signal
    for (const tool of currentContext.toolsUsed) {
      if (content.includes(tool.toLowerCase())) {
        score += 0.3
        reasons.push(`uses ${tool}`)
      }
    }

    // Domain match
    if (currentContext.domain && content.includes(currentContext.domain.toLowerCase())) {
      score += 0.2
      reasons.push(`${currentContext.domain} domain`)
    }

    // Error pattern match
    for (const pattern of currentContext.errorPatterns) {
      if (content.includes(pattern.toLowerCase())) {
        score += 0.25
        reasons.push(`handles "${pattern}"`)
      }
    }

    // Keyword overlap
    let kwMatches = 0
    for (const kw of currentContext.keywords) {
      if (content.includes(kw.toLowerCase())) kwMatches++
    }
    if (kwMatches > 0 && currentContext.keywords.length > 0) {
      const kwScore = (kwMatches / currentContext.keywords.length) * 0.25
      score += kwScore
      reasons.push(`${kwMatches} keyword matches`)
    }

    if (score > 0.1) {
      scored.push({
        skillId: skill.id,
        skillName,
        content: skill.content,
        relevanceScore: Math.min(1, score),
        matchReason: reasons.join(', '),
      })
    }
  }

  return scored.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, limit)
}

// ── Helpers ──────────────────────────────────────────────────────────

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  astrology: ['chart', 'natal', 'transit', 'horoscope', 'zodiac', 'planet', 'house', 'aspect'],
  development: ['code', 'deploy', 'build', 'test', 'debug', 'refactor', 'api', 'endpoint'],
  devops: ['docker', 'kubernetes', 'deploy', 'ci/cd', 'pipeline', 'server', 'container'],
  research: ['research', 'paper', 'analysis', 'study', 'findings', 'methodology'],
  data: ['data', 'query', 'database', 'sql', 'analytics', 'visualization', 'dashboard'],
  security: ['security', 'vulnerability', 'audit', 'penetration', 'threat', 'firewall'],
}

function detectDomain(text: string): string | null {
  const lower = text.toLowerCase()
  let best: string | null = null
  let bestScore = 0

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const matches = keywords.filter((kw) => lower.includes(kw)).length
    if (matches > bestScore) {
      bestScore = matches
      best = domain
    }
  }

  return bestScore >= 2 ? best : null
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'can',
    'shall',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'during',
    'it',
    'this',
    'that',
    'these',
    'those',
    'i',
    'me',
    'my',
    'we',
    'our',
    'you',
    'your',
    'he',
    'she',
    'they',
    'them',
    'and',
    'or',
    'but',
    'not',
  ])

  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .slice(0, 10)
}

function extractErrorPattern(errorMsg: string): string | null {
  // Extract the core error type, stripping dynamic values
  const patterns = [
    /(\w+Error):/,
    /(\d{3})\s+([\w\s]+)/,
    /(ENOENT|ECONNREFUSED|ETIMEDOUT|EPERM)/,
    /(TypeError|ReferenceError|SyntaxError|RangeError)/,
    /(not found|permission denied|timeout|connection refused)/i,
  ]

  for (const pattern of patterns) {
    const match = errorMsg.match(pattern)
    if (match) return match[1] ?? match[0]
  }

  return null
}
