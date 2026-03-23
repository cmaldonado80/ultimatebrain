/**
 * Skill Marketplace
 *
 * Fetches, browses, and installs skills from multiple sources:
 * - OpenClaw's 67 built-in skills
 * - SkillsMP API (community marketplace)
 * - Custom skill repos (Git URLs)
 *
 * Manages installation, per-agent assignment, and usage tracking
 * via the `skills_marketplace` table.
 */

import type { Database } from '@solarc/db'
import { skillsMarketplace } from '@solarc/db'
import { eq } from 'drizzle-orm'

export type SkillCategory = 'productivity' | 'coding' | 'media' | 'data' | 'integrations' | 'other'

export type SkillSource = 'openclaw' | 'skillsmp' | 'custom'

export interface SkillListing {
  id: string
  name: string
  description: string
  author: string
  category: SkillCategory
  source: SkillSource
  sourceUrl: string
  version: string
  installCount: number
  rating: number
  /** Capabilities the skill requests */
  permissions: SkillPermission[]
  /** Whether already installed locally */
  installed: boolean
  /** Agents this skill is assigned to (if installed) */
  assignedAgents?: string[]
  /** Usage stats (if installed) */
  usageStats?: { totalRuns: number; lastUsed?: Date; avgDurationMs: number }
}

export type SkillCapability =
  | 'file:read'
  | 'file:write'
  | 'network:fetch'
  | 'network:websocket'
  | 'browser:navigate'
  | 'browser:screenshot'
  | 'shell:execute'
  | 'db:read'
  | 'llm:invoke'

export interface SkillPermission {
  capability: SkillCapability
  reason: string
}

export interface InstalledSkill {
  id: string
  name: string
  sourceUrl: string | null
  version: string | null
  installed: boolean
  config: SkillConfig | null
  createdAt: Date
}

export interface SkillConfig {
  permissions: SkillPermission[]
  assignedAgents: string[]
  enabled: boolean
  category: SkillCategory
  author: string
  description: string
  usageStats: { totalRuns: number; lastUsed?: string; avgDurationMs: number }
}

// ── Built-in OpenClaw Skills (sample) ───────────────────────────────────

const OPENCLAW_SKILLS: Omit<SkillListing, 'installed' | 'assignedAgents' | 'usageStats'>[] = [
  { id: 'oc-web-search', name: 'Web Search', description: 'Search the web and extract structured results', author: 'OpenClaw', category: 'data', source: 'openclaw', sourceUrl: 'openclaw://skills/web-search', version: '1.2.0', installCount: 4520, rating: 4.7, permissions: [{ capability: 'network:fetch', reason: 'Fetch search results from web' }] },
  { id: 'oc-code-review', name: 'Code Review', description: 'Analyze code diffs for bugs, security issues, and style', author: 'OpenClaw', category: 'coding', source: 'openclaw', sourceUrl: 'openclaw://skills/code-review', version: '2.0.1', installCount: 3890, rating: 4.8, permissions: [{ capability: 'file:read', reason: 'Read source files' }, { capability: 'llm:invoke', reason: 'LLM analysis of code' }] },
  { id: 'oc-screenshot', name: 'Screenshot Capture', description: 'Take screenshots of web pages and annotate them', author: 'OpenClaw', category: 'media', source: 'openclaw', sourceUrl: 'openclaw://skills/screenshot', version: '1.0.3', installCount: 2100, rating: 4.3, permissions: [{ capability: 'browser:navigate', reason: 'Navigate to target page' }, { capability: 'browser:screenshot', reason: 'Capture screenshot' }] },
  { id: 'oc-csv-transform', name: 'CSV Transform', description: 'Parse, filter, and transform CSV/Excel data', author: 'OpenClaw', category: 'data', source: 'openclaw', sourceUrl: 'openclaw://skills/csv-transform', version: '1.1.0', installCount: 1750, rating: 4.5, permissions: [{ capability: 'file:read', reason: 'Read input files' }, { capability: 'file:write', reason: 'Write transformed output' }] },
  { id: 'oc-slack-notify', name: 'Slack Notify', description: 'Send formatted messages and alerts to Slack channels', author: 'OpenClaw', category: 'integrations', source: 'openclaw', sourceUrl: 'openclaw://skills/slack-notify', version: '1.3.2', installCount: 3200, rating: 4.6, permissions: [{ capability: 'network:fetch', reason: 'Send webhook requests' }] },
  { id: 'oc-git-ops', name: 'Git Operations', description: 'Clone, branch, commit, and push to Git repositories', author: 'OpenClaw', category: 'coding', source: 'openclaw', sourceUrl: 'openclaw://skills/git-ops', version: '2.1.0', installCount: 2900, rating: 4.4, permissions: [{ capability: 'shell:execute', reason: 'Run git commands' }, { capability: 'file:read', reason: 'Read repo files' }, { capability: 'file:write', reason: 'Write changes' }] },
  { id: 'oc-email-draft', name: 'Email Drafting', description: 'Draft professional emails with tone and context awareness', author: 'OpenClaw', category: 'productivity', source: 'openclaw', sourceUrl: 'openclaw://skills/email-draft', version: '1.0.0', installCount: 1200, rating: 4.2, permissions: [{ capability: 'llm:invoke', reason: 'Generate email content' }] },
  { id: 'oc-pdf-extract', name: 'PDF Extract', description: 'Extract text, tables, and images from PDF documents', author: 'OpenClaw', category: 'data', source: 'openclaw', sourceUrl: 'openclaw://skills/pdf-extract', version: '1.4.1', installCount: 2650, rating: 4.6, permissions: [{ capability: 'file:read', reason: 'Read PDF files' }] },
  { id: 'oc-api-test', name: 'API Tester', description: 'Test REST and GraphQL APIs with assertions', author: 'OpenClaw', category: 'coding', source: 'openclaw', sourceUrl: 'openclaw://skills/api-test', version: '1.2.0', installCount: 1800, rating: 4.3, permissions: [{ capability: 'network:fetch', reason: 'Make API requests' }] },
  { id: 'oc-summarize', name: 'Text Summarizer', description: 'Summarize long documents, articles, and threads', author: 'OpenClaw', category: 'productivity', source: 'openclaw', sourceUrl: 'openclaw://skills/summarize', version: '1.1.0', installCount: 3600, rating: 4.7, permissions: [{ capability: 'llm:invoke', reason: 'LLM summarization' }] },
]

// ── Marketplace Service ─────────────────────────────────────────────────

export class SkillMarketplace {
  constructor(private db: Database) {}

  // ── Browse & Search ───────────────────────────────────────────────────

  /** Get all available skills (merged: catalog + installed state) */
  async browse(options: {
    category?: SkillCategory
    source?: SkillSource
    search?: string
  } = {}): Promise<SkillListing[]> {
    const installed = await this.getInstalled()
    const installedMap = new Map(installed.map((s) => [s.name, s]))

    let catalog = [...OPENCLAW_SKILLS]

    // Filter by category
    if (options.category) {
      catalog = catalog.filter((s) => s.category === options.category)
    }

    // Filter by source
    if (options.source) {
      catalog = catalog.filter((s) => s.source === options.source)
    }

    // Search
    if (options.search) {
      const q = options.search.toLowerCase()
      catalog = catalog.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.author.toLowerCase().includes(q)
      )
    }

    return catalog.map((skill) => {
      const inst = installedMap.get(skill.name)
      const config = inst?.config as SkillConfig | null
      return {
        ...skill,
        installed: !!inst?.installed,
        assignedAgents: config?.assignedAgents ?? [],
        usageStats: config?.usageStats,
      }
    })
  }

  /** Get a single skill listing by ID */
  async getSkill(id: string): Promise<SkillListing | null> {
    const all = await this.browse()
    return all.find((s) => s.id === id) ?? null
  }

  /** Get all installed skills */
  async getInstalled(): Promise<InstalledSkill[]> {
    const rows = await this.db.query.skillsMarketplace.findMany({
      where: eq(skillsMarketplace.installed, true),
    })
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      sourceUrl: r.sourceUrl,
      version: r.version,
      installed: r.installed ?? false,
      config: r.config as SkillConfig | null,
      createdAt: r.createdAt,
    }))
  }

  // ── Install / Uninstall ───────────────────────────────────────────────

  /** Install a skill from the catalog */
  async install(
    skillId: string,
    approvedPermissions: SkillCapability[]
  ): Promise<InstalledSkill> {
    const listing = OPENCLAW_SKILLS.find((s) => s.id === skillId)
    if (!listing) throw new Error(`Skill not found: ${skillId}`)

    // Verify all required permissions are approved
    const required = listing.permissions.map((p) => p.capability)
    const missing = required.filter((r) => !approvedPermissions.includes(r))
    if (missing.length > 0) {
      throw new Error(`Missing required permissions: ${missing.join(', ')}`)
    }

    const config: SkillConfig = {
      permissions: listing.permissions.filter((p) =>
        approvedPermissions.includes(p.capability)
      ),
      assignedAgents: [],
      enabled: true,
      category: listing.category,
      author: listing.author,
      description: listing.description,
      usageStats: { totalRuns: 0, avgDurationMs: 0 },
    }

    const [saved] = await this.db
      .insert(skillsMarketplace)
      .values({
        name: listing.name,
        sourceUrl: listing.sourceUrl,
        version: listing.version,
        installed: true,
        config,
      })
      .returning()

    return {
      id: saved.id,
      name: saved.name,
      sourceUrl: saved.sourceUrl,
      version: saved.version,
      installed: true,
      config,
      createdAt: saved.createdAt,
    }
  }

  /** Uninstall a skill */
  async uninstall(id: string): Promise<void> {
    await this.db
      .update(skillsMarketplace)
      .set({ installed: false })
      .where(eq(skillsMarketplace.id, id))
  }

  // ── Agent Assignment ──────────────────────────────────────────────────

  /** Assign a skill to an agent */
  async assignToAgent(skillId: string, agentId: string): Promise<void> {
    const row = await this.db.query.skillsMarketplace.findFirst({
      where: eq(skillsMarketplace.id, skillId),
    })
    if (!row) throw new Error(`Skill not found: ${skillId}`)

    const config = (row.config as SkillConfig) ?? { assignedAgents: [] }
    if (!config.assignedAgents.includes(agentId)) {
      config.assignedAgents.push(agentId)
    }

    await this.db
      .update(skillsMarketplace)
      .set({ config })
      .where(eq(skillsMarketplace.id, skillId))
  }

  /** Remove a skill from an agent */
  async unassignFromAgent(skillId: string, agentId: string): Promise<void> {
    const row = await this.db.query.skillsMarketplace.findFirst({
      where: eq(skillsMarketplace.id, skillId),
    })
    if (!row) throw new Error(`Skill not found: ${skillId}`)

    const config = (row.config as SkillConfig) ?? { assignedAgents: [] }
    config.assignedAgents = config.assignedAgents.filter((a) => a !== agentId)

    await this.db
      .update(skillsMarketplace)
      .set({ config })
      .where(eq(skillsMarketplace.id, skillId))
  }

  /** Toggle enabled/disabled for an installed skill */
  async toggleEnabled(skillId: string): Promise<boolean> {
    const row = await this.db.query.skillsMarketplace.findFirst({
      where: eq(skillsMarketplace.id, skillId),
    })
    if (!row) throw new Error(`Skill not found: ${skillId}`)

    const config = (row.config as SkillConfig) ?? { enabled: true }
    config.enabled = !config.enabled

    await this.db
      .update(skillsMarketplace)
      .set({ config })
      .where(eq(skillsMarketplace.id, skillId))

    return config.enabled
  }
}
