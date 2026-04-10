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

// ── Web search helpers — multi-strategy for reliability ──────────────────

type SearchResult = { title: string; url: string; snippet: string }

/** Realistic browser headers to avoid bot detection */
const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

/** Strategy 1: DuckDuckGo HTML endpoint (more reliable than Lite) */
async function ddgHtmlSearch(query: string, max = 8): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `q=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(15000),
    redirect: 'follow',
  })
  const html = await res.text()
  logger.info(
    { query, status: res.status, htmlLen: html.length },
    '[GuestReviewAnalyzer] DDG HTML response',
  )

  const results: SearchResult[] = []
  // DDG HTML format: result blocks with result__a links and result__snippet
  const blockPattern =
    /<div[^>]*class="[^"]*result results_links[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi
  let blockMatch: RegExpExecArray | null
  while ((blockMatch = blockPattern.exec(html)) !== null && results.length < max) {
    const block = blockMatch[1] ?? ''
    const urlMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/)
    const snipMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)
    if (urlMatch?.[1]) {
      const href = urlMatch[1]
      if (href.includes('duckduckgo.com')) continue
      results.push({
        title: (urlMatch[2] ?? '').replace(/<[^>]+>/g, '').trim(),
        url: href,
        snippet: (snipMatch?.[1] ?? '')
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      })
    }
  }

  // Simpler fallback parsing if block pattern didn't match
  if (results.length === 0) {
    const linkPattern = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
    const snippetPattern = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi
    const links: { url: string; title: string }[] = []
    const snippets: string[] = []
    let lm: RegExpExecArray | null
    while ((lm = linkPattern.exec(html)) !== null) {
      const href = lm[1] ?? ''
      if (!href.includes('duckduckgo.com') && href.startsWith('http')) {
        links.push({ url: href, title: (lm[2] ?? '').replace(/<[^>]+>/g, '').trim() })
      }
    }
    while ((lm = snippetPattern.exec(html)) !== null) {
      snippets.push(
        (lm[1] ?? '')
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
    }
    for (let i = 0; i < Math.min(links.length, max); i++) {
      results.push({ ...links[i]!, snippet: snippets[i] ?? '' })
    }
  }

  return results
}

/** Strategy 2: DuckDuckGo Lite endpoint */
async function ddgLiteSearch(query: string, max = 8): Promise<SearchResult[]> {
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(10000),
  })
  const html = await res.text()

  const linkPattern =
    /<a[^>]*rel="nofollow"[^>]*href="([^"]*)"[^>]*class="result-link"[^>]*>([\s\S]*?)<\/a>/gi
  const snippetPattern = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi

  const links: { url: string; title: string }[] = []
  const snippets: string[] = []
  let m: RegExpExecArray | null
  while ((m = linkPattern.exec(html)) !== null) {
    const href = m[1] ?? ''
    const title = (m[2] ?? '').replace(/<[^>]+>/g, '').trim()
    if (href && title && !href.includes('duckduckgo.com')) links.push({ url: href, title })
  }
  while ((m = snippetPattern.exec(html)) !== null) {
    snippets.push(
      (m[1] ?? '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
  }

  return links.slice(0, max).map((l, i) => ({ ...l, snippet: snippets[i] ?? '' }))
}

/** Strategy 3: Fetch a specific page and extract readable text */
async function fetchPageContent(url: string, maxLen = 4000): Promise<string> {
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(12000),
    redirect: 'follow',
  })
  if (!res.ok) return ''
  const html = await res.text()

  // Strip non-content elements
  let content = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  // Try to find review-specific content
  const reviewSection =
    content.match(/<div[^>]*(?:class|id)=["'][^"']*review[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ??
    content.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ??
    content.match(/<main[^>]*>([\s\S]*?)<\/main>/i)

  if (reviewSection?.[1]) content = reviewSection[1]

  // Strip tags, normalize whitespace
  return content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
}

/** Combined search: tries multiple strategies, returns best results */
async function gatherReviewData(
  propertyName: string,
  location: string | undefined,
  gateway: GatewayRouter | null,
): Promise<{ snippets: string[]; sources: { title: string; url: string }[] }> {
  const searchTerm = location ? `${propertyName} ${location}` : propertyName
  const allSnippets: string[] = []
  const allSources: { title: string; url: string }[] = []

  const queries = [
    `${searchTerm} hotel guest reviews`,
    `${searchTerm} hotel reviews complaints`,
    `"${propertyName}" reviews service rooms cleanliness`,
  ]

  // Try gateway web search first (most reliable if configured)
  if (gateway) {
    for (const q of queries) {
      try {
        const results = await gateway.webSearch(q)
        logger.info({ query: q, count: results.length }, '[GRA] Gateway search results')
        for (const r of results) {
          if (r.snippet) allSnippets.push(r.snippet)
          allSources.push({ title: r.title, url: r.url })
        }
      } catch {
        // fall through to DDG
      }
    }
  }

  // If gateway produced results, we're good
  if (allSnippets.length >= 5) {
    return { snippets: allSnippets, sources: dedup(allSources) }
  }

  // Try DDG HTML endpoint
  for (const q of queries) {
    try {
      const results = await ddgHtmlSearch(q)
      logger.info({ query: q, count: results.length }, '[GRA] DDG HTML results')
      for (const r of results) {
        if (r.snippet) allSnippets.push(r.snippet)
        allSources.push({ title: r.title, url: r.url })
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : undefined }, '[GRA] DDG HTML failed')
    }
  }

  // If DDG HTML worked, supplement with page scraping
  if (allSnippets.length > 0) {
    // Try to scrape a couple of the found URLs for richer content
    const reviewUrls = allSources
      .filter(
        (s) =>
          s.url.includes('tripadvisor') ||
          s.url.includes('booking.com') ||
          s.url.includes('expedia') ||
          s.url.includes('hotels.com') ||
          s.url.includes('yelp') ||
          s.url.includes('kayak'),
      )
      .slice(0, 2)

    for (const source of reviewUrls) {
      try {
        const pageText = await fetchPageContent(source.url, 3000)
        if (pageText.length > 100) {
          allSnippets.push(pageText)
          logger.info({ url: source.url, len: pageText.length }, '[GRA] Scraped page content')
        }
      } catch {
        // non-critical
      }
    }

    return { snippets: allSnippets, sources: dedup(allSources) }
  }

  // Last resort: DDG Lite
  for (const q of queries) {
    try {
      const results = await ddgLiteSearch(q)
      logger.info({ query: q, count: results.length }, '[GRA] DDG Lite results')
      for (const r of results) {
        if (r.snippet) allSnippets.push(r.snippet)
        allSources.push({ title: r.title, url: r.url })
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : undefined }, '[GRA] DDG Lite failed')
    }
  }

  // If still nothing, try direct scraping of known review aggregator URLs
  if (allSnippets.length === 0) {
    logger.warn('[GRA] All search engines failed, trying direct URL construction')
    const slug = propertyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const directUrls = [
      `https://www.booking.com/hotel/mx/${slug}.html`,
      `https://www.tripadvisor.com/Search?q=${encodeURIComponent(propertyName)}`,
    ]
    for (const url of directUrls) {
      try {
        const pageText = await fetchPageContent(url, 4000)
        if (pageText.length > 200) {
          allSnippets.push(pageText)
          allSources.push({ title: `Direct: ${url}`, url })
          logger.info({ url, len: pageText.length }, '[GRA] Direct scrape succeeded')
        }
      } catch {
        // non-critical
      }
    }
  }

  return { snippets: allSnippets, sources: dedup(allSources) }
}

function dedup(sources: { title: string; url: string }[]): { title: string; url: string }[] {
  return [...new Map(sources.map((s) => [s.url, s])).values()]
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

  logger.info({ propertyName, location }, '[GuestReviewAnalyzer] Starting review analysis')

  // 1 — Initialize gateway
  let gateway: GatewayRouter | null = null
  try {
    gateway = new GatewayRouter(db)
  } catch {
    // gateway optional
  }

  // 2 — Gather review data using multi-strategy search
  const { snippets: allSnippets, sources: uniqueSources } = await gatherReviewData(
    propertyName,
    location,
    gateway,
  )

  logger.info(
    { snippetCount: allSnippets.length, sourceCount: uniqueSources.length },
    '[GuestReviewAnalyzer] Data gathering complete',
  )

  // 3 — Send gathered data to LLM for structured analysis
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

${allSnippets.map((s, i) => `[${i + 1}] ${s.slice(0, 800)}`).join('\n\n')}

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

  // 4 — Fallback: If LLM not available, build basic analysis from snippets
  if (!analysisJson.themes) {
    analysisJson = buildFallbackAnalysis(allSnippets, propertyName)
    rawSummary =
      allSnippets.length > 0
        ? `Automated snippet analysis for ${propertyName} based on ${allSnippets.length} review excerpts from ${uniqueSources.length} sources. LLM-powered deep analysis was not available — results are based on keyword extraction.`
        : `No review data could be gathered for ${propertyName}. Search engines may be rate-limiting or the property name may need adjustment. Try a more specific name or add the location.`
  }

  // 5 — Persist to DB
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
      metadata: {
        model,
        sources: uniqueSources,
        snippetCount: allSnippets.length,
      } as unknown as Record<string, unknown>,
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
