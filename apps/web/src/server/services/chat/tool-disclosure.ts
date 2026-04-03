/**
 * Progressive Disclosure for Tool Responses
 *
 * Stolen from n8n-MCP's progressive detail levels.
 * Instead of dumping everything, tools return minimal info by default
 * and expand on request. Saves tokens and reduces agent confusion.
 *
 * Detail levels:
 *   minimal  → ~200 tokens: just the answer, no metadata
 *   standard → ~1KB: answer + key context (DEFAULT)
 *   full     → unlimited: everything including raw data, debug info
 */

// ── Types ────────────────────────────────────────────────────────────────

export type DetailLevel = 'minimal' | 'standard' | 'full'

export interface DisclosureOptions {
  detail?: DetailLevel
  includeMetadata?: boolean
  maxOutputChars?: number
}

// ── Limits per level ─────────────────────────────────────────────────────

const LEVEL_LIMITS: Record<DetailLevel, { maxChars: number; includeMetadata: boolean }> = {
  minimal: { maxChars: 800, includeMetadata: false },
  standard: { maxChars: 4000, includeMetadata: true },
  full: { maxChars: Infinity, includeMetadata: true },
}

// ── Response Shaping ─────────────────────────────────────────────────────

/**
 * Shape a tool response based on the requested detail level.
 */
export function shapeResponse<T>(
  data: T,
  options: DisclosureOptions = {},
): { data: T | string; detail: DetailLevel; truncated: boolean } {
  const detail = options.detail ?? 'standard'
  const limits = LEVEL_LIMITS[detail]
  const maxChars = options.maxOutputChars ?? limits.maxChars

  // Strip metadata at minimal level
  const shaped = typeof data !== 'string' && !limits.includeMetadata ? stripMetadata(data) : data

  let serialized: string
  if (typeof shaped === 'string') {
    serialized = shaped
  } else {
    serialized = JSON.stringify(shaped)
  }

  // Truncate if needed
  if (serialized.length > maxChars) {
    const truncated = serialized.slice(0, maxChars)
    const lastBrace = Math.max(truncated.lastIndexOf('}'), truncated.lastIndexOf(']'))
    const cutPoint = lastBrace > maxChars * 0.8 ? lastBrace + 1 : maxChars
    const result = serialized.slice(0, cutPoint)

    return {
      data: (typeof shaped === 'string'
        ? result + '\n[TRUNCATED — request detail:"full" for complete output]'
        : result) as T | string,
      detail,
      truncated: true,
    }
  }

  return { data: shaped as T, detail, truncated: false }
}

/**
 * Strip metadata/debug fields from an object for minimal responses.
 */
function stripMetadata<T>(data: T): T {
  if (data === null || data === undefined || typeof data !== 'object') return data
  if (Array.isArray(data)) {
    return data.map((item) => stripMetadata(item)) as T
  }

  const METADATA_KEYS = new Set([
    '_debug',
    '_meta',
    '_trace',
    '_internal',
    '_raw',
    'debugInfo',
    'traceId',
    'requestId',
    'latencyMs',
    'rawResponse',
    'headers',
    'stackTrace',
    'timestamps',
  ])

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (METADATA_KEYS.has(key)) continue
    result[key] = value
  }
  return result as T
}

/**
 * Extract the detail level from tool input (convention: _detail field).
 */
export function extractDetailLevel(toolInput: Record<string, unknown>): DetailLevel {
  const raw = toolInput._detail ?? toolInput.detail
  if (raw === 'minimal' || raw === 'standard' || raw === 'full') return raw
  return 'standard'
}
