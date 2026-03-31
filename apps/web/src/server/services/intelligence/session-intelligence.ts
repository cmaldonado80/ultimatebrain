/**
 * Session Intelligence — topic detection and proactive memory recall.
 *
 * Analyzes conversation topics to:
 * 1. Generate smart session summaries
 * 2. Proactively recall relevant memories based on detected topics
 * 3. Track topic frequency for workspace-level insights
 */

import type { Database } from '@solarc/db'
import { chatMessages, chatSessions } from '@solarc/db'
import { desc, eq } from 'drizzle-orm'

import type { GatewayRouter } from '../gateway'
import { MemoryService } from '../memory/memory-service'

// ── Types ─────────────────────────────────────────────────────────────

export interface DetectedTopic {
  topic: string
  confidence: number
  keywords: string[]
}

export interface SessionSummary {
  sessionId: string
  topics: DetectedTopic[]
  summary: string
  messageCount: number
  keyDecisions: string[]
  openQuestions: string[]
  proactiveMemories: Array<{ id: string; content: string; relevance: number }>
}

// ── Topic Detection ───────────────────────────────────────────────────

/** Fast keyword-based topic detection (no LLM call) */
export function detectTopicsFromText(text: string): DetectedTopic[] {
  const lower = text.toLowerCase()
  const topics: DetectedTopic[] = []

  const TOPIC_PATTERNS: Array<{
    topic: string
    keywords: string[]
    weight: number
  }> = [
    {
      topic: 'astrology',
      keywords: [
        'chart',
        'natal',
        'transit',
        'zodiac',
        'planet',
        'house',
        'aspect',
        'horoscope',
        'moon',
        'sun sign',
        'ascendant',
        'mercury',
        'venus',
        'mars',
        'jupiter',
        'saturn',
      ],
      weight: 1.0,
    },
    {
      topic: 'coding',
      keywords: [
        'function',
        'class',
        'import',
        'export',
        'typescript',
        'javascript',
        'python',
        'react',
        'api',
        'endpoint',
        'database',
        'query',
        'bug',
        'error',
        'test',
      ],
      weight: 0.8,
    },
    {
      topic: 'design',
      keywords: [
        'ui',
        'ux',
        'color',
        'font',
        'layout',
        'component',
        'responsive',
        'tailwind',
        'css',
        'style',
        'theme',
        'dark mode',
        'figma',
      ],
      weight: 0.8,
    },
    {
      topic: 'architecture',
      keywords: [
        'microservice',
        'monolith',
        'scalability',
        'deployment',
        'docker',
        'kubernetes',
        'ci/cd',
        'infrastructure',
        'database schema',
        'migration',
      ],
      weight: 0.9,
    },
    {
      topic: 'data',
      keywords: [
        'analytics',
        'dashboard',
        'chart',
        'metric',
        'report',
        'visualization',
        'dataset',
        'csv',
        'json',
        'pipeline',
      ],
      weight: 0.7,
    },
    {
      topic: 'business',
      keywords: [
        'revenue',
        'customer',
        'user',
        'growth',
        'strategy',
        'market',
        'competitor',
        'pricing',
        'subscription',
        'roi',
      ],
      weight: 0.7,
    },
    {
      topic: 'security',
      keywords: [
        'auth',
        'token',
        'permission',
        'encrypt',
        'vulnerability',
        'injection',
        'xss',
        'csrf',
        'oauth',
        'jwt',
        'password',
      ],
      weight: 0.9,
    },
    {
      topic: 'research',
      keywords: [
        'study',
        'paper',
        'finding',
        'evidence',
        'hypothesis',
        'experiment',
        'analysis',
        'conclusion',
        'source',
        'citation',
      ],
      weight: 0.7,
    },
    {
      topic: 'planning',
      keywords: [
        'roadmap',
        'milestone',
        'deadline',
        'sprint',
        'backlog',
        'priority',
        'timeline',
        'scope',
        'requirement',
        'spec',
      ],
      weight: 0.8,
    },
    {
      topic: 'agent_system',
      keywords: [
        'agent',
        'soul',
        'evolution',
        'memory',
        'tool',
        'workspace',
        'orchestrat',
        'swarm',
        'brain',
        'mini brain',
      ],
      weight: 1.0,
    },
  ]

  for (const { topic, keywords, weight } of TOPIC_PATTERNS) {
    const matches = keywords.filter((kw) => lower.includes(kw))
    if (matches.length >= 2) {
      const confidence = Math.min((matches.length / keywords.length) * weight * 3, 1.0)
      topics.push({ topic, confidence, keywords: matches })
    }
  }

  return topics.sort((a, b) => b.confidence - a.confidence)
}

// ── Session Summary ───────────────────────────────────────────────────

/**
 * Generate an intelligent session summary with topic detection,
 * key decisions, open questions, and proactive memory suggestions.
 */
export async function generateSessionSummary(
  db: Database,
  gw: GatewayRouter,
  sessionId: string,
): Promise<SessionSummary> {
  // Load messages
  const msgs = await db.query.chatMessages.findMany({
    where: eq(chatMessages.sessionId, sessionId),
    orderBy: desc(chatMessages.createdAt),
    limit: 50,
  })

  const messages = msgs.reverse()
  const fullText = messages.map((m) => `${m.role}: ${m.text}`).join('\n')

  // Fast topic detection (no LLM)
  const topics = detectTopicsFromText(fullText)

  // Get session metadata
  const session = await db.query.chatSessions.findFirst({
    where: eq(chatSessions.id, sessionId),
  })

  // LLM-based summary + key decisions + open questions
  const response = await gw.chat({
    messages: [
      {
        role: 'system',
        content: `Analyze this conversation and extract:
1. A 2-3 sentence summary
2. Key decisions made (if any)
3. Open questions that were raised but not answered

Return ONLY valid JSON:
{"summary": "...", "keyDecisions": ["..."], "openQuestions": ["..."]}`,
      },
      { role: 'user', content: fullText.slice(0, 6000) },
    ],
    temperature: 0.1,
    maxTokens: 1024,
  })

  let summary = ''
  let keyDecisions: string[] = []
  let openQuestions: string[] = []
  try {
    const cleaned = response.content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    const parsed = JSON.parse(cleaned)
    summary = parsed.summary ?? ''
    keyDecisions = parsed.keyDecisions ?? []
    openQuestions = parsed.openQuestions ?? []
  } catch {
    summary = `Conversation with ${messages.length} messages about ${topics.map((t) => t.topic).join(', ') || 'various topics'}.`
  }

  // Proactive memory recall based on detected topics
  const proactiveMemories: Array<{ id: string; content: string; relevance: number }> = []
  if (topics.length > 0 && session?.workspaceId) {
    const memoryService = new MemoryService(db)
    const topicQuery = topics.map((t) => t.topic).join(' ')
    const recalled = await memoryService.search(topicQuery, {
      workspaceId: session.workspaceId,
      limit: 5,
    })
    for (const mem of recalled) {
      if (mem.score > 0.3) {
        proactiveMemories.push({
          id: mem.id,
          content: mem.content,
          relevance: mem.score,
        })
      }
    }
  }

  return {
    sessionId,
    topics,
    summary,
    messageCount: messages.length,
    keyDecisions,
    openQuestions,
    proactiveMemories,
  }
}
