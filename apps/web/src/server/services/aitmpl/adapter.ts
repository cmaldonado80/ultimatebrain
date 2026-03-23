/**
 * AITMPL → Brain Adaptation Layer
 *
 * AITMPL components are designed for single-user Claude Code sessions.
 * Brain adapts them to multi-tenant, multi-tier platform patterns:
 *
 * | AITMPL Pattern                  | Brain Adaptation                                       |
 * |--------------------------------|-------------------------------------------------------|
 * | SKILL.md in .claude/skills/    | Stored in skills_marketplace DB, injected into prompts |
 * | Agent .md in .claude/agents/   | Registered in agents table with orchestration metadata |
 * | Commands in .claude/commands/  | Exposed via tRPC router + chat slash commands          |
 * | Hooks in settings.json         | Mapped to Brain lifecycle events                       |
 * | MCPs in settings.json          | Registered in engine registry with auth + rate limits  |
 * | Settings presets               | Applied per workspace/agent/Mini Brain scope           |
 */

import type { AitmplComponent, ComponentCategory, InstallTier } from './installer'

export interface AdaptedComponent {
  originalId: string
  category: ComponentCategory
  tier: InstallTier
  /** Brain-native representation */
  brainFormat: AgentRecord | SkillRecord | CommandRecord | HookRecord | MCPRecord | SettingsRecord
}

// ── Brain-Native Records ────────────────────────────────────────────────

export interface AgentRecord {
  type: 'agent'
  name: string
  description: string
  /** System prompt extracted from agent .md */
  soul: string
  workspaceId?: string
  /** Trust score (0-1) — new imports start at 0.5 */
  trustScore: number
  modelAssignment?: string
  capabilities: string[]
  guardrails: string[]
  source: 'aitmpl' | 'custom'
}

export interface SkillRecord {
  type: 'skill'
  name: string
  description: string
  /** Full SKILL.md content */
  content: string
  permissions: string[]
  /** Agents this skill is available to */
  assignedAgents: string[]
  enabled: boolean
  source: 'aitmpl' | 'custom'
}

export interface CommandRecord {
  type: 'command'
  name: string
  description: string
  /** Slash command trigger (e.g., '/health') */
  trigger: string
  /** Handler content/logic */
  handler: string
  /** Available in which contexts */
  contexts: ('chat' | 'dashboard' | 'api')[]
  source: 'aitmpl' | 'custom'
}

export interface HookRecord {
  type: 'hook'
  event: 'PreToolUse' | 'PostToolUse' | 'SessionStart' | 'SessionEnd' | 'SubagentComplete'
  /** Tool/action filter (e.g., 'Edit', 'Bash', 'agent delegation') */
  filter?: string
  action: string
  /** Hook handler logic */
  handler: string
  enabled: boolean
  source: 'aitmpl' | 'custom'
}

export interface MCPRecord {
  type: 'mcp'
  name: string
  description: string
  /** Server command or URL */
  endpoint: string
  transport: 'stdio' | 'http-sse'
  /** Auth configuration */
  auth?: { type: 'bearer' | 'api-key'; envVar: string }
  /** Rate limit (requests per minute) */
  rateLimit: number
  /** Pre-installed or one-click */
  installMode: 'pre-installed' | 'one-click' | 'manual'
  enabled: boolean
  source: 'aitmpl' | 'custom'
}

export interface SettingsRecord {
  type: 'settings'
  name: string
  /** Scope: brain-wide, per-workspace, per-agent, per-mini-brain */
  scope: 'brain' | 'workspace' | 'agent' | 'mini_brain' | 'development'
  settings: Record<string, unknown>
  source: 'aitmpl' | 'custom'
}

// ── Adapter ─────────────────────────────────────────────────────────────

export class AitmplAdapter {
  /**
   * Adapt an AITMPL component to Brain-native format.
   */
  adapt(component: AitmplComponent, tier: InstallTier): AdaptedComponent {
    const brainFormat = this.convertToNativeFormat(component, tier)
    return {
      originalId: component.id,
      category: component.category,
      tier,
      brainFormat,
    }
  }

  private convertToNativeFormat(
    component: AitmplComponent,
    tier: InstallTier
  ): AdaptedComponent['brainFormat'] {
    switch (component.category) {
      case 'agents':
        return this.adaptAgent(component, tier)
      case 'skills':
        return this.adaptSkill(component)
      case 'commands':
        return this.adaptCommand(component)
      case 'hooks':
        return this.adaptHook(component)
      case 'mcps':
        return this.adaptMCP(component)
      case 'settings':
        return this.adaptSettings(component, tier)
    }
  }

  // ── Category-Specific Adapters ────────────────────────────────────────

  private adaptAgent(component: AitmplComponent, _tier: InstallTier): AgentRecord {
    const content = component.content ?? ''

    // Extract soul/system prompt from agent .md
    const soul = this.extractSection(content, 'system prompt') ||
      this.extractSection(content, 'description') ||
      content

    // Extract capabilities
    const capabilities = this.extractList(content, 'capabilities') ||
      this.extractList(content, 'tools') || []

    return {
      type: 'agent',
      name: component.name,
      description: component.description,
      soul,
      trustScore: 0.5, // new imports start at 0.5
      capabilities,
      guardrails: [],
      source: 'aitmpl',
    }
  }

  private adaptSkill(component: AitmplComponent): SkillRecord {
    const content = component.content ?? ''
    const permissions = this.extractList(content, 'permissions') || []

    return {
      type: 'skill',
      name: component.name,
      description: component.description,
      content,
      permissions,
      assignedAgents: [],
      enabled: true,
      source: 'aitmpl',
    }
  }

  private adaptCommand(component: AitmplComponent): CommandRecord {
    const content = component.content ?? ''
    const trigger = `/${component.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`

    return {
      type: 'command',
      name: component.name,
      description: component.description,
      trigger,
      handler: content,
      contexts: ['chat', 'dashboard', 'api'],
      source: 'aitmpl',
    }
  }

  private adaptHook(component: AitmplComponent): HookRecord {
    const content = component.content ?? ''

    // Infer event from name/content
    let event: HookRecord['event'] = 'PostToolUse'
    const lower = content.toLowerCase()
    if (lower.includes('pretooluse') || lower.includes('pre-tool')) event = 'PreToolUse'
    if (lower.includes('sessionstart') || lower.includes('session-start')) event = 'SessionStart'
    if (lower.includes('sessionend') || lower.includes('session-end')) event = 'SessionEnd'
    if (lower.includes('subagentcomplete') || lower.includes('subagent-complete')) event = 'SubagentComplete'

    return {
      type: 'hook',
      event,
      action: component.description,
      handler: content,
      enabled: true,
      source: 'aitmpl',
    }
  }

  private adaptMCP(component: AitmplComponent): MCPRecord {
    return {
      type: 'mcp',
      name: component.name,
      description: component.description,
      endpoint: `npx -y @aitmpl/mcp-${component.name}`,
      transport: 'stdio',
      rateLimit: 100,
      installMode: 'one-click',
      enabled: false, // not enabled by default
      source: 'aitmpl',
    }
  }

  private adaptSettings(component: AitmplComponent, tier: InstallTier): SettingsRecord {
    const content = component.content ?? '{}'
    let settings: Record<string, unknown> = {}
    try { settings = JSON.parse(content) } catch (err) { console.warn(`[AitmplAdapter] Failed to parse settings for ${component.name}:`, err) }

    const scope: SettingsRecord['scope'] =
      tier === 'brain' ? 'brain' :
      tier === 'mini_brain' ? 'mini_brain' : 'development'

    return {
      type: 'settings',
      name: component.name,
      scope,
      settings,
      source: 'aitmpl',
    }
  }

  // ── Content Parsing Helpers ───────────────────────────────────────────

  private extractSection(content: string, sectionName: string): string {
    const regex = new RegExp(`##\\s*${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i')
    const match = content.match(regex)
    return match?.[1]?.trim() ?? ''
  }

  private extractList(content: string, sectionName: string): string[] {
    const section = this.extractSection(content, sectionName)
    if (!section) return []
    return section
      .split('\n')
      .filter((l) => l.trim().startsWith('-'))
      .map((l) => l.replace(/^-\s*/, '').trim())
      .filter(Boolean)
  }
}
