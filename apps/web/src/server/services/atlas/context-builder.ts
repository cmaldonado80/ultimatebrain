/**
 * ATLAS Context Builder — builds compact, role-aware context strings
 * for agent system prompts. Parses tagged sections from ATLAS.md and
 * returns only the sections relevant to each agent's role.
 */

import * as fs from 'fs'
import * as path from 'path'

interface AgentProfile {
  agentType?: string // executor, planner, reviewer, specialist
  capability?: string // coder, reasoning, agentic, flash, vision, guard, judge, router, embedding
  workspaceType?: string // general, development, staging, system
  skills?: string[]
}

/** Cached singleton — loaded once, reused across requests */
let cachedSections: Map<string, string> | null = null

/**
 * Parse ATLAS.md into tagged sections.
 * Sections are delimited by `<!-- @section:name -->` and `<!-- @end -->`.
 */
function parseSections(content: string): Map<string, string> {
  const sections = new Map<string, string>()
  const sectionRegex = /<!-- @section:(\w+) -->\n([\s\S]*?)<!-- @end -->/g

  let match: RegExpExecArray | null
  while ((match = sectionRegex.exec(content)) !== null) {
    const [, name, body] = match
    if (name && body) {
      sections.set(name, body.trim())
    }
  }

  return sections
}

/**
 * Load and parse ATLAS.md. Caches after first read.
 */
function loadSections(): Map<string, string> {
  if (cachedSections) return cachedSections

  const atlasPath = path.join(__dirname, 'ATLAS.md')
  try {
    const content = fs.readFileSync(atlasPath, 'utf-8')
    cachedSections = parseSections(content)
  } catch {
    console.warn('[ATLAS] Could not read ATLAS.md — context injection disabled')
    cachedSections = new Map()
  }

  return cachedSections
}

/** Map agent capabilities/types to relevant ATLAS sections */
const SECTION_RULES: Record<string, string[]> = {
  // Capability-based
  coder: ['coder'],
  reasoning: ['planner'],
  agentic: ['planner', 'coder'],
  flash: [],
  vision: ['multimodal'],
  multimodal: ['multimodal'],
  guard: ['reviewer'],
  judge: ['reviewer'],
  router: [],
  embedding: [],

  // Agent type-based
  executor: ['coder'],
  planner: ['planner'],
  reviewer: ['reviewer'],
  specialist: ['coder'],

  // Workspace type-based (prefixed with ws:)
  'ws:system': ['ops'],
  'ws:development': ['dev'],
  'ws:staging': ['ops'],
  'ws:general': [],
}

/**
 * Build a context string for a specific agent based on its profile.
 *
 * Every agent gets: stack, structure, conventions, anti-hallucination.
 * Additional sections are added based on capability, type, and workspace.
 */
export function buildAtlasContext(profile: AgentProfile): string {
  const sections = loadSections()
  if (sections.size === 0) return ''

  // Base sections every agent gets
  const selectedNames = new Set(['stack', 'structure', 'conventions', 'anti-hallucination'])

  // Add sections based on capability
  if (profile.capability) {
    const extra = SECTION_RULES[profile.capability]
    if (extra) extra.forEach((s) => selectedNames.add(s))
  }

  // Add sections based on agent type
  if (profile.agentType) {
    const extra = SECTION_RULES[profile.agentType]
    if (extra) extra.forEach((s) => selectedNames.add(s))
  }

  // Add sections based on workspace type
  if (profile.workspaceType) {
    const extra = SECTION_RULES[`ws:${profile.workspaceType}`]
    if (extra) extra.forEach((s) => selectedNames.add(s))
  }

  // Collect section contents
  const parts: string[] = []
  for (const name of selectedNames) {
    const content = sections.get(name)
    if (content) parts.push(content)
  }

  if (parts.length === 0) return ''

  return '\n\n---\n[ATLAS Context — Project Architecture]\n' + parts.join('\n\n') + '\n---\n'
}

/**
 * Invalidate the cached sections (useful for tests or after ATLAS.md updates).
 */
export function invalidateAtlasCache(): void {
  cachedSections = null
}
