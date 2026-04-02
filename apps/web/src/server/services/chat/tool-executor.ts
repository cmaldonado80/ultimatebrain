/**
 * Tool Executor — defines agent tool schemas and dispatches tool calls
 * to the appropriate engine/service functions.
 */

import type { Database } from '@solarc/db'
import type { ZodiacSign } from '@solarc/ephemeris'
import { synastryAspects } from '@solarc/ephemeris'
import { run as ephemerisRun } from '@solarc/ephemeris'
import { assignHouses, calcAllPlanets, calcHouses, julianDay } from '@solarc/ephemeris'
import { moonPhase } from '@solarc/ephemeris'
import { annualProfections, solarReturn, transitCalendar } from '@solarc/ephemeris'
import { panchanga, vimshottariDasha } from '@solarc/ephemeris'
import { secondaryProgressions } from '@solarc/ephemeris'
import { calcArabicParts } from '@solarc/ephemeris'
import { findAspectPatterns } from '@solarc/ephemeris'
import { firdaria } from '@solarc/ephemeris'
import { calcFixedStars, fixedStarConjunctions } from '@solarc/ephemeris'
import { dispositorChain } from '@solarc/ephemeris'
import { calcAllMidpoints } from '@solarc/ephemeris'
import { lunarReturn } from '@solarc/ephemeris'
import { medicalAstrology } from '@solarc/ephemeris'
import { generateNatalReport } from '@solarc/ephemeris'

import { MemoryService } from '../memory/memory-service'
import { AGENT_TOOLS } from './tools/definitions'

// Re-export for consumers
export { AGENT_TOOLS }

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; SolarcBrain/2.0)',
  Accept: 'text/html',
}

/** Search DuckDuckGo Lite and return structured results */
async function ddgSearch(
  query: string,
  max: number,
): Promise<Array<{ title: string; url: string; snippet: string }>> {
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
  let linkMatch: RegExpExecArray | null
  while ((linkMatch = linkPattern.exec(html)) !== null) {
    const href = linkMatch[1] ?? ''
    const title = (linkMatch[2] ?? '').replace(/<[^>]+>/g, '').trim()
    if (href && title && !href.includes('duckduckgo.com')) {
      links.push({ url: href, title })
    }
  }

  const snippets: string[] = []
  let snippetMatch: RegExpExecArray | null
  while ((snippetMatch = snippetPattern.exec(html)) !== null) {
    snippets.push(
      (snippetMatch[1] ?? '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
  }

  const results: Array<{ title: string; url: string; snippet: string }> = []
  for (let i = 0; i < Math.min(links.length, max); i++) {
    results.push({
      title: links[i]!.title,
      url: links[i]!.url,
      snippet: snippets[i] ?? '',
    })
  }

  // Fallback: try HTML endpoint if lite returned no results
  if (results.length === 0) {
    const fallbackUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const fbRes = await fetch(fallbackUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SolarcBrain/2.0)' },
      signal: AbortSignal.timeout(10000),
    })
    const fbHtml = await fbRes.text()

    const resultBlocks = fbHtml.match(/<div class="result results_links[\s\S]*?<\/div>\s*<\/div>/gi)
    if (resultBlocks) {
      for (const block of resultBlocks.slice(0, max)) {
        const urlMatch = block.match(/href="([^"]*)"/)
        const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/)
        const snipMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)
        if (urlMatch?.[1] && titleMatch?.[1]) {
          results.push({
            title: titleMatch[1].replace(/<[^>]+>/g, '').trim(),
            url: urlMatch[1],
            snippet: snipMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '',
          })
        }
      }
    }
  }

  return results
}

/** Strip HTML boilerplate and extract readable content */
function extractReadableContent(html: string, maxLen: number): string {
  // Remove non-content elements
  let content = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  // Try to find main content container
  const articleMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  const mainMatch = content.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
  const contentDiv = content.match(
    /<div[^>]*(?:class|id)=["'][^"']*(?:content|article|post|entry|body)[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|$)/i,
  )

  if (articleMatch?.[1]) {
    content = articleMatch[1]
  } else if (mainMatch?.[1]) {
    content = mainMatch[1]
  } else if (contentDiv?.[1]) {
    content = contentDiv[1]
  }

  // Convert block elements to newlines, strip remaining tags
  content = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote)>/gi, '\n\n')
    .replace(/<(?:hr)\s*\/?>/gi, '\n---\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim()
    .slice(0, maxLen)

  return content
}

/** Scrape a URL and return readable content with metadata */
async function scrapeUrl(
  url: string,
  maxLen: number,
): Promise<{
  url: string
  content: string
  title: string | null
  snippet: string
  metadata?: {
    title: string | null
    description: string | null
    author: string | null
    date: string | null
    image: string | null
  }
}> {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(15000),
    redirect: 'follow',
  })
  const html = await res.text()

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i)
  const metaAuthor = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([\s\S]*?)["']/i)
  const metaDate =
    html.match(
      /<meta[^>]*property=["']article:published_time["'][^>]*content=["']([\s\S]*?)["']/i,
    ) ??
    html.match(/<meta[^>]*name=["']date["'][^>]*content=["']([\s\S]*?)["']/i) ??
    html.match(/<time[^>]*datetime=["']([\s\S]*?)["']/i)
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([\s\S]*?)["']/i)

  const content = extractReadableContent(html, maxLen)
  const title = titleMatch?.[1]?.trim() ?? null

  return {
    url,
    content,
    title,
    snippet: content.slice(0, 200),
    metadata: {
      title,
      description: metaDesc?.[1]?.trim() ?? null,
      author: metaAuthor?.[1]?.trim() ?? null,
      date: metaDate?.[1]?.trim() ?? null,
      image: ogImage?.[1]?.trim() ?? null,
    },
  }
}

// ─── Tool Executor ───────────────────────────────────────────────────────────

/**
 * Execute a tool call by name, dispatching to the appropriate engine function.
 * Returns the result as a JSON string (or error message).
 */
// ─── Loop Detection State ───────────────────────────────────────────────────

import {
  DEFAULT_LOOP_CONFIG,
  detectToolLoop,
  recordToolCall,
  recordToolOutcome,
  type ToolCallRecord,
} from './loop-detection'
import { auditCommand } from './sandbox-audit'

/** Per-session tool call history for loop detection */
const sessionHistories = new Map<string, ToolCallRecord[]>()

// ─── Tool Analytics ─────────────────────────────────────────────────────────

interface ToolStats {
  successCount: number
  failureCount: number
  totalDurationMs: number
  lastUsed: number
}

/** In-memory tool analytics: Map<"toolName:agentWorkspaceId", ToolStats> */
const toolAnalytics = new Map<string, ToolStats>()

function recordToolAnalytics(
  toolName: string,
  workspaceId: string,
  success: boolean,
  durationMs: number,
): void {
  const key = `${toolName}:${workspaceId}`
  const stats = toolAnalytics.get(key) ?? {
    successCount: 0,
    failureCount: 0,
    totalDurationMs: 0,
    lastUsed: 0,
  }
  if (success) stats.successCount++
  else stats.failureCount++
  stats.totalDurationMs += durationMs
  stats.lastUsed = Date.now()
  toolAnalytics.set(key, stats)
}

/** Get tool analytics for reporting */
export function getToolAnalytics(workspaceId?: string): Array<{
  tool: string
  workspace: string
  successCount: number
  failureCount: number
  successRate: number
  avgDurationMs: number
  totalCalls: number
}> {
  const results: Array<{
    tool: string
    workspace: string
    successCount: number
    failureCount: number
    successRate: number
    avgDurationMs: number
    totalCalls: number
  }> = []

  for (const [key, stats] of toolAnalytics) {
    const [tool, ws] = key.split(':')
    if (workspaceId && ws !== workspaceId) continue
    const total = stats.successCount + stats.failureCount
    results.push({
      tool: tool!,
      workspace: ws!,
      successCount: stats.successCount,
      failureCount: stats.failureCount,
      successRate: total > 0 ? stats.successCount / total : 0,
      avgDurationMs: total > 0 ? Math.round(stats.totalDurationMs / total) : 0,
      totalCalls: total,
    })
  }

  return results.sort((a, b) => b.totalCalls - a.totalCalls)
}

/** Get or create a tool call history for a session/workspace */
function getHistory(sessionKey: string): ToolCallRecord[] {
  let history = sessionHistories.get(sessionKey)
  if (!history) {
    history = []
    sessionHistories.set(sessionKey, history)
  }
  return history
}

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  db?: Database,
  workspaceId?: string,
): Promise<string> {
  try {
    // Loop detection check (before execution)
    const sessionKey = workspaceId ?? 'default'
    const history = getHistory(sessionKey)
    const loopCheck = detectToolLoop(history, toolName, toolInput, DEFAULT_LOOP_CONFIG)

    if (loopCheck.stuck && loopCheck.level === 'critical') {
      recordToolCall(history, toolName, toolInput, DEFAULT_LOOP_CONFIG)
      // DeerFlow-inspired forced stop: instead of returning an error,
      // force the agent to produce a useful final answer with what it has so far.
      return JSON.stringify({
        _forcedStop: true,
        instruction:
          '[FORCED STOP] You have been repeating the same tool calls. ' +
          'Stop calling tools immediately and produce your best final answer ' +
          'based on what you have gathered so far. Summarize your findings, ' +
          'acknowledge what you could not complete, and give the user a useful response.',
        detector: loopCheck.detector,
        count: loopCheck.count,
      })
    }

    // Record the call (even if warning — we still execute but warn)
    recordToolCall(history, toolName, toolInput, DEFAULT_LOOP_CONFIG)

    // Execute the tool with analytics tracking
    const execStart = Date.now()
    const result = await executeToolInner(toolName, toolInput, db, workspaceId)
    const execDuration = Date.now() - execStart

    // Record the outcome for no-progress detection
    recordToolOutcome(history, toolName, toolInput, result)

    // Track tool analytics (success = no error in result)
    const isError = result.includes('"error"') && result.includes('failed')
    recordToolAnalytics(toolName, sessionKey, !isError, execDuration)

    // Prepend warning if loop was detected at warning level
    if (loopCheck.stuck && loopCheck.level === 'warning') {
      try {
        const parsed = JSON.parse(result)
        return JSON.stringify({ ...parsed, _loopWarning: loopCheck.message })
      } catch {
        return result
      }
    }

    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: `Tool execution failed: ${message}` })
  }
}

async function executeToolInner(
  toolName: string,
  toolInput: Record<string, unknown>,
  db?: Database,
  workspaceId?: string,
): Promise<string> {
  try {
    switch (toolName) {
      case 'ephemeris_natal_chart': {
        const result = await ephemerisRun({
          birthYear: toolInput.birthYear as number,
          birthMonth: toolInput.birthMonth as number,
          birthDay: toolInput.birthDay as number,
          birthHour: toolInput.birthHour as number,
          latitude: toolInput.latitude as number,
          longitude: toolInput.longitude as number,
        })
        return JSON.stringify(result)
      }

      case 'ephemeris_current_transits': {
        const now = new Date()
        const jd = julianDay(
          now.getUTCFullYear(),
          now.getUTCMonth() + 1,
          now.getUTCDate(),
          now.getUTCHours() + now.getUTCMinutes() / 60,
        )
        const planets = calcAllPlanets(jd)
        return JSON.stringify({ jd, date: now.toISOString(), planets })
      }

      case 'ephemeris_moon_phase': {
        const year = toolInput.year as number
        const month = toolInput.month as number
        const day = toolInput.day as number
        const hour = (toolInput.hour as number) ?? 12
        const jd = julianDay(year, month, day, hour)
        const planets = calcAllPlanets(jd)
        const sunLon = planets.Sun.longitude
        const moonLon = planets.Moon.longitude
        const phase = moonPhase(sunLon, moonLon)
        return JSON.stringify(phase)
      }

      case 'ephemeris_transit_calendar': {
        const input = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
          startDate: string
          endDate: string
        }
        const jd = julianDay(input.birthYear, input.birthMonth, input.birthDay, input.birthHour)
        const rawPlanets = calcAllPlanets(jd)
        const houses = calcHouses(jd, input.latitude, input.longitude)
        const natalPlanets = assignHouses(rawPlanets, houses)
        const events = await transitCalendar(natalPlanets, input.startDate, input.endDate)
        return JSON.stringify(events)
      }

      case 'ephemeris_panchanga': {
        const year = toolInput.year as number
        const month = toolInput.month as number
        const day = toolInput.day as number
        const hour = (toolInput.hour as number) ?? 12
        const jd = julianDay(year, month, day, hour)
        const result = panchanga(jd)
        return JSON.stringify(result)
      }

      case 'ephemeris_dasha': {
        const birthYear = toolInput.birthYear as number
        const birthMonth = toolInput.birthMonth as number
        const birthDay = toolInput.birthDay as number
        const birthHour = toolInput.birthHour as number
        const jd = julianDay(birthYear, birthMonth, birthDay, birthHour)
        const planets = calcAllPlanets(jd)
        const moonLon = planets.Moon.longitude
        const dashas = vimshottariDasha(moonLon, jd)
        return JSON.stringify(dashas)
      }

      case 'ephemeris_synastry': {
        const p1 = toolInput.person1 as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const p2 = toolInput.person2 as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart1 = (
          await ephemerisRun({
            birthYear: p1.birthYear,
            birthMonth: p1.birthMonth,
            birthDay: p1.birthDay,
            birthHour: p1.birthHour,
            latitude: p1.latitude,
            longitude: p1.longitude,
          })
        ).data
        const chart2 = (
          await ephemerisRun({
            birthYear: p2.birthYear,
            birthMonth: p2.birthMonth,
            birthDay: p2.birthDay,
            birthHour: p2.birthHour,
            latitude: p2.latitude,
            longitude: p2.longitude,
          })
        ).data
        const aspects = synastryAspects(chart1, chart2)
        return JSON.stringify(aspects)
      }

      case 'ephemeris_solar_return': {
        const natalSunLon = toolInput.natalSunLongitude as number
        const year = toolInput.year as number
        const lat = toolInput.latitude as number
        const lon = toolInput.longitude as number
        const result = await solarReturn(natalSunLon, year, lat, lon)
        return JSON.stringify(result)
      }

      case 'ephemeris_profections': {
        const birthYear = toolInput.birthYear as number
        const currentYear = toolInput.currentYear as number
        const ascendantSign = toolInput.ascendantSign as ZodiacSign
        const result = annualProfections(birthYear, currentYear, ascendantSign)
        return JSON.stringify(result)
      }

      case 'memory_search': {
        if (!db) return JSON.stringify({ error: 'Database not available for memory operations' })
        const memoryService = new MemoryService(db)
        const query = toolInput.query as string
        const limit = (toolInput.limit as number) ?? 5
        const results = await memoryService.search(query, {
          limit,
          ...(workspaceId ? { workspaceId } : {}),
        })
        return JSON.stringify(results)
      }

      case 'memory_store': {
        if (!db) return JSON.stringify({ error: 'Database not available for memory operations' })
        const memoryService = new MemoryService(db)
        const key = toolInput.key as string
        const content = toolInput.content as string
        const stored = await memoryService.store({
          key,
          content,
          ...(workspaceId ? { workspaceId } : {}),
        })
        return JSON.stringify({ id: stored.id, key: stored.key })
      }

      case 'ephemeris_lunar_return': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
          targetYear: number
          targetMonth: number
        }
        const birthJd = julianDay(i.birthYear, i.birthMonth, i.birthDay, i.birthHour)
        const birthPlanets = calcAllPlanets(birthJd)
        const targetJd = julianDay(i.targetYear, i.targetMonth, 1, 12)
        const result = await lunarReturn(
          birthPlanets.Moon.longitude,
          targetJd,
          i.latitude,
          i.longitude,
        )
        return JSON.stringify(result)
      }

      case 'ephemeris_progressions': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
          targetYear: number
          targetMonth: number
          targetDay: number
        }
        const bJd = julianDay(i.birthYear, i.birthMonth, i.birthDay, i.birthHour)
        const tJd = julianDay(i.targetYear, i.targetMonth, i.targetDay, 12)
        const result = await secondaryProgressions(bJd, tJd, i.latitude, i.longitude)
        return JSON.stringify(result)
      }

      case 'ephemeris_arabic_parts': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart = (await ephemerisRun(i)).data
        const parts = calcArabicParts(chart.planets, chart.houses)
        return JSON.stringify(parts)
      }

      case 'ephemeris_patterns': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart = (await ephemerisRun(i)).data
        const patterns = findAspectPatterns(chart.aspects, chart.planets)
        return JSON.stringify(patterns)
      }

      case 'ephemeris_firdaria': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          maxAge?: number
        }
        // Determine day/night chart: hour < 6 or > 18 = night
        const isDiurnal = i.birthHour >= 6 && i.birthHour < 18
        const periods = firdaria(isDiurnal, i.maxAge ?? 75)
        // Anchor age-based periods to actual calendar dates
        const birthDate = new Date(i.birthYear, i.birthMonth - 1, i.birthDay)
        const anchored = periods.map((p) => ({
          ...p,
          startDate: new Date(birthDate.getTime() + p.startAge * 365.25 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10),
          endDate: new Date(birthDate.getTime() + p.endAge * 365.25 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10),
          subPeriods: p.subPeriods.map((sp) => ({
            ...sp,
            startDate: new Date(birthDate.getTime() + sp.startAge * 365.25 * 24 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10),
            endDate: new Date(birthDate.getTime() + sp.endAge * 365.25 * 24 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10),
          })),
        }))
        return JSON.stringify(anchored)
      }

      case 'ephemeris_fixed_stars': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart = (await ephemerisRun(i)).data
        const jdStar = julianDay(i.birthYear, i.birthMonth, i.birthDay, i.birthHour)
        const stars = calcFixedStars(jdStar)
        const conj = fixedStarConjunctions(stars, chart.planets)
        return JSON.stringify(conj)
      }

      case 'ephemeris_dispositors': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart = (await ephemerisRun(i)).data
        const result = dispositorChain(chart.planets)
        return JSON.stringify(result)
      }

      case 'ephemeris_midpoints': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart = (await ephemerisRun(i)).data
        const result = calcAllMidpoints(chart.planets)
        return JSON.stringify(result)
      }

      case 'ephemeris_medical': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
        }
        const chart = (await ephemerisRun(i)).data
        const result = medicalAstrology(chart.planets)
        return JSON.stringify(result)
      }

      case 'ephemeris_report': {
        const i = toolInput as {
          birthYear: number
          birthMonth: number
          birthDay: number
          birthHour: number
          latitude: number
          longitude: number
          name?: string
        }
        const result = await generateNatalReport(i as Parameters<typeof generateNatalReport>[0])
        return JSON.stringify(result)
      }

      case 'ephemeris_horary': {
        const i = toolInput as {
          year: number
          month: number
          day: number
          hour: number
          latitude: number
          longitude: number
          questionHouse: number
        }
        const { assessHoraryChart } = await import('../engines/swiss-ephemeris/horary')
        const result = await assessHoraryChart(i)
        return JSON.stringify(result)
      }

      case 'ephemeris_electional': {
        const i = toolInput as {
          year: number
          month: number
          day: number
          hour: number
          latitude: number
          longitude: number
          activityType?: string
        }
        const { scoreElection } = await import('../engines/swiss-ephemeris/electional')
        const result = await scoreElection({
          ...i,
          activityType: (i.activityType ?? 'general') as
            | 'business'
            | 'relationship'
            | 'travel'
            | 'medical'
            | 'legal'
            | 'creative'
            | 'general',
        })
        return JSON.stringify(result)
      }

      case 'sessions_send': {
        if (!db) return JSON.stringify({ error: 'Database required for agent messaging' })
        const targetId = toolInput.targetAgentId as string
        const msg = toolInput.message as string
        const { agents: agentsTable } = await import('@solarc/db')
        const { eq: eqOp } = await import('drizzle-orm')
        const target = await db.query.agents.findFirst({ where: eqOp(agentsTable.id, targetId) })
        if (!target) return JSON.stringify({ error: `Agent ${targetId} not found` })
        const { GatewayRouter: GW } = await import('../gateway')
        const gw = new GW(db)
        const resp = await gw.chat({
          model: target.model ?? undefined,
          messages: [
            ...(target.soul ? [{ role: 'system' as const, content: target.soul }] : []),
            { role: 'user', content: msg },
          ],
          agentId: target.id,
        })
        return JSON.stringify({
          agentId: target.id,
          agentName: target.name,
          response: resp.content,
        })
      }

      case 'sessions_spawn': {
        if (!db) return JSON.stringify({ error: 'Database required for agent spawning' })
        const spawnAgentId = toolInput.agentId as string
        const spawnTask = toolInput.task as string
        const { agents: agentsT } = await import('@solarc/db')
        const { eq: eqFn } = await import('drizzle-orm')
        const spawnAgent = await db.query.agents.findFirst({
          where: eqFn(agentsT.id, spawnAgentId),
        })
        if (!spawnAgent) return JSON.stringify({ error: `Agent ${spawnAgentId} not found` })
        const { GatewayRouter: Gateway } = await import('../gateway')
        const spawnGw = new Gateway(db)
        const spawnResult = await spawnGw.chat({
          model: spawnAgent.model ?? undefined,
          messages: [
            ...(spawnAgent.soul ? [{ role: 'system' as const, content: spawnAgent.soul }] : []),
            { role: 'user', content: spawnTask },
          ],
          agentId: spawnAgent.id,
        })
        return JSON.stringify({
          agentId: spawnAgent.id,
          agentName: spawnAgent.name,
          response: spawnResult.content,
          status: 'completed',
        })
      }

      case 'web_search': {
        const query = toolInput.query as string
        const max = Math.min((toolInput.maxResults as number) ?? 5, 10)
        try {
          const results = await ddgSearch(query, max)
          return JSON.stringify({ query, resultCount: results.length, results })
        } catch (err) {
          return JSON.stringify({
            query,
            results: [],
            error: err instanceof Error ? err.message : 'Search failed',
          })
        }
      }

      case 'web_scrape': {
        const targetUrl = toolInput.url as string
        const maxLen = (toolInput.maxLength as number) ?? 8000
        try {
          const scraped = await scrapeUrl(targetUrl, maxLen)
          return JSON.stringify({
            url: targetUrl,
            metadata: scraped.metadata,
            content: scraped.content,
            contentLength: scraped.content.length,
          })
        } catch (err) {
          return JSON.stringify({
            url: targetUrl,
            error: err instanceof Error ? err.message : 'Scrape failed',
          })
        }
      }

      case 'db_query': {
        if (!db) return JSON.stringify({ error: 'Database not available' })
        const sql = toolInput.sql as string
        // Sandbox audit for SQL queries
        const sqlAudit = auditCommand(sql)
        if (sqlAudit.verdict === 'block') {
          return JSON.stringify({ error: `Query blocked by sandbox audit: ${sqlAudit.reason}` })
        }
        const sqlNormalized = sql.trim().toLowerCase()
        if (!sqlNormalized.startsWith('select')) {
          return JSON.stringify({ error: 'Only SELECT queries are allowed (read-only)' })
        }
        // Block multiple statements (SQL injection via semicolons)
        const sqlNoStrings = sql.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '')
        if (sqlNoStrings.includes(';')) {
          return JSON.stringify({ error: 'Multiple statements are not allowed' })
        }
        // Block dangerous keywords outside of string literals
        const dangerousPattern =
          /\b(drop|delete|insert|update|alter|create|truncate|grant|revoke|exec|execute)\b/i
        if (dangerousPattern.test(sqlNoStrings)) {
          return JSON.stringify({ error: 'Only read-only SELECT queries are allowed' })
        }
        try {
          const result = await (db as any).execute(sql)
          const rows = result?.rows ?? []
          return JSON.stringify({ rowCount: rows.length, rows: rows.slice(0, 100) })
        } catch (err) {
          return JSON.stringify({ error: err instanceof Error ? err.message : 'Query failed' })
        }
      }

      case 'vision_analyze': {
        const imageUrl = toolInput.imageUrl as string
        const question = (toolInput.question as string) ?? 'Describe what you see in this image.'
        try {
          if (!db) return JSON.stringify({ error: 'Database required for gateway' })
          const { GatewayRouter: GW } = await import('../gateway')
          const gw = new GW(db)
          const result = await gw.chat({
            model: 'llama-3.2-11b-vision:cloud',
            messages: [{ role: 'user', content: `${question}\n\nImage URL: ${imageUrl}` }],
          })
          return JSON.stringify({ analysis: result.content })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Vision analysis failed',
          })
        }
      }

      case 'weather': {
        const location = toolInput.location as string
        try {
          const res = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=j1`, {
            signal: AbortSignal.timeout(10000),
          })
          const data = await res.json()
          return JSON.stringify(data)
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Weather fetch failed',
          })
        }
      }

      case 'self_improve': {
        const trigger = toolInput.trigger as string
        const correction = toolInput.correction as string
        const category = (toolInput.category as string) ?? 'general'
        if (db) {
          try {
            const { instinctObservations } = await import('@solarc/db')
            await db.insert(instinctObservations).values({
              eventType: 'self_improve',
              payload: { trigger, correction, category },
            })
          } catch {
            /* best-effort */
          }
        }
        return JSON.stringify({ logged: true, trigger, correction, category })
      }

      case 'data_analyze': {
        if (!db) return JSON.stringify({ error: 'Database not available' })
        const sqlQ = toolInput.sql as string
        const question = toolInput.question as string
        if (!sqlQ.trim().toLowerCase().startsWith('select')) {
          return JSON.stringify({ error: 'Only SELECT queries allowed' })
        }
        const sqlQNoStrings = sqlQ.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '')
        if (sqlQNoStrings.includes(';')) {
          return JSON.stringify({ error: 'Multiple statements are not allowed' })
        }
        const dangerousQ =
          /\b(drop|delete|insert|update|alter|create|truncate|grant|revoke|exec|execute)\b/i
        if (dangerousQ.test(sqlQNoStrings)) {
          return JSON.stringify({ error: 'Only read-only SELECT queries are allowed' })
        }
        try {
          const result = await (db as any).execute(sqlQ)
          const rows = result?.rows ?? []
          const summary = `Query returned ${rows.length} rows. Sample: ${JSON.stringify(rows.slice(0, 3))}`
          return JSON.stringify({
            question,
            rowCount: rows.length,
            summary,
            sample: rows.slice(0, 10),
          })
        } catch (err) {
          return JSON.stringify({ error: err instanceof Error ? err.message : 'Query failed' })
        }
      }

      case 'workflow_create': {
        if (!db) return JSON.stringify({ error: 'Database not available' })
        const { flows } = await import('@solarc/db')
        const name = toolInput.name as string
        const desc = (toolInput.description as string) ?? ''
        let steps: unknown[] = []
        try {
          steps = JSON.parse(toolInput.steps as string)
        } catch {
          /* invalid JSON */
        }
        const [flow] = await db
          .insert(flows)
          .values({
            name,
            description: desc,
            steps,
            status: 'draft',
          })
          .returning()
        return JSON.stringify({ flowId: flow?.id, name, stepCount: steps.length })
      }

      case 'pipeline_run': {
        const prompt = toolInput.prompt as string
        const ticketId = toolInput.ticketId as string | undefined
        // Delegate to task runner service
        return JSON.stringify({
          status: 'dispatched',
          prompt,
          ticketId: ticketId ?? null,
          message: 'Task submitted to pipeline runner',
        })
      }

      case 'slack_send': {
        const message = toolInput.message as string
        const webhookUrl = process.env.SLACK_WEBHOOK_URL
        if (!webhookUrl) return JSON.stringify({ error: 'SLACK_WEBHOOK_URL not configured' })
        try {
          const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: message }),
          })
          return JSON.stringify({ sent: res.ok, status: res.status })
        } catch (err) {
          return JSON.stringify({ error: err instanceof Error ? err.message : 'Slack send failed' })
        }
      }

      case 'notion_query': {
        const action = toolInput.action as string
        const query = toolInput.query as string
        const notionKey = process.env.NOTION_API_KEY
        if (!notionKey) return JSON.stringify({ error: 'NOTION_API_KEY not configured' })
        try {
          if (action === 'search') {
            const res = await fetch('https://api.notion.com/v1/search', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${notionKey}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ query }),
            })
            const data = await res.json()
            return JSON.stringify(data)
          }
          return JSON.stringify({ error: `Unknown action: ${action}. Use: search, read, create` })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Notion query failed',
          })
        }
      }

      case 'docker_manage': {
        const action = toolInput.action as string
        const containerId = toolInput.containerId as string | undefined
        // Docker Socket API calls
        const dockerSocket = process.env.DOCKER_HOST ?? 'http://localhost:2375'
        try {
          if (action === 'list') {
            const res = await fetch(`${dockerSocket}/containers/json?all=true`, {
              signal: AbortSignal.timeout(5000),
            })
            const containers = await res.json()
            return JSON.stringify(
              containers.map((c: any) => ({
                id: c.Id?.slice(0, 12),
                names: c.Names,
                state: c.State,
                status: c.Status,
                image: c.Image,
              })),
            )
          }
          if (!containerId) return JSON.stringify({ error: 'containerId required for this action' })
          if (action === 'start' || action === 'stop') {
            const res = await fetch(`${dockerSocket}/containers/${containerId}/${action}`, {
              method: 'POST',
              signal: AbortSignal.timeout(10000),
            })
            return JSON.stringify({ action, containerId, success: res.ok })
          }
          if (action === 'inspect') {
            const res = await fetch(`${dockerSocket}/containers/${containerId}/json`, {
              signal: AbortSignal.timeout(5000),
            })
            return JSON.stringify(await res.json())
          }
          if (action === 'logs') {
            const res = await fetch(
              `${dockerSocket}/containers/${containerId}/logs?stdout=true&tail=50`,
              { signal: AbortSignal.timeout(5000) },
            )
            return JSON.stringify({ logs: await res.text() })
          }
          return JSON.stringify({ error: `Unknown action: ${action}` })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Docker operation failed',
          })
        }
      }

      case 'workspace_files': {
        if (!db) return JSON.stringify({ error: 'Database not available' })
        const action = toolInput.action as string
        const filename = toolInput.filename as string | undefined
        const content = toolInput.content as string | undefined
        const { artifacts } = await import('@solarc/db')
        const { eq: eqOp } = await import('drizzle-orm')

        if (action === 'list') {
          const files = await db.query.artifacts.findMany({
            ...(workspaceId ? { where: eqOp(artifacts.agentId, workspaceId) } : {}),
            limit: 50,
          })
          return JSON.stringify(
            files.map((f) => ({ id: f.id, name: f.name, type: f.type, createdAt: f.createdAt })),
          )
        }
        if (action === 'write' && filename && content) {
          const [file] = await db
            .insert(artifacts)
            .values({
              name: filename,
              content,
              type: 'workspace_file',
            })
            .returning()
          return JSON.stringify({ id: file?.id, filename, written: true })
        }
        if (action === 'read' && filename) {
          const file = await db.query.artifacts.findFirst({
            where: eqOp(artifacts.name, filename),
          })
          return JSON.stringify(
            file ? { filename, content: file.content } : { error: 'File not found' },
          )
        }
        return JSON.stringify({ error: 'Invalid action. Use: list, read, write' })
      }

      case 'deep_interview': {
        if (!db) return JSON.stringify({ error: 'Database required for deep interview' })
        const task = toolInput.task as string
        const answers = toolInput.answers as string | undefined
        const { GatewayRouter: GW } = await import('../gateway')
        const gw = new GW(db)

        if (!answers) {
          // Phase 1: Generate clarifying questions
          const result = await gw.chat({
            messages: [
              {
                role: 'system',
                content:
                  'You are a requirements analyst. Given a task description, generate exactly 5 clarifying questions that expose hidden assumptions, ambiguities, and edge cases. Format: numbered list. Be specific and actionable.',
              },
              { role: 'user', content: `Task: ${task}` },
            ],
          })
          return JSON.stringify({
            phase: 'questions',
            task,
            questions: result.content,
            instruction:
              'Answer these questions, then call deep_interview again with the task AND your answers.',
          })
        }

        // Phase 2: Synthesize PRD from task + answers
        const result = await gw.chat({
          messages: [
            {
              role: 'system',
              content:
                'You are a product requirements writer. Given a task and answered clarifying questions, produce a clear, structured PRD (Product Requirements Document). Include: Goal, Requirements (numbered), Constraints, Acceptance Criteria, Out of Scope.',
            },
            { role: 'user', content: `Task: ${task}\n\nClarifying Answers:\n${answers}` },
          ],
        })
        return JSON.stringify({ phase: 'prd', task, prd: result.content })
      }

      case 'staged_pipeline': {
        if (!db) return JSON.stringify({ error: 'Database required for staged pipeline' })
        const task = toolInput.task as string
        const maxLoops = (toolInput.maxFixLoops as number) ?? 2
        const { GatewayRouter: GW } = await import('../gateway')
        const gw = new GW(db)

        // Stage 1: Plan
        const planResult = await gw.chat({
          messages: [
            {
              role: 'system',
              content:
                'You are a planner. Break this task into clear, numbered steps. Be specific about what each step produces.',
            },
            { role: 'user', content: task },
          ],
        })
        const plan = planResult.content

        // Stage 2: Execute
        const execResult = await gw.chat({
          messages: [
            {
              role: 'system',
              content:
                'You are an executor. Follow this plan step by step. For each step, describe what you would do and the expected output.',
            },
            { role: 'user', content: `Task: ${task}\n\nPlan:\n${plan}` },
          ],
        })
        const execution = execResult.content

        // Stage 3+4: Verify → Fix loop
        let verification = ''
        const fixes: string[] = []
        let currentExecution = execution
        let passed = false

        for (let i = 0; i < maxLoops; i++) {
          const verifyResult = await gw.chat({
            messages: [
              {
                role: 'system',
                content:
                  'You are a reviewer. Check this execution against the original task. If everything is correct, respond with exactly "PASS". Otherwise, list specific issues that need fixing.',
              },
              { role: 'user', content: `Task: ${task}\n\nExecution:\n${currentExecution}` },
            ],
          })
          verification = verifyResult.content

          if (verification.trim().toUpperCase().startsWith('PASS')) {
            passed = true
            break
          }

          // Fix
          const fixResult = await gw.chat({
            messages: [
              {
                role: 'system',
                content:
                  'You are a fixer. Address each issue listed in the review. Provide the corrected execution.',
              },
              {
                role: 'user',
                content: `Issues:\n${verification}\n\nOriginal execution:\n${currentExecution}`,
              },
            ],
          })
          fixes.push(fixResult.content)
          currentExecution = fixResult.content
        }

        return JSON.stringify({
          task,
          stages: {
            plan,
            execution,
            verification,
            fixes,
            finalExecution: currentExecution,
          },
          passed,
          loopsUsed: fixes.length,
        })
      }

      case 'multi_provider_synthesis': {
        if (!db) return JSON.stringify({ error: 'Database required for synthesis' })
        const question = toolInput.question as string
        const context = (toolInput.context as string) ?? ''
        const { GatewayRouter: GW } = await import('../gateway')
        const gw = new GW(db)

        const prompt = context ? `${question}\n\nContext: ${context}` : question

        // Query 3 providers in parallel
        const [responseA, responseB, responseC] = await Promise.all([
          gw
            .chat({
              model: 'deepseek-v3.2:cloud',
              messages: [{ role: 'user', content: prompt }],
            })
            .catch((err) => ({
              content: `[DeepSeek unavailable: ${err instanceof Error ? err.message : 'error'}]`,
              tokensIn: 0,
              tokensOut: 0,
            })),
          gw
            .chat({
              model: 'qwen3.5:cloud',
              messages: [{ role: 'user', content: prompt }],
            })
            .catch((err) => ({
              content: `[Qwen unavailable: ${err instanceof Error ? err.message : 'error'}]`,
              tokensIn: 0,
              tokensOut: 0,
            })),
          gw
            .chat({
              messages: [{ role: 'user', content: prompt }],
            })
            .catch((err) => ({
              content: `[Default unavailable: ${err instanceof Error ? err.message : 'error'}]`,
              tokensIn: 0,
              tokensOut: 0,
            })),
        ])

        // Synthesize
        const synthesisResult = await gw.chat({
          messages: [
            {
              role: 'system',
              content:
                'You are a synthesis expert. Given responses from 3 different AI models to the same question, produce the best possible answer by combining insights, resolving contradictions, and highlighting consensus.',
            },
            {
              role: 'user',
              content: `Question: ${question}\n\nModel A (DeepSeek):\n${responseA.content}\n\nModel B (Qwen):\n${responseB.content}\n\nModel C (Default):\n${responseC.content}`,
            },
          ],
        })

        return JSON.stringify({
          question,
          responses: [
            { provider: 'deepseek-v3.2:cloud', content: responseA.content },
            { provider: 'qwen3.5:cloud', content: responseB.content },
            { provider: 'default', content: responseC.content },
          ],
          synthesis: synthesisResult.content,
        })
      }

      case 'deep_research': {
        const question = toolInput.question as string
        const depth = (toolInput.depth as string) ?? 'standard'
        const subQueryCount = depth === 'quick' ? 3 : depth === 'thorough' ? 7 : 5
        const resultsPerQuery = depth === 'quick' ? 2 : depth === 'thorough' ? 5 : 3

        try {
          // Step 1: Generate sub-queries using gateway
          let subQueries: string[] = []
          if (db) {
            const { GatewayRouter: GW } = await import('../gateway')
            const gw = new GW(db)
            const planResult = await gw.chat({
              messages: [
                {
                  role: 'system',
                  content: `You are a research planning expert. Given a research question, generate exactly ${subQueryCount} specific web search queries that together will comprehensively answer the question. Return ONLY a JSON array of strings, no other text.`,
                },
                { role: 'user', content: question },
              ],
            })
            try {
              const parsed = JSON.parse(
                planResult.content.replace(/```json\n?/g, '').replace(/```\n?/g, ''),
              )
              subQueries = Array.isArray(parsed) ? parsed.slice(0, subQueryCount) : []
            } catch {
              subQueries = [question, `${question} latest research`, `${question} expert analysis`]
            }
          } else {
            subQueries = [question, `${question} research`, `${question} analysis`].slice(
              0,
              subQueryCount,
            )
          }

          // Step 2: Parallel web searches using shared helper
          const searchResults = await Promise.all(
            subQueries.map(async (q) => {
              try {
                const results = await ddgSearch(q, resultsPerQuery)
                return results.map((r) => ({ ...r, query: q }))
              } catch {
                return []
              }
            }),
          )
          const allResults = searchResults.flat()

          // Step 3: Deduplicate by URL and scrape top results using shared helper
          const seen = new Set<string>()
          const uniqueResults = allResults.filter((r) => {
            if (seen.has(r.url)) return false
            seen.add(r.url)
            return true
          })

          const maxScrape = depth === 'quick' ? 6 : depth === 'thorough' ? 15 : 10
          const sources = await Promise.all(
            uniqueResults.slice(0, maxScrape).map(async (r) => {
              try {
                const scraped = await scrapeUrl(r.url, 2000)
                return {
                  url: r.url,
                  title: scraped.title ?? r.title,
                  snippet: r.snippet,
                  content: scraped.content,
                }
              } catch {
                return { url: r.url, title: r.title, snippet: r.snippet, content: '' }
              }
            }),
          )

          // Step 4: Synthesize with citations
          let synthesis = ''
          const citations: Array<{ claim: string; sourceUrl: string }> = []

          if (db) {
            const { GatewayRouter: GW2 } = await import('../gateway')
            const gw2 = new GW2(db)

            const sourceSummaries = sources
              .filter((s) => s.content.length > 50)
              .map((s, i) => `[Source ${i + 1}] ${s.title}\nURL: ${s.url}\n${s.content}`)
              .join('\n\n---\n\n')

            const synthResult = await gw2.chat({
              messages: [
                {
                  role: 'system',
                  content:
                    'You are a research synthesis expert. Given a question and multiple source extracts, produce a comprehensive, well-structured answer. Cite sources using [Source N] notation. Be factual, thorough, and highlight areas of agreement/disagreement between sources.',
                },
                {
                  role: 'user',
                  content: `Research Question: ${question}\n\nSources:\n${sourceSummaries}`,
                },
              ],
            })
            synthesis = synthResult.content

            // Extract citation references from synthesis
            const citeMatches = synthesis.matchAll(/\[Source (\d+)\]/g)
            for (const cm of citeMatches) {
              const idx = parseInt(cm[1]!, 10) - 1
              if (sources[idx]) {
                citations.push({
                  claim:
                    cm.input
                      ?.slice(Math.max(0, (cm.index ?? 0) - 80), (cm.index ?? 0) + 80)
                      ?.trim() ?? '',
                  sourceUrl: sources[idx]!.url,
                })
              }
            }
          } else {
            synthesis =
              'Synthesis requires database access for LLM gateway. Raw sources are provided below.'
          }

          return JSON.stringify({
            question,
            depth,
            plan: subQueries,
            sourceCount: sources.length,
            sources: sources.map((s) => ({
              url: s.url,
              title: s.title,
              snippet: s.snippet,
              contentPreview: s.content.slice(0, 200),
            })),
            synthesis,
            citations: [...new Map(citations.map((c) => [c.sourceUrl, c])).values()],
          })
        } catch (err) {
          return JSON.stringify({
            question,
            error: err instanceof Error ? err.message : 'Deep research failed',
          })
        }
      }

      case 'cite_sources': {
        const text = toolInput.text as string
        const sourceUrls = toolInput.sourceUrls as string[]
        try {
          // Scrape each source using shared helper
          const scrapedSources = await Promise.all(
            sourceUrls.slice(0, 10).map(async (srcUrl) => {
              try {
                const scraped = await scrapeUrl(srcUrl, 3000)
                return { url: srcUrl, content: scraped.content }
              } catch {
                return { url: srcUrl, content: '' }
              }
            }),
          )

          if (!db) {
            return JSON.stringify({
              error: 'Citation mapping requires database access for LLM gateway',
              sources: scrapedSources.map((s) => ({ url: s.url, available: s.content.length > 0 })),
            })
          }

          const { GatewayRouter: GW } = await import('../gateway')
          const gw = new GW(db)

          const sourceBlock = scrapedSources
            .filter((s) => s.content.length > 0)
            .map((s) => `[${s.url}]\n${s.content}`)
            .join('\n\n---\n\n')

          const citeResult = await gw.chat({
            messages: [
              {
                role: 'system',
                content:
                  'You map claims to sources. Given a text and sources, identify each factual claim in the text and match it to the source URL that supports it. Return ONLY a JSON array: [{"claim": "...", "sourceUrl": "...", "quote": "relevant quote from source"}]. If a claim has no matching source, omit it.',
              },
              {
                role: 'user',
                content: `Text to cite:\n${text}\n\nSources:\n${sourceBlock}`,
              },
            ],
          })

          try {
            const citations = JSON.parse(
              citeResult.content.replace(/```json\n?/g, '').replace(/```\n?/g, ''),
            )
            return JSON.stringify({ citations, sourceCount: scrapedSources.length })
          } catch {
            return JSON.stringify({
              rawResponse: citeResult.content,
              sourceCount: scrapedSources.length,
            })
          }
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Citation failed',
          })
        }
      }

      case 'mixture_of_agents': {
        // Hermes-inspired MoA: send same question to 3 models, aggregate best answer
        const moaQuestion = toolInput.question as string
        const moaContext = (toolInput.context as string) ?? ''
        if (!db)
          return JSON.stringify({ error: 'Mixture of Agents requires database for LLM gateway' })

        try {
          const { GatewayRouter: MoaGW } = await import('../gateway')
          const moaGw = new MoaGW(db)

          // Layer 1: 3 reference models answer in parallel
          const referenceModels = [
            {
              name: 'analyst',
              prompt:
                'You are a rigorous analytical thinker. Break the problem into components and reason step-by-step. Be precise and cite your reasoning.',
            },
            {
              name: 'creative',
              prompt:
                'You are a creative problem solver. Think laterally, consider unconventional approaches, and look for insights others might miss.',
            },
            {
              name: 'critic',
              prompt:
                'You are a critical evaluator. Identify edge cases, potential errors, and challenge assumptions. Point out what could go wrong.',
            },
          ]

          const referenceResults = await Promise.allSettled(
            referenceModels.map(async (model) => {
              const result = await moaGw.chat({
                messages: [
                  { role: 'system', content: model.prompt },
                  {
                    role: 'user',
                    content: moaContext
                      ? `Context: ${moaContext}\n\nQuestion: ${moaQuestion}`
                      : moaQuestion,
                  },
                ],
                temperature: 0.6,
                maxTokens: 2048,
              })
              return { name: model.name, response: result.content }
            }),
          )

          const successful = referenceResults
            .filter(
              (r): r is PromiseFulfilledResult<{ name: string; response: string }> =>
                r.status === 'fulfilled',
            )
            .map((r) => r.value)

          if (successful.length === 0) {
            return JSON.stringify({ error: 'All reference models failed' })
          }

          // Layer 1.5: Peer review — agents score each other before aggregation
          let approvedPerspectives = successful
          if (successful.length >= 2) {
            try {
              const { runPeerReview } = await import('../intelligence/peer-review')
              const peerResult = await runPeerReview(
                moaQuestion,
                successful.map((s) => ({ name: s.name, content: s.response })),
                moaGw,
              )
              approvedPerspectives = peerResult.approved.map((a) => ({
                name: a.name,
                response: a.content,
              }))
            } catch {
              // Peer review failed — use all perspectives (graceful degradation)
            }
          }

          // Layer 2: Aggregator synthesizes the best answer (only approved perspectives)
          const referencesText = approvedPerspectives
            .map((r) => `### ${r.name.toUpperCase()} PERSPECTIVE\n${r.response}`)
            .join('\n\n')

          const aggregated = await moaGw.chat({
            messages: [
              {
                role: 'system',
                content:
                  'You are an expert synthesizer. You have received responses from multiple AI perspectives on the same question. Critically evaluate each response, identify the strongest reasoning, resolve conflicts, and produce a single authoritative answer that combines the best insights. Be specific and thorough.',
              },
              { role: 'user', content: `Question: ${moaQuestion}\n\n${referencesText}` },
            ],
            temperature: 0.4,
            maxTokens: 4096,
          })

          return JSON.stringify({
            answer: aggregated.content,
            modelsUsed: successful.length,
            perspectives: successful.map((r) => r.name),
          })
        } catch (err) {
          return JSON.stringify({ error: err instanceof Error ? err.message : 'MoA failed' })
        }
      }

      case 'save_skill': {
        // Hermes-inspired procedural skill capture — save multi-step workflows as reusable skills
        const skillName = toolInput.name as string
        const skillDescription = toolInput.description as string
        const skillSteps = toolInput.steps as string[]
        const skillCategory = (toolInput.category as string) ?? 'general'

        if (!db) return JSON.stringify({ error: 'Database required for skill storage' })

        try {
          const { memories: memoriesTable } = await import('@solarc/db')

          // Store skill as a core-tier memory with structured content
          const skillContent = [
            `## Skill: ${skillName}`,
            `**Category:** ${skillCategory}`,
            `**Description:** ${skillDescription}`,
            '',
            '### Steps',
            ...skillSteps.map((step, i) => `${i + 1}. ${step}`),
          ].join('\n')

          const [saved] = await db
            .insert(memoriesTable)
            .values({
              key: `skill:${skillName}`,
              content: skillContent,
              tier: 'core',
              factType: 'observation',
              confidence: 0.9,
              proofCount: 1,
              ...(workspaceId ? { workspaceId } : {}),
            })
            .returning({ id: memoriesTable.id })

          return JSON.stringify({
            saved: true,
            skillName,
            skillId: saved?.id,
            category: skillCategory,
            stepCount: skillSteps.length,
            message: `Skill "${skillName}" saved. It will be recalled when similar tasks arise.`,
          })
        } catch (err) {
          return JSON.stringify({ error: err instanceof Error ? err.message : 'Skill save failed' })
        }
      }

      case 'execute_workflow': {
        // DAG Engine — execute multi-step workflows with branching and parallelism
        const wfName = toolInput.name as string
        const wfNodes = toolInput.nodes as Array<{
          id: string
          type: string
          tool?: string
          input?: Record<string, unknown>
          condition?: string
          trueBranch?: string[]
          falseBranch?: string[]
          dependsOn?: string[]
        }>

        if (!db) return JSON.stringify({ error: 'Database required for workflow execution' })

        try {
          const { executeDAG } = await import('../orchestration/dag-engine')

          const workflow = {
            id: crypto.randomUUID(),
            name: wfName,
            nodes: wfNodes.map((n) => ({
              id: n.id,
              type: n.type as 'tool' | 'condition' | 'parallel' | 'aggregate',
              tool: n.tool,
              input: n.input,
              condition: n.condition,
              trueBranch: n.trueBranch,
              falseBranch: n.falseBranch,
              dependsOn: n.dependsOn ?? [],
              status: 'pending' as const,
            })),
            state: {} as Record<string, unknown>,
            status: 'pending' as 'pending' | 'running' | 'completed' | 'failed',
          }

          const result = await executeDAG(workflow, async (toolName, input) => {
            return executeToolInner(toolName, input, db, workspaceId)
          })

          return JSON.stringify({
            workflowId: result.workflowId,
            status: result.status,
            totalDurationMs: result.totalDurationMs,
            nodesExecuted: result.nodeResults.length,
            nodeResults: result.nodeResults.map((n) => ({
              id: n.id,
              status: n.status,
              durationMs: n.durationMs,
            })),
            finalState: Object.fromEntries(
              Object.entries(result.state).slice(0, 20), // Cap state output
            ),
          })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Workflow execution failed',
          })
        }
      }

      // ── CEO / Org Management Tool Executors ──────────────────────────

      case 'file_system': {
        const fsAction = toolInput.action as string
        const fsPath = toolInput.path as string
        const fsContent = toolInput.content as string | undefined

        // Security: block path traversal
        if (fsPath.includes('..') || fsPath.startsWith('/')) {
          return JSON.stringify({ error: 'Path traversal not allowed. Use relative paths only.' })
        }

        const { auditCommand: auditFs } = await import('./sandbox-audit')
        const fsAudit = auditFs(`file ${fsAction} ${fsPath}`)
        if (fsAudit.verdict === 'block') {
          return JSON.stringify({ error: `Blocked: ${fsAudit.reason}` })
        }

        const path = await import('path')
        const fs = await import('fs/promises')
        const fullPath = path.resolve(process.cwd(), fsPath)

        try {
          switch (fsAction) {
            case 'read': {
              const data = await fs.readFile(fullPath, 'utf-8')
              return JSON.stringify({
                path: fsPath,
                content: data.slice(0, 50000),
                truncated: data.length > 50000,
              })
            }
            case 'write': {
              if (!fsContent) return JSON.stringify({ error: 'Content required for write' })
              await fs.mkdir(path.dirname(fullPath), { recursive: true })
              await fs.writeFile(fullPath, fsContent, 'utf-8')
              return JSON.stringify({ path: fsPath, written: true, bytes: fsContent.length })
            }
            case 'list': {
              const entries = await fs.readdir(fullPath, { withFileTypes: true })
              return JSON.stringify(
                entries.slice(0, 100).map((e) => ({
                  name: e.name,
                  type: e.isDirectory() ? 'directory' : 'file',
                })),
              )
            }
            case 'exists': {
              try {
                await fs.access(fullPath)
                return JSON.stringify({ exists: true, path: fsPath })
              } catch {
                return JSON.stringify({ exists: false, path: fsPath })
              }
            }
            default:
              return JSON.stringify({ error: 'Invalid action. Use: read, write, list, exists' })
          }
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'File operation failed',
          })
        }
      }

      case 'git_operations': {
        const gitOp = toolInput.operation as string
        const gitArgs = (toolInput.args as string) ?? ''
        const gitCwd = (toolInput.cwd as string) ?? process.cwd()

        // Security: audit the git command
        const { auditCommand: auditGit } = await import('./sandbox-audit')
        const gitAudit = auditGit(`git ${gitOp} ${gitArgs}`)
        if (gitAudit.verdict === 'block') {
          return JSON.stringify({ error: `Blocked: ${gitAudit.reason}` })
        }

        // Only allow safe git operations
        const safeOps = ['status', 'diff', 'log', 'branch', 'commit', 'checkout', 'add']
        if (!safeOps.includes(gitOp)) {
          return JSON.stringify({
            error: `Unsupported git operation: ${gitOp}. Allowed: ${safeOps.join(', ')}`,
          })
        }

        try {
          const { execSync: gitExec } = await import('child_process')
          const cmd = gitArgs ? `git ${gitOp} ${gitArgs}` : `git ${gitOp}`
          const output = gitExec(cmd, {
            encoding: 'utf8',
            timeout: 30000,
            cwd: gitCwd,
            stdio: ['pipe', 'pipe', 'pipe'],
          }).trim()
          return JSON.stringify({ operation: gitOp, output: output.slice(0, 10000) })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Git operation failed',
          })
        }
      }

      case 'create_ticket': {
        if (!db) return JSON.stringify({ error: 'Database required' })
        const ticketTitle = toolInput.title as string
        const ticketDesc = (toolInput.description as string) ?? null
        const ticketPriority = (toolInput.priority as string) ?? 'medium'
        const ticketAgent = (toolInput.assignedAgentId as string) ?? null
        const ticketProject = (toolInput.projectId as string) ?? null
        const ticketWs = (toolInput.workspaceId as string) ?? workspaceId ?? null

        try {
          const { tickets: ticketsT } = await import('@solarc/db')
          const [created] = await db
            .insert(ticketsT)
            .values({
              title: ticketTitle,
              description: ticketDesc,
              priority: ticketPriority as 'low' | 'medium' | 'high' | 'critical',
              assignedAgentId: ticketAgent,
              projectId: ticketProject,
              workspaceId: ticketWs,
            })
            .returning({ id: ticketsT.id })
          return JSON.stringify({
            ticketId: created?.id,
            title: ticketTitle,
            assigned: ticketAgent,
          })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Ticket creation failed',
          })
        }
      }

      case 'create_project': {
        if (!db) return JSON.stringify({ error: 'Database required' })
        const projName = toolInput.name as string
        const projGoal = toolInput.goal as string

        try {
          const { projects: projectsT } = await import('@solarc/db')
          const [created] = await db
            .insert(projectsT)
            .values({ name: projName, goal: projGoal })
            .returning({ id: projectsT.id })
          return JSON.stringify({ projectId: created?.id, name: projName, goal: projGoal })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Project creation failed',
          })
        }
      }

      case 'assign_ticket': {
        if (!db) return JSON.stringify({ error: 'Database required' })
        const assignTicketId = toolInput.ticketId as string
        const assignAgentId = toolInput.agentId as string

        try {
          const { atomicCheckout } = await import('../platform/atomic-checkout')
          const result = await atomicCheckout(db, assignTicketId, assignAgentId, null)
          return JSON.stringify(result)
        } catch (err) {
          return JSON.stringify({ error: err instanceof Error ? err.message : 'Assignment failed' })
        }
      }

      case 'create_department': {
        if (!db) return JSON.stringify({ error: 'Database required' })
        const deptName = toolInput.name as string
        const deptTemplate = toolInput.template as string | undefined

        try {
          if (deptTemplate) {
            // Use factory smart create for templated departments
            const { brainEntities: beT } = await import('@solarc/db')
            const factory = await import('../mini-brain-factory/factory')
            const f = new factory.MiniBrainFactory()
            const tpl = f.getTemplate(deptTemplate as 'astrology')
            if (!tpl) return JSON.stringify({ error: `Template ${deptTemplate} not found` })

            // Create entity directly
            const [entity] = await db
              .insert(beT)
              .values({
                name: deptName,
                tier: 'mini_brain',
                domain: deptTemplate,
                status: 'active',
              })
              .returning({ id: beT.id })
            return JSON.stringify({
              departmentId: entity?.id,
              name: deptName,
              template: deptTemplate,
            })
          }

          // No template — create empty department
          const { brainEntities: beT2 } = await import('@solarc/db')
          const [entity] = await db
            .insert(beT2)
            .values({ name: deptName, tier: 'mini_brain', status: 'active' })
            .returning({ id: beT2.id })
          return JSON.stringify({ departmentId: entity?.id, name: deptName })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Department creation failed',
          })
        }
      }

      case 'hire_agent': {
        if (!db) return JSON.stringify({ error: 'Database required' })
        const hireName = toolInput.name as string
        const hireDeptId = toolInput.departmentEntityId as string
        const hireRole = (toolInput.role as string) ?? 'specialist'
        const hireSoul = (toolInput.soul as string) ?? `You are ${hireName}, a specialist agent.`
        const hireSkills = (toolInput.skills as string[]) ?? []

        try {
          const { onboardAgent } = await import('../orchestration/agent-lifecycle')
          // Find workspace for this department
          const { brainEntities: beT3 } = await import('@solarc/db')
          const { eq: eqHire } = await import('drizzle-orm')
          const dept = await db.query.brainEntities.findFirst({
            where: eqHire(beT3.id, hireDeptId),
          })
          const deptConfig = (dept?.config ?? {}) as Record<string, unknown>
          const wsId =
            typeof deptConfig.workspaceId === 'string' ? deptConfig.workspaceId : workspaceId

          if (!wsId) return JSON.stringify({ error: 'No workspace found for department' })

          const result = await onboardAgent(db, {
            name: hireName,
            departmentEntityId: hireDeptId,
            role: hireRole as 'primary' | 'specialist' | 'monitor' | 'healer',
            workspaceId: wsId,
            soul: hireSoul,
            skills: hireSkills,
          })
          return JSON.stringify({
            ...result,
            name: hireName,
            department: hireDeptId,
            role: hireRole,
          })
        } catch (err) {
          return JSON.stringify({ error: err instanceof Error ? err.message : 'Hiring failed' })
        }
      }

      case 'set_entity_budget': {
        if (!db) return JSON.stringify({ error: 'Database required' })
        const budgetEntityId = toolInput.entityId as string
        const budgetDaily = toolInput.dailyLimitUsd as number | undefined
        const budgetMonthly = toolInput.monthlyLimitUsd as number | undefined

        try {
          const { TokenLedgerService } = await import('../platform')
          const ledger = new TokenLedgerService(db)
          await ledger.setBudget(budgetEntityId, {
            dailyLimitUsd: budgetDaily,
            monthlyLimitUsd: budgetMonthly,
          })
          return JSON.stringify({
            entityId: budgetEntityId,
            dailyLimitUsd: budgetDaily,
            monthlyLimitUsd: budgetMonthly,
            set: true,
          })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Budget setting failed',
          })
        }
      }

      // ── Design Department Tool Executors ────────────────────────────

      case 'design_review': {
        if (!db) return JSON.stringify({ error: 'Database required for design review' })
        const target = toolInput.target as string
        const designSpec = toolInput.designSpec as string
        const criteria = (toolInput.criteria as string[]) ?? [
          'usability',
          'accessibility',
          'consistency',
          'performance',
          'aesthetics',
        ]

        try {
          const { GatewayRouter: ReviewGW } = await import('../gateway')
          const gw = new ReviewGW(db)
          const result = await gw.chat({
            messages: [
              {
                role: 'system',
                content: `You are a senior design reviewer. Evaluate the following design against these criteria: ${criteria.join(', ')}. For each criterion, rate 1-5 and provide specific, actionable feedback. Format as JSON: {"ratings": {"criterion": {"score": N, "feedback": "..."}}, "overallScore": N, "topIssues": ["..."], "strengths": ["..."]}`,
              },
              {
                role: 'user',
                content: `Target: ${target}\n\nDesign Specification:\n${designSpec}`,
              },
            ],
            temperature: 0.2,
            maxTokens: 2048,
          })
          return result.content
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Design review failed',
          })
        }
      }

      case 'accessibility_audit': {
        const component = toolInput.component as string
        const specification = toolInput.specification as string
        const level = (toolInput.level as string) ?? 'AA'

        if (!db) return JSON.stringify({ error: 'Database required' })

        try {
          const { GatewayRouter: AuditGW } = await import('../gateway')
          const gw = new AuditGW(db)
          const result = await gw.chat({
            messages: [
              {
                role: 'system',
                content: `You are a WCAG 2.1 Level ${level} accessibility auditor. Analyze the component spec and return a structured audit. Check: color contrast (4.5:1 normal, 3:1 large), keyboard navigation, ARIA usage, semantic HTML, focus management, screen reader compatibility. Format as JSON: {"component": "...", "level": "${level}", "issues": [{"criterion": "WCAG X.X.X", "severity": "critical|major|minor", "description": "...", "fix": "..."}], "passes": ["..."], "score": N}`,
              },
              {
                role: 'user',
                content: `Component: ${component}\n\nSpecification:\n${specification}`,
              },
            ],
            temperature: 0.1,
            maxTokens: 2048,
          })
          return result.content
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Accessibility audit failed',
          })
        }
      }

      case 'generate_component_spec': {
        const compName = toolInput.name as string
        const compPurpose = toolInput.purpose as string
        const compVariants = (toolInput.variants as string[]) ?? ['default']
        const compFramework = (toolInput.framework as string) ?? 'react'

        if (!db) return JSON.stringify({ error: 'Database required' })

        try {
          const { GatewayRouter: SpecGW } = await import('../gateway')
          const gw = new SpecGW(db)
          const result = await gw.chat({
            messages: [
              {
                role: 'system',
                content: `You are a design system architect. Generate a complete component specification for a ${compFramework} component. Include:
1. **Purpose**: When to use and when NOT to use
2. **Anatomy**: Visual breakdown of sub-elements
3. **Variants**: ${compVariants.join(', ')} — describe each
4. **States**: default, hover, active, focus, disabled, error, loading
5. **Design Tokens**: Which tokens it uses (colors, spacing, typography, shadows)
6. **Accessibility**: ARIA roles, keyboard behavior, focus management
7. **Responsive**: How it adapts across breakpoints
8. **Code Example**: ${compFramework} component skeleton with TypeScript props interface
9. **Do/Don't**: Usage guidelines with examples

Return as structured markdown.`,
              },
              {
                role: 'user',
                content: `Component: ${compName}\nPurpose: ${compPurpose}\nVariants: ${compVariants.join(', ')}`,
              },
            ],
            temperature: 0.3,
            maxTokens: 4096,
          })
          return result.content
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Spec generation failed',
          })
        }
      }

      case 'generate_design_system': {
        if (!db) return JSON.stringify({ error: 'Database required' })
        const brandName = toolInput.brandName as string
        const personality = toolInput.brandPersonality as string
        const primaryColor = (toolInput.primaryColor as string) ?? 'auto'
        const platform = (toolInput.targetPlatform as string) ?? 'both'
        const darkMode = (toolInput.darkMode as boolean) ?? true

        try {
          const { GatewayRouter: DsGW } = await import('../gateway')
          const gw = new DsGW(db)
          const result = await gw.chat({
            messages: [
              {
                role: 'system',
                content: `You are a design system architect. Generate a complete design system for "${brandName}" (personality: ${personality}).

Output a structured design system document with these sections:

## 1. Color Palette
- Primary: ${primaryColor === 'auto' ? 'Generate based on brand personality' : primaryColor}
- Secondary, accent, neutral, semantic (success, warning, error, info)
- Each color with 50-950 shade scale (like Tailwind)
${darkMode ? '- Dark mode variants for all colors' : ''}
- CSS custom property names: --color-{name}-{shade}

## 2. Typography Scale
- Font families (heading, body, mono)
- Type scale: xs through 6xl with exact px/rem values
- Line heights, letter spacing, font weights
- Platform: ${platform}

## 3. Spacing System
- Base unit (e.g., 4px)
- Scale: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24
- CSS custom properties: --space-{size}

## 4. Border Radius
- none, sm, md, lg, xl, 2xl, full

## 5. Shadows
- sm, md, lg, xl for light mode
${darkMode ? '- Dark mode shadow adjustments' : ''}

## 6. Breakpoints
- sm: 640px, md: 768px, lg: 1024px, xl: 1280px, 2xl: 1536px

## 7. Component Inventory
- List 20 core components this brand needs with brief purpose
- Mark priority: essential, important, nice-to-have

## 8. Usage Guidelines
- Do/Don't for color usage
- Accessibility minimums (contrast ratios)
- Responsive behavior rules

Return as well-structured markdown with code blocks for CSS variables.`,
              },
              {
                role: 'user',
                content: `Brand: ${brandName}\nPersonality: ${personality}\nPrimary: ${primaryColor}\nPlatform: ${platform}`,
              },
            ],
            temperature: 0.3,
            maxTokens: 4096,
          })

          // Auto-save as work product if we have a workspace
          try {
            const { memories: mem } = await import('@solarc/db')
            await db.insert(mem).values({
              key: `design-system:${brandName.toLowerCase().replace(/\s+/g, '-')}`,
              content: result.content,
              tier: 'core',
              factType: 'observation',
              confidence: 0.9,
              proofCount: 1,
              ...(workspaceId ? { workspaceId } : {}),
            })
          } catch {
            // Non-critical — design system still returned
          }

          return result.content
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Design system generation failed',
          })
        }
      }

      case 'map_user_journey': {
        if (!db) return JSON.stringify({ error: 'Database required' })
        const userAction = toolInput.userAction as string
        const productType = toolInput.productType as string
        const userPersona = (toolInput.userPersona as string) ?? 'general user'
        const painPoints = (toolInput.currentPainPoints as string[]) ?? []

        try {
          const { GatewayRouter: JourneyGW } = await import('../gateway')
          const gw = new JourneyGW(db)
          const result = await gw.chat({
            messages: [
              {
                role: 'system',
                content: `You are a UX researcher creating a comprehensive user journey map.

Generate a structured journey map for the user action on a ${productType}.
${painPoints.length > 0 ? `Known pain points to address: ${painPoints.join(', ')}` : ''}

For EACH stage, provide:

## Stage N: [Stage Name]
- **User Goal**: What the user wants to achieve at this point
- **Actions**: What the user does (clicks, types, scrolls)
- **Touchpoints**: What UI elements they interact with
- **Emotion**: 😊 Positive / 😐 Neutral / 😤 Frustrated (with reason)
- **Pain Points**: What could go wrong or frustrate the user
- **Opportunities**: How to delight the user or reduce friction
- **Design Recommendation**: Specific UI/UX suggestion

Include these stages at minimum:
1. **Awareness/Entry** — How user discovers and enters the flow
2. **Onboarding/Orientation** — First-time experience
3. **Core Action** — The main task they're trying to complete
4. **Decision Points** — Where users need to make choices
5. **Completion** — Successfully finishing the action
6. **Error Recovery** — What happens when things go wrong
7. **Post-Completion** — Follow-up engagement and retention

End with:
## Summary
- **Critical Moments**: Top 3 make-or-break moments in the journey
- **Quick Wins**: 3 easy improvements that would have immediate impact
- **Design Principles**: 3 principles this journey should follow

Persona: ${userPersona}`,
              },
              { role: 'user', content: `User Action: ${userAction}\nProduct: ${productType}` },
            ],
            temperature: 0.4,
            maxTokens: 4096,
          })

          return result.content
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Journey mapping failed',
          })
        }
      }

      case 'panel_debate': {
        const topic = toolInput.topic as string
        const perspectives = (toolInput.perspectives as string[]) ?? [
          'optimist',
          'skeptic',
          'pragmatist',
        ]

        if (!db) {
          return JSON.stringify({ error: 'Panel debate requires database access for LLM gateway' })
        }

        try {
          const { GatewayRouter: GW } = await import('../gateway')
          const gw = new GW(db)

          // Spawn parallel "expert" calls
          const perspectiveResults = await Promise.all(
            perspectives.slice(0, 5).map(async (role) => {
              const result = await gw
                .chat({
                  messages: [
                    {
                      role: 'system',
                      content: `You are a ${role} expert analyst. Analyze the given topic from a ${role}'s perspective. Be specific, use evidence-based reasoning, and make a compelling case for your viewpoint. Keep your response under 300 words.`,
                    },
                    {
                      role: 'user',
                      content: `Analyze this topic: ${topic}`,
                    },
                  ],
                })
                .catch((err) => ({
                  content: `[${role} perspective unavailable: ${err instanceof Error ? err.message : 'error'}]`,
                  tokensIn: 0,
                  tokensOut: 0,
                }))
              return { role, argument: result.content }
            }),
          )

          // Synthesis call
          const debateText = perspectiveResults
            .map((p) => `### ${p.role.toUpperCase()}\n${p.argument}`)
            .join('\n\n')

          const synthesisResult = await gw.chat({
            messages: [
              {
                role: 'system',
                content:
                  'You are a balanced moderator. Given multiple expert perspectives on a topic, synthesize a balanced analysis. Identify: 1) Points of consensus, 2) Key disagreements, 3) Your balanced conclusion. Return as JSON: {"synthesis": "...", "consensus": ["..."], "disagreements": ["..."]}',
              },
              {
                role: 'user',
                content: `Topic: ${topic}\n\n${debateText}`,
              },
            ],
          })

          let synthesis = synthesisResult.content
          let consensus: string[] = []
          let disagreements: string[] = []

          try {
            const parsed = JSON.parse(synthesis.replace(/```json\n?/g, '').replace(/```\n?/g, ''))
            synthesis = parsed.synthesis ?? synthesis
            consensus = parsed.consensus ?? []
            disagreements = parsed.disagreements ?? []
          } catch {
            // Use raw synthesis if JSON parsing fails
          }

          return JSON.stringify({
            topic,
            perspectives: perspectiveResults,
            synthesis,
            consensus,
            disagreements,
          })
        } catch (err) {
          return JSON.stringify({
            topic,
            error: err instanceof Error ? err.message : 'Panel debate failed',
          })
        }
      }

      case 'extract_metadata': {
        const metaUrl = toolInput.url as string
        try {
          const res = await fetch(metaUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SolarcBrain/2.0)' },
            signal: AbortSignal.timeout(10000),
            redirect: 'follow',
          })
          const html = await res.text()

          // Standard meta tags
          const getMetaContent = (nameOrProp: string): string | null => {
            const escaped = nameOrProp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const byName = html.match(
              new RegExp(`<meta[^>]*name=["']${escaped}["'][^>]*content=["']([^"']*?)["']`, 'i'),
            )
            const byProp = html.match(
              new RegExp(
                `<meta[^>]*property=["']${escaped}["'][^>]*content=["']([^"']*?)["']`,
                'i',
              ),
            )
            // Also match content before name/property attribute
            const byNameRev = html.match(
              new RegExp(`<meta[^>]*content=["']([^"']*?)["'][^>]*name=["']${escaped}["']`, 'i'),
            )
            const byPropRev = html.match(
              new RegExp(
                `<meta[^>]*content=["']([^"']*?)["'][^>]*property=["']${escaped}["']`,
                'i',
              ),
            )
            return byName?.[1] ?? byProp?.[1] ?? byNameRev?.[1] ?? byPropRev?.[1] ?? null
          }

          const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null
          const canonical =
            html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*?)["']/i)?.[1] ?? null

          // Open Graph
          const og = {
            title: getMetaContent('og:title'),
            description: getMetaContent('og:description'),
            image: getMetaContent('og:image'),
            type: getMetaContent('og:type'),
            siteName: getMetaContent('og:site_name'),
            url: getMetaContent('og:url'),
          }

          // Twitter Card
          const twitter = {
            card: getMetaContent('twitter:card'),
            title: getMetaContent('twitter:title'),
            description: getMetaContent('twitter:description'),
            image: getMetaContent('twitter:image'),
            creator: getMetaContent('twitter:creator'),
          }

          // JSON-LD structured data
          const jsonLdMatches = html.matchAll(
            /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
          )
          const jsonLd: unknown[] = []
          for (const jm of jsonLdMatches) {
            try {
              jsonLd.push(JSON.parse(jm[1]!))
            } catch {
              // Skip invalid JSON-LD
            }
          }

          return JSON.stringify({
            url: metaUrl,
            title,
            description: getMetaContent('description'),
            author: getMetaContent('author'),
            date:
              getMetaContent('article:published_time') ??
              getMetaContent('date') ??
              html.match(/<time[^>]*datetime=["']([^"']*?)["']/i)?.[1] ??
              null,
            canonical,
            openGraph: og,
            twitter,
            jsonLd: jsonLd.length > 0 ? jsonLd : null,
            favicon:
              html.match(
                /<link[^>]*rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']*?)["']/i,
              )?.[1] ?? null,
          })
        } catch (err) {
          return JSON.stringify({
            url: metaUrl,
            error: err instanceof Error ? err.message : 'Metadata extraction failed',
          })
        }
      }

      case 'agent_evolve': {
        if (!db) return JSON.stringify({ error: 'Database required for agent evolution' })
        const targetAgentId = toolInput.agentId as string
        const windowDays = (toolInput.windowDays as number) ?? 7
        try {
          const { evolveAgent } = await import('../evolution')
          const result = await evolveAgent(db, targetAgentId, { windowDays })
          return JSON.stringify(result)
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Evolution failed',
          })
        }
      }

      case 'agent_rollback': {
        if (!db) return JSON.stringify({ error: 'Database required for agent rollback' })
        const rbAgentId = toolInput.agentId as string
        const rbVersion = toolInput.version as number
        try {
          const { rollbackToVersion } = await import('../evolution')
          const result = await rollbackToVersion(db, rbAgentId, rbVersion)
          return JSON.stringify(result)
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Rollback failed',
          })
        }
      }

      case 'agent_analyze': {
        if (!db) return JSON.stringify({ error: 'Database required for agent analysis' })
        const analyzeId = toolInput.agentId as string
        const analyzeWindow = (toolInput.windowDays as number) ?? 7
        try {
          const { analyzeAgentPerformance } = await import('../evolution')
          const result = await analyzeAgentPerformance(db, analyzeId, analyzeWindow)
          if (!result) return JSON.stringify({ error: `Agent ${analyzeId} not found` })
          return JSON.stringify(result)
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Analysis failed',
          })
        }
      }

      case 'agent_evolution_history': {
        if (!db) return JSON.stringify({ error: 'Database required for evolution history' })
        const histAgentId = toolInput.agentId as string
        const histLimit = (toolInput.limit as number) ?? 10
        try {
          const { getEvolutionHistory } = await import('../evolution')
          const result = await getEvolutionHistory(db, histAgentId, histLimit)
          return JSON.stringify({
            agentId: histAgentId,
            totalCycles: result.cycles.length,
            totalVersions: result.versions.length,
            cycles: result.cycles,
            versions: result.versions.map((v) => ({
              id: v.id,
              version: v.version,
              isActive: v.isActive,
              avgQualityScore: v.avgQualityScore,
              successRate: v.successRate,
              totalRuns: v.totalRuns,
              mutationSummary: v.mutationSummary,
              createdAt: v.createdAt,
            })),
          })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'History fetch failed',
          })
        }
      }

      case 'verify_claim': {
        const claim = toolInput.claim as string
        const command = toolInput.command as string
        const successPattern = toolInput.successPattern as string | undefined

        // Sandbox audit — classify command before execution
        const audit = auditCommand(command)
        if (audit.verdict === 'block') {
          return JSON.stringify({
            verified: false,
            claim,
            error: `Command blocked by sandbox audit: ${audit.reason}`,
          })
        }

        try {
          const { execSync } = await import('child_process')
          const output = execSync(command, {
            encoding: 'utf8',
            timeout: 60000,
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: process.cwd(),
          }).trim()

          let verified = true
          let reason = 'Command executed successfully (exit code 0)'

          // Check success pattern if provided
          if (successPattern) {
            const regex = new RegExp(successPattern, 'i')
            if (!regex.test(output)) {
              verified = false
              reason = `Output does not match expected pattern: ${successPattern}`
            }
          }

          // Check for common failure indicators
          const failureIndicators = /\b(FAIL|ERROR|FAILED|failing|exception|panic)\b/i
          if (verified && failureIndicators.test(output)) {
            verified = false
            reason = 'Output contains failure indicators'
          }

          return JSON.stringify({
            verified,
            claim,
            reason,
            evidence: output.slice(0, 3000),
          })
        } catch (err: unknown) {
          const execErr = err as { status?: number; stderr?: string; stdout?: string }
          return JSON.stringify({
            verified: false,
            claim,
            reason: `Command failed with exit code ${execErr.status ?? 'unknown'}`,
            evidence: (execErr.stderr ?? execErr.stdout ?? '').slice(0, 3000),
          })
        }
      }

      // compact_context case removed — compaction is automatic in chat pipeline

      case 'memory_smart_add': {
        if (!db) return JSON.stringify({ error: 'Database required for smart memory' })
        const msgs = toolInput.messages as Array<{ role: string; content: string }>
        const wsId = toolInput.workspaceId as string | undefined
        try {
          const { GatewayRouter: GW } = await import('../gateway')
          const gw = new GW(db)
          const { smartMemoryAdd } = await import('../memory')
          const result = await smartMemoryAdd(db, gw, msgs, {
            workspaceId: wsId ?? workspaceId,
          })
          return JSON.stringify({
            factsExtracted: result.extracted.length,
            decisions: result.decisions.map((d) => ({
              action: d.action,
              fact: d.fact,
              existingMemory: d.existingMemoryText ?? null,
              reason: d.reason,
            })),
            summary: {
              added: result.added,
              updated: result.updated,
              deleted: result.deleted,
              unchanged: result.unchanged,
            },
          })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Smart memory add failed',
          })
        }
      }

      case 'memory_consolidate': {
        if (!db) return JSON.stringify({ error: 'Database required for consolidation' })
        const consWsId = (toolInput.workspaceId as string) ?? workspaceId
        const consLimit = (toolInput.limit as number) ?? 50
        try {
          const { GatewayRouter: GW } = await import('../gateway')
          const gw = new GW(db)
          const { consolidateMemories } = await import('../memory')
          const result = await consolidateMemories(db, gw, {
            workspaceId: consWsId,
            limit: consLimit,
          })
          return JSON.stringify({
            ...result,
            summary: `Processed ${result.factsProcessed} raw facts → ${result.observationsCreated} new observations, ${result.observationsUpdated} updated, ${result.observationsDeleted} removed`,
          })
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Consolidation failed',
          })
        }
      }

      case 'session_summary': {
        if (!db) return JSON.stringify({ error: 'Database required for session summary' })
        const sumSessionId = toolInput.sessionId as string
        try {
          const { GatewayRouter: GW } = await import('../gateway')
          const gw = new GW(db)
          const { generateSessionSummary } = await import('../intelligence/session-intelligence')
          const result = await generateSessionSummary(db, gw, sumSessionId)
          return JSON.stringify(result)
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Session summary failed',
          })
        }
      }

      case 'recommend_model': {
        if (!db) return JSON.stringify({ error: 'Database required for model recommendation' })
        const rmAgentId = toolInput.agentId as string
        try {
          const { recommendModel } = await import('../intelligence/adaptive-router')
          const result = await recommendModel(db, rmAgentId)
          return JSON.stringify(result)
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Model recommendation failed',
          })
        }
      }

      case 'agent_capabilities': {
        if (!db) return JSON.stringify({ error: 'Database required for capability profiling' })
        const capAgentId = toolInput.agentId as string
        try {
          const { profileAgentCapabilities } = await import('../intelligence/adaptive-router')
          const result = await profileAgentCapabilities(db, capAgentId)
          if (!result) return JSON.stringify({ error: `Agent ${capAgentId} not found` })
          return JSON.stringify(result)
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Capability profiling failed',
          })
        }
      }

      case 'tool_analytics': {
        const analyticsWs = (toolInput.workspaceId as string) ?? workspaceId
        const analytics = getToolAnalytics(analyticsWs)
        const failing = analytics.filter((a) => a.totalCalls >= 3 && a.successRate < 0.5)
        const unused = AGENT_TOOLS.map((t) => t.name).filter(
          (name) => !analytics.some((a) => a.tool === name),
        )
        return JSON.stringify({
          tools: analytics,
          insights: {
            totalTools: AGENT_TOOLS.length,
            usedTools: analytics.length,
            unusedTools: unused.length,
            failingTools: failing.map(
              (f) =>
                `${f.tool}: ${(f.successRate * 100).toFixed(0)}% success (${f.totalCalls} calls)`,
            ),
            unusedToolNames: unused.slice(0, 20),
          },
        })
      }

      case 'auto_evolve_all': {
        if (!db) return JSON.stringify({ error: 'Database required for auto-evolution' })
        const threshold = (toolInput.scoreThreshold as number) ?? 0.6
        const maxAgents = (toolInput.maxAgents as number) ?? 5
        try {
          const { runAutoEvolution } = await import('../evolution')
          const result = await runAutoEvolution(db, {
            scoreThreshold: threshold,
            maxAgentsPerRun: maxAgents,
          })
          return JSON.stringify(result)
        } catch (err) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : 'Auto-evolution failed',
          })
        }
      }

      default:
        return `Unknown tool: ${toolName}`
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: `Tool execution failed: ${message}` })
  }
}
