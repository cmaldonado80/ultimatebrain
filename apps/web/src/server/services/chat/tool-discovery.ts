/**
 * Self-Documenting Tool Discovery
 *
 * Stolen from n8n-MCP's tools_documentation pattern.
 * Agents can discover available tools, their tiers, capabilities,
 * and usage patterns at runtime instead of guessing.
 */

import { classifyTool, getTierSummary, getToolsByTier, type ToolTier } from './tool-tiers'

// ── Types ────────────────────────────────────────────────────────────────

export interface ToolDoc {
  name: string
  tier: ToolTier
  destructive: boolean
  networkAccess: boolean
  fileAccess: boolean
  dryRunnable: boolean
  description: string
}

export interface ToolDiscoveryResult {
  totalTools: number
  tierSummary: Record<ToolTier, number>
  tools: ToolDoc[]
}

// ── Tool Descriptions ────────────────────────────────────────────────────
// Human-readable descriptions for agent consumption.

const TOOL_DESCRIPTIONS: Record<string, string> = {
  // Safe
  ephemeris_natal_chart: 'Calculate natal birth chart with planetary positions',
  ephemeris_current_transits: 'Get current planetary transits',
  ephemeris_synastry: 'Compare two birth charts for relationship analysis',
  ephemeris_solar_return: 'Calculate solar return chart for a given year',
  ephemeris_transit_calendar: 'Generate transit calendar for a date range',
  ephemeris_moon_phase: 'Get current moon phase and illumination',
  ephemeris_houses: 'Calculate house cusps for given coordinates',
  ephemeris_annual_profections: 'Calculate annual profections',
  ephemeris_panchanga: 'Calculate Vedic panchanga (Hindu calendar)',
  ephemeris_vimshottari_dasha: 'Calculate Vimshottari dasha periods',
  ephemeris_secondary_progressions: 'Calculate secondary progressions',
  ephemeris_arabic_parts: 'Calculate Arabic/Lot parts',
  ephemeris_aspect_patterns: 'Find aspect patterns (T-square, Grand Trine, etc.)',
  ephemeris_firdaria: 'Calculate firdaria planetary periods',
  ephemeris_fixed_stars: 'Calculate positions of major fixed stars',
  ephemeris_fixed_star_conjunctions: 'Find conjunctions between planets and fixed stars',
  ephemeris_dispositor_chain: 'Calculate planetary dispositor chain',
  ephemeris_midpoints: 'Calculate all planetary midpoints',
  ephemeris_lunar_return: 'Calculate lunar return chart',
  ephemeris_medical: 'Medical astrology analysis',
  ephemeris_natal_report: 'Generate comprehensive natal chart report',
  memory_search: 'Search stored memories by query',
  file_read: 'Read file contents (read-only)',
  file_list: 'List files in a directory (read-only)',
  file_exists: 'Check if a file exists (read-only)',

  // Privileged
  memory_store: 'Store a new memory entry',
  web_search: 'Search the web via DuckDuckGo',
  web_scrape: 'Fetch and parse a web page',
  deep_research: 'Multi-step deep research on a topic',
  file_write: 'Write content to a file (DESTRUCTIVE)',
  db_query: 'Execute a database query',
  create_ticket: 'Create a new work ticket',
  create_project: 'Create a new project',
  vision_analyze: 'Analyze an image with AI vision',
  workflow_execute: 'Execute a DAG workflow',
  notion_create_page: 'Create a Notion page',
  notion_update_page: 'Update a Notion page (DESTRUCTIVE)',
  slack_send_message: 'Send a Slack message',
  git_operations: 'Execute git operations (DESTRUCTIVE)',
  render_preview: 'Render HTML to screenshot',

  // Raw
  docker_manage: 'Manage Docker containers (ADMIN)',
  shell_exec: 'Execute shell commands (ADMIN)',
  run_tests: 'Run test suite (ADMIN)',
}

// ── Discovery API ────────────────────────────────────────────────────────

/**
 * Discover all available tools with their classifications.
 */
export function discoverTools(options?: {
  tier?: ToolTier
  destructiveOnly?: boolean
  networkOnly?: boolean
}): ToolDiscoveryResult {
  const tiers: ToolTier[] = options?.tier ? [options.tier] : ['safe', 'privileged', 'raw']

  const tools: ToolDoc[] = []
  for (const tier of tiers) {
    for (const name of getToolsByTier(tier)) {
      const classification = classifyTool(name)

      if (options?.destructiveOnly && !classification.destructive) continue
      if (options?.networkOnly && !classification.networkAccess) continue

      tools.push({
        name,
        tier: classification.tier,
        destructive: classification.destructive,
        networkAccess: classification.networkAccess,
        fileAccess: classification.fileAccess,
        dryRunnable: classification.dryRunnable,
        description: TOOL_DESCRIPTIONS[name] ?? `Execute ${name}`,
      })
    }
  }

  return {
    totalTools: tools.length,
    tierSummary: getTierSummary(),
    tools,
  }
}

/**
 * Get documentation for a specific tool.
 */
export function getToolDoc(toolName: string): ToolDoc | null {
  const classification = classifyTool(toolName)
  if (!TOOL_DESCRIPTIONS[toolName] && classification.tier === 'privileged') {
    // Unknown tool — return generic info
    return {
      name: toolName,
      ...classification,
      description: `Execute ${toolName} (unclassified tool)`,
    }
  }

  if (!TOOL_DESCRIPTIONS[toolName]) return null

  return {
    name: toolName,
    ...classification,
    description: TOOL_DESCRIPTIONS[toolName],
  }
}
