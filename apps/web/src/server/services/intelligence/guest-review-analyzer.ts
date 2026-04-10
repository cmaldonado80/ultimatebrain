/**
 * Guest Review Analyzer — searches online reviews for a hotel/property,
 * analyzes sentiment and themes via LLM, and generates a structured
 * improvement plan.  Results are persisted for historical tracking.
 */
import type { Database } from '@solarc/db'
import { guestReviewAnalyses } from '@solarc/db'
import { desc, eq, sql } from 'drizzle-orm'

import { logger } from '../../../lib/logger'
import { GatewayRouter } from '../gateway'

// ── Types ────────────────────────────────────────────────────────────────

export interface ReviewTheme {
  category: string
  sentiment: 'positive' | 'negative' | 'mixed'
  frequency: 'high' | 'medium' | 'low'
  quotes: string[]
}

export interface StrengthArea {
  area: string
  description: string
  quotes: string[]
}

export interface WeaknessArea {
  area: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  quotes: string[]
}

export interface ImprovementAction {
  action: string
  problem: string
  kpiTarget: string
  cost: 'low' | 'medium' | 'high'
}

export interface ImprovementPhase {
  phase: string
  timeframe: string
  actions: ImprovementAction[]
}

export interface ReviewAnalysisResult {
  id: string
  propertyName: string
  location: string | null
  sourceCount: number
  overallRating: number | null
  sentimentBreakdown: { positive: number; neutral: number; negative: number }
  themes: ReviewTheme[]
  strengths: StrengthArea[]
  weaknesses: WeaknessArea[]
  improvementPlan: ImprovementPhase[]
  rawSummary: string | null
  createdAt: Date
}

// ── Web search helper ────────────────────────────────────────────────────

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; SolarcBrain/2.0)',
  Accept: 'text/html',
}

async function webSearch(
  query: string,
  gateway: GatewayRouter | null,
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  // Try gateway search first (Ollama/OpenClaw)
  if (gateway) {
    try {
      const results = await gateway.webSearch(query)
      if (results.length > 0) return results
    } catch {
      // fall through
    }
  }
  // Fallback: DuckDuckGo Lite
  const searchUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`
  const res = await fetch(searchUrl, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(10000),
  })
  const html = await res.text()

  const linkPattern =
    /<a[^>]*rel="nofollow"[^>]*href="([^"]*)"[^>]*class="result-link"[^>]*>([\s\S]*?)<\/a>/gi
  const snippetPattern = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi

  const links: Array<{ url: string; title: string }> = []
  let m: RegExpExecArray | null
  while ((m = linkPattern.exec(html)) !== null) {
    const href = m[1] ?? ''
    const title = (m[2] ?? '').replace(/<[^>]+>/g, '').trim()
    if (href && title && !href.includes('duckduckgo.com')) links.push({ url: href, title })
  }

  const snippets: string[] = []
  while ((m = snippetPattern.exec(html)) !== null) {
    snippets.push(
      (m[1] ?? '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
  }

  return links.slice(0, 10).map((l, i) => ({ ...l, snippet: snippets[i] ?? '' }))
}

// ── Core analysis ────────────────────────────────────────────────────────

export async function analyzePropertyReviews(
  db: Database,
  opts: {
    propertyName: string
    location?: string
    orgId?: string
    createdBy?: string
  },
): Promise<ReviewAnalysisResult> {
  const { propertyName, location } = opts
  const searchTerm = location ? `${propertyName} ${location}` : propertyName

  logger.info({ propertyName, location }, '[GuestReviewAnalyzer] Starting review analysis')

  // 1 — Gather review data from multiple search queries
  let gateway: GatewayRouter | null = null
  try {
    gateway = new GatewayRouter(db)
  } catch {
    // gateway optional
  }

  const queries = [
    `${searchTerm} hotel guest reviews`,
    `${searchTerm} hotel complaints problems issues`,
    `${searchTerm} hotel positive reviews best features`,
    `"${propertyName}" review rooms service cleanliness food`,
  ]

  const allSnippets: string[] = []
  const allSources: Array<{ title: string; url: string }> = []

  for (const q of queries) {
    try {
      const results = await webSearch(q, gateway)
      for (const r of results) {
        if (r.snippet) allSnippets.push(r.snippet)
        allSources.push({ title: r.title, url: r.url })
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err : undefined, query: q },
        '[GuestReviewAnalyzer] Search query failed',
      )
    }
  }

  const uniqueSources = [...new Map(allSources.map((s) => [s.url, s])).values()]

  // 2 — Send gathered data to LLM for structured analysis
  const model = process.env.DEFAULT_MODEL ?? 'qwen3-coder:480b-cloud'
  const systemPrompt = `You are a hospitality intelligence analyst. You analyze guest reviews of hotels and properties to produce structured, actionable reports.

You will receive raw search snippets about a property. Analyze them and produce a JSON response with this exact structure:

{
  "overallRating": <number 1-10 or null if insufficient data>,
  "sentimentBreakdown": { "positive": <count>, "neutral": <count>, "negative": <count> },
  "themes": [
    { "category": "<e.g. Staff Service, Cleanliness, Noise, Rooms, F&B, Location, Amenities, Check-in, Maintenance, Value>",
      "sentiment": "positive|negative|mixed",
      "frequency": "high|medium|low",
      "quotes": ["<actual guest quote or paraphrase from snippets>"] }
  ],
  "strengths": [
    { "area": "<category>", "description": "<what guests love>", "quotes": ["<quote>"] }
  ],
  "weaknesses": [
    { "area": "<category>", "description": "<what guests complain about>", "severity": "critical|high|medium|low", "quotes": ["<quote>"] }
  ],
  "improvementPlan": [
    { "phase": "Quick Wins (0-3 months)",
      "timeframe": "0-3 months",
      "actions": [
        { "action": "<specific action>", "problem": "<what it fixes>", "kpiTarget": "<measurable goal>", "cost": "low|medium|high" }
      ]
    },
    { "phase": "Medium-term Improvements (3-6 months)", "timeframe": "3-6 months", "actions": [...] },
    { "phase": "Strategic Initiatives (6-12 months)", "timeframe": "6-12 months", "actions": [...] }
  ],
  "executiveSummary": "<2-3 paragraph markdown summary of findings and recommendations>"
}

Be thorough, specific, and actionable. Base everything on the actual review data provided. If data is sparse, note confidence levels. Always generate at least 3 themes, 2 strengths, 2 weaknesses, and 3 improvement actions per phase.`

  const userMessage = `Analyze guest reviews for: **${propertyName}**${location ? ` (${location})` : ''}

Here are ${allSnippets.length} review snippets gathered from ${uniqueSources.length} online sources:

${allSnippets.map((s, i) => `[${i + 1}] ${s}`).join('\n\n')}

Sources searched: ${uniqueSources.map((s) => s.title).join(', ')}

Produce the structured JSON analysis.`

  let analysisJson: Record<string, unknown> = {}
  let rawSummary = ''

  if (gateway) {
    try {
      const response = await gateway.chat({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
      })
      const text = response.content

      // Extract JSON from response (may be wrapped in markdown code block)
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/)
      if (jsonMatch?.[1]) {
        analysisJson = JSON.parse(jsonMatch[1])
      }
      rawSummary = (analysisJson.executiveSummary as string) ?? text
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err : undefined },
        '[GuestReviewAnalyzer] LLM analysis failed, using snippet-based fallback',
      )
    }
  }

  // 3 — Fallback: If LLM not available, build basic analysis from snippets
  if (!analysisJson.themes) {
    analysisJson = buildFallbackAnalysis(allSnippets, propertyName)
    rawSummary = `Automated snippet analysis for ${propertyName} based on ${allSnippets.length} review excerpts from ${uniqueSources.length} sources. LLM-powered deep analysis was not available — results are based on keyword extraction.`
  }

  // 4 — Persist to DB
  const sentimentBreakdown = (analysisJson.sentimentBreakdown as {
    positive: number
    neutral: number
    negative: number
  }) ?? { positive: 0, neutral: 0, negative: 0 }
  const themes = (analysisJson.themes as ReviewTheme[]) ?? []
  const strengths = (analysisJson.strengths as StrengthArea[]) ?? []
  const weaknesses = (analysisJson.weaknesses as WeaknessArea[]) ?? []
  const improvementPlan = (analysisJson.improvementPlan as ImprovementPhase[]) ?? []
  const overallRating = (analysisJson.overallRating as number) ?? null

  const [row] = await db
    .insert(guestReviewAnalyses)
    .values({
      propertyName,
      location: location ?? null,
      sourceCount: uniqueSources.length,
      overallRating,
      sentimentBreakdown: sentimentBreakdown as unknown as Record<string, unknown>,
      themes: themes as unknown as Record<string, unknown>,
      strengths: strengths as unknown as Record<string, unknown>,
      weaknesses: weaknesses as unknown as Record<string, unknown>,
      improvementPlan: improvementPlan as unknown as Record<string, unknown>,
      rawSummary,
      metadata: { model, sources: uniqueSources, searchQueries: queries } as unknown as Record<
        string,
        unknown
      >,
      orgId: opts.orgId ?? null,
      createdBy: opts.createdBy ?? null,
    })
    .returning()

  logger.info(
    { id: row.id, propertyName, themes: themes.length, sources: uniqueSources.length },
    '[GuestReviewAnalyzer] Analysis complete',
  )

  return {
    id: row.id,
    propertyName,
    location: location ?? null,
    sourceCount: uniqueSources.length,
    overallRating,
    sentimentBreakdown,
    themes,
    strengths,
    weaknesses,
    improvementPlan,
    rawSummary,
    createdAt: row.createdAt,
  }
}

// ── Fallback keyword-based analysis when LLM is unavailable ──────────────

function buildFallbackAnalysis(snippets: string[], propertyName: string): Record<string, unknown> {
  const text = snippets.join(' ').toLowerCase()

  const categoryKeywords: Record<string, string[]> = {
    'Staff & Service': [
      'staff',
      'service',
      'friendly',
      'helpful',
      'rude',
      'attentive',
      'check-in',
      'front desk',
    ],
    Cleanliness: ['clean', 'dirty', 'mold', 'stain', 'hygiene', 'housekeeping', 'filthy'],
    'Rooms & Comfort': [
      'room',
      'bed',
      'comfortable',
      'outdated',
      'renovate',
      'furniture',
      'old',
      'modern',
    ],
    Noise: ['noise', 'noisy', 'loud', 'quiet', 'soundproof', 'street noise'],
    'Food & Beverage': ['breakfast', 'restaurant', 'food', 'buffet', 'dining', 'bar'],
    Location: ['location', 'central', 'walking distance', 'downtown', 'convenient'],
    Amenities: ['pool', 'gym', 'wifi', 'parking', 'spa', 'fitness'],
    Value: ['price', 'expensive', 'value', 'worth', 'overpriced', 'cheap'],
    Maintenance: [
      'maintenance',
      'broken',
      'elevator',
      'air conditioning',
      'ac',
      'plumbing',
      'repair',
    ],
    Bathroom: ['bathroom', 'shower', 'toilet', 'slippery', 'water'],
  }

  const positiveWords = [
    'great',
    'excellent',
    'amazing',
    'good',
    'best',
    'love',
    'perfect',
    'wonderful',
    'comfortable',
    'friendly',
    'helpful',
  ]
  const negativeWords = [
    'bad',
    'terrible',
    'awful',
    'worst',
    'dirty',
    'noisy',
    'broken',
    'rude',
    'old',
    'outdated',
    'expensive',
    'horrible',
    'filthy',
  ]

  let posCount = 0
  let negCount = 0
  for (const w of positiveWords) if (text.includes(w)) posCount++
  for (const w of negativeWords) if (text.includes(w)) negCount++
  const total = posCount + negCount || 1

  const themes: ReviewTheme[] = []
  const strengths: StrengthArea[] = []
  const weaknesses: WeaknessArea[] = []

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    const hits = keywords.filter((k) => text.includes(k)).length
    if (hits === 0) continue

    const catSnippets = snippets.filter((s) => keywords.some((k) => s.toLowerCase().includes(k)))
    const hasPositive = catSnippets.some((s) =>
      positiveWords.some((w) => s.toLowerCase().includes(w)),
    )
    const hasNegative = catSnippets.some((s) =>
      negativeWords.some((w) => s.toLowerCase().includes(w)),
    )
    const sentiment = hasPositive && hasNegative ? 'mixed' : hasPositive ? 'positive' : 'negative'

    themes.push({
      category,
      sentiment,
      frequency: hits >= 4 ? 'high' : hits >= 2 ? 'medium' : 'low',
      quotes: catSnippets.slice(0, 2),
    })

    if (hasPositive)
      strengths.push({
        area: category,
        description: `Guests praise ${category.toLowerCase()}`,
        quotes: catSnippets.slice(0, 1),
      })
    if (hasNegative)
      weaknesses.push({
        area: category,
        description: `Guests report issues with ${category.toLowerCase()}`,
        severity: hits >= 3 ? 'high' : 'medium',
        quotes: catSnippets.slice(0, 1),
      })
  }

  return {
    overallRating: null,
    sentimentBreakdown: {
      positive: Math.round((posCount / total) * snippets.length),
      neutral: Math.round(snippets.length * 0.2),
      negative: Math.round((negCount / total) * snippets.length),
    },
    themes,
    strengths,
    weaknesses,
    improvementPlan: [
      {
        phase: 'Quick Wins (0-3 months)',
        timeframe: '0-3 months',
        actions: weaknesses.slice(0, 3).map((w) => ({
          action: `Address ${w.area.toLowerCase()} issues`,
          problem: w.description,
          kpiTarget: 'Reduce related complaints by 50%',
          cost: 'low' as const,
        })),
      },
      {
        phase: 'Medium-term (3-6 months)',
        timeframe: '3-6 months',
        actions: [
          {
            action: `Comprehensive ${propertyName} service training`,
            problem: 'General service quality',
            kpiTarget: 'Rating improvement +0.3',
            cost: 'medium' as const,
          },
        ],
      },
      {
        phase: 'Strategic (6-12 months)',
        timeframe: '6-12 months',
        actions: [
          {
            action: 'Full property modernization audit',
            problem: 'Aging infrastructure',
            kpiTarget: 'Facilities score 8.5+',
            cost: 'high' as const,
          },
        ],
      },
    ],
    executiveSummary: `Keyword-based analysis for ${propertyName}. Found ${themes.length} review themes, ${strengths.length} strengths, and ${weaknesses.length} areas for improvement.`,
  }
}

// ── Query functions ──────────────────────────────────────────────────────

export async function getAnalysisHistory(
  db: Database,
  opts?: { orgId?: string; limit?: number },
): Promise<ReviewAnalysisResult[]> {
  const rows = await db
    .select()
    .from(guestReviewAnalyses)
    .orderBy(desc(guestReviewAnalyses.createdAt))
    .limit(opts?.limit ?? 20)

  return rows.map(mapRow)
}

export async function getAnalysisById(
  db: Database,
  id: string,
): Promise<ReviewAnalysisResult | null> {
  const [row] = await db
    .select()
    .from(guestReviewAnalyses)
    .where(eq(guestReviewAnalyses.id, id))
    .limit(1)

  return row ? mapRow(row) : null
}

export async function getAnalysesByProperty(
  db: Database,
  propertyName: string,
): Promise<ReviewAnalysisResult[]> {
  const rows = await db
    .select()
    .from(guestReviewAnalyses)
    .where(sql`lower(${guestReviewAnalyses.propertyName}) LIKE lower(${`%${propertyName}%`})`)
    .orderBy(desc(guestReviewAnalyses.createdAt))
    .limit(10)

  return rows.map(mapRow)
}

function mapRow(row: typeof guestReviewAnalyses.$inferSelect): ReviewAnalysisResult {
  return {
    id: row.id,
    propertyName: row.propertyName,
    location: row.location,
    sourceCount: row.sourceCount,
    overallRating: row.overallRating,
    sentimentBreakdown: (row.sentimentBreakdown as {
      positive: number
      neutral: number
      negative: number
    }) ?? { positive: 0, neutral: 0, negative: 0 },
    themes: (row.themes as unknown as ReviewTheme[]) ?? [],
    strengths: (row.strengths as unknown as StrengthArea[]) ?? [],
    weaknesses: (row.weaknesses as unknown as WeaknessArea[]) ?? [],
    improvementPlan: (row.improvementPlan as unknown as ImprovementPhase[]) ?? [],
    rawSummary: row.rawSummary,
    createdAt: row.createdAt,
  }
}
