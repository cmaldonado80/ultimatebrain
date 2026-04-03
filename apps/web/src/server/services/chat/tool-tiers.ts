/**
 * 3-Tier Tool Classification
 *
 * Stolen from Larksuite CLI's 3-layer command architecture.
 * Tools are classified into tiers based on risk level:
 *
 *   Tier 1 (Safe)       → Any agent can use, no approval needed
 *   Tier 2 (Privileged) → Requires policy check, logged with warnings
 *   Tier 3 (Raw/Admin)  → Requires explicit approval or admin role
 *
 * The tier determines:
 * - Whether sandbox policy check is needed
 * - Whether dry-run mode is enforced
 * - Whether the action is logged as a warning
 * - Whether human approval is required
 */

// ── Types ────────────────────────────────────────────────────────────────

export type ToolTier = 'safe' | 'privileged' | 'raw'

export interface ToolClassification {
  tier: ToolTier
  destructive: boolean // can delete/modify data irreversibly
  networkAccess: boolean // makes external HTTP calls
  fileAccess: boolean // reads/writes filesystem
  dryRunnable: boolean // supports preview mode
}

// ── Classification Registry ──────────────────────────────────────────────

const TOOL_CLASSIFICATIONS: Record<string, ToolClassification> = {
  // ── Tier 1: Safe (read-only, compute-only, no side effects) ────────
  ephemeris_natal_chart: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  ephemeris_current_transits: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  ephemeris_synastry: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  ephemeris_solar_return: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  ephemeris_transit_calendar: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  ephemeris_moon_phase: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  ephemeris_houses: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  ephemeris_annual_profections: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  ephemeris_panchanga: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  ephemeris_vimshottari_dasha: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  ephemeris_secondary_progressions: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  ephemeris_arabic_parts: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  ephemeris_aspect_patterns: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  ephemeris_firdaria: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  ephemeris_fixed_stars: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  ephemeris_fixed_star_conjunctions: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  ephemeris_dispositor_chain: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  ephemeris_midpoints: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  ephemeris_lunar_return: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  ephemeris_medical: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  ephemeris_natal_report: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  memory_search: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: false,
  },
  file_read: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: true,
    dryRunnable: false,
  },
  file_list: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: true,
    dryRunnable: false,
  },
  file_exists: {
    tier: 'safe',
    destructive: false,
    networkAccess: false,
    fileAccess: true,
    dryRunnable: false,
  },

  // ── Tier 2: Privileged (writes data, external calls, logged) ───────
  memory_store: {
    tier: 'privileged',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: true,
  },
  web_search: {
    tier: 'privileged',
    destructive: false,
    networkAccess: true,
    fileAccess: false,
    dryRunnable: false,
  },
  web_scrape: {
    tier: 'privileged',
    destructive: false,
    networkAccess: true,
    fileAccess: false,
    dryRunnable: false,
  },
  deep_research: {
    tier: 'privileged',
    destructive: false,
    networkAccess: true,
    fileAccess: false,
    dryRunnable: false,
  },
  file_write: {
    tier: 'privileged',
    destructive: true,
    networkAccess: false,
    fileAccess: true,
    dryRunnable: true,
  },
  db_query: {
    tier: 'privileged',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: true,
  },
  create_ticket: {
    tier: 'privileged',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: true,
  },
  create_project: {
    tier: 'privileged',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: true,
  },
  vision_analyze: {
    tier: 'privileged',
    destructive: false,
    networkAccess: true,
    fileAccess: false,
    dryRunnable: false,
  },
  workflow_execute: {
    tier: 'privileged',
    destructive: false,
    networkAccess: false,
    fileAccess: false,
    dryRunnable: true,
  },
  notion_create_page: {
    tier: 'privileged',
    destructive: false,
    networkAccess: true,
    fileAccess: false,
    dryRunnable: true,
  },
  notion_update_page: {
    tier: 'privileged',
    destructive: true,
    networkAccess: true,
    fileAccess: false,
    dryRunnable: true,
  },
  slack_send_message: {
    tier: 'privileged',
    destructive: false,
    networkAccess: true,
    fileAccess: false,
    dryRunnable: true,
  },
  git_operations: {
    tier: 'privileged',
    destructive: true,
    networkAccess: true,
    fileAccess: true,
    dryRunnable: true,
  },
  render_preview: {
    tier: 'privileged',
    destructive: false,
    networkAccess: false,
    fileAccess: true,
    dryRunnable: false,
  },

  // ── Tier 3: Raw/Admin (dangerous, requires approval) ───────────────
  docker_manage: {
    tier: 'raw',
    destructive: true,
    networkAccess: true,
    fileAccess: true,
    dryRunnable: true,
  },
  shell_exec: {
    tier: 'raw',
    destructive: true,
    networkAccess: true,
    fileAccess: true,
    dryRunnable: true,
  },
  run_tests: {
    tier: 'raw',
    destructive: false,
    networkAccess: false,
    fileAccess: true,
    dryRunnable: true,
  },
}

// ── Default for unknown tools ────────────────────────────────────────────

const DEFAULT_CLASSIFICATION: ToolClassification = {
  tier: 'privileged',
  destructive: false,
  networkAccess: false,
  fileAccess: false,
  dryRunnable: false,
}

// ── API ──────────────────────────────────────────────────────────────────

/**
 * Get the classification for a tool.
 */
export function classifyTool(toolName: string): ToolClassification {
  return TOOL_CLASSIFICATIONS[toolName] ?? DEFAULT_CLASSIFICATION
}

/**
 * Check if a tool requires policy enforcement.
 */
export function requiresPolicyCheck(toolName: string): boolean {
  const tier = classifyTool(toolName).tier
  return tier === 'privileged' || tier === 'raw'
}

/**
 * Check if a tool supports dry-run preview.
 */
export function supportsDryRun(toolName: string): boolean {
  return classifyTool(toolName).dryRunnable
}

/**
 * Check if a tool is destructive (can modify/delete data irreversibly).
 */
export function isDestructive(toolName: string): boolean {
  return classifyTool(toolName).destructive
}

/**
 * Check if a tool requires admin-level approval.
 */
export function requiresApproval(toolName: string): boolean {
  return classifyTool(toolName).tier === 'raw'
}

/**
 * Get all tools by tier.
 */
export function getToolsByTier(tier: ToolTier): string[] {
  return Object.entries(TOOL_CLASSIFICATIONS)
    .filter(([, c]) => c.tier === tier)
    .map(([name]) => name)
}

/**
 * Get classification summary.
 */
export function getTierSummary(): Record<ToolTier, number> {
  const counts: Record<ToolTier, number> = { safe: 0, privileged: 0, raw: 0 }
  for (const c of Object.values(TOOL_CLASSIFICATIONS)) {
    counts[c.tier]++
  }
  return counts
}
