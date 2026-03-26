/**
 * Agent Soul Loader — reads all .md agent definition files at startup
 * and provides a lookup map keyed by kebab-case agent name.
 *
 * MD files come from https://github.com/VoltAgent/awesome-claude-code-subagents
 * Each has YAML frontmatter (name, description, tools, model) and a rich system prompt body.
 */

import * as fs from 'fs'
import * as path from 'path'

export interface AgentSoul {
  /** kebab-case name from frontmatter */
  name: string
  /** One-line description from frontmatter */
  description: string
  /** Tools the agent should have access to */
  tools: string[]
  /** Preferred model tier */
  model: string
  /** Full system prompt (body after frontmatter) */
  soul: string
  /** Category directory name */
  category: string
}

/**
 * Parse a markdown file with YAML frontmatter delimited by `---`.
 * Returns null if parsing fails.
 */
function parseFrontmatter(
  content: string,
): { frontmatter: Record<string, string>; body: string } | null {
  const trimmed = content.trim()
  if (!trimmed.startsWith('---')) return null

  const secondDash = trimmed.indexOf('---', 3)
  if (secondDash === -1) return null

  const fmBlock = trimmed.slice(3, secondDash).trim()
  const body = trimmed.slice(secondDash + 3).trim()

  const frontmatter: Record<string, string> = {}
  for (const line of fmBlock.split('\n')) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue
    const key = line.slice(0, colonIndex).trim()
    let value = line.slice(colonIndex + 1).trim()
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    frontmatter[key] = value
  }

  return { frontmatter, body }
}

/**
 * Load all agent MD files from category subdirectories.
 * Called once at module load time.
 */
function loadAllAgents(): Map<string, AgentSoul> {
  const map = new Map<string, AgentSoul>()
  const agentsDir = __dirname

  let categoryDirs: string[]
  try {
    categoryDirs = fs
      .readdirSync(agentsDir)
      .filter((entry) => {
        const fullPath = path.join(agentsDir, entry)
        return fs.statSync(fullPath).isDirectory() && /^\d{2}-/.test(entry)
      })
      .sort()
  } catch {
    console.warn('[AgentSouls] Could not read agents directory:', agentsDir)
    return map
  }

  for (const catDir of categoryDirs) {
    const catPath = path.join(agentsDir, catDir)
    let files: string[]
    try {
      files = fs.readdirSync(catPath).filter((f) => f.endsWith('.md'))
    } catch {
      continue
    }

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(catPath, file), 'utf-8')
        const parsed = parseFrontmatter(content)
        if (!parsed) {
          // No frontmatter — use entire content as soul, derive name from filename
          const name = file.replace('.md', '')
          map.set(name, {
            name,
            description: '',
            tools: [],
            model: 'sonnet',
            soul: content.trim(),
            category: catDir,
          })
          continue
        }

        const { frontmatter, body } = parsed
        const name = frontmatter.name || file.replace('.md', '')
        const tools = frontmatter.tools ? frontmatter.tools.split(',').map((t) => t.trim()) : []

        map.set(name, {
          name,
          description: frontmatter.description || '',
          tools,
          model: frontmatter.model || 'sonnet',
          soul: body,
          category: catDir,
        })
      } catch {
        // Skip unreadable files
      }
    }
  }

  return map
}

/** Map of kebab-case agent name → rich soul definition. Loaded once at startup. */
export const AGENT_SOULS: Map<string, AgentSoul> = loadAllAgents()

/** Override map for agent names that don't cleanly convert to kebab-case slugs */
const SLUG_OVERRIDES: Record<string, string> = {
  'C++ Pro': 'cpp-pro',
  'C# Developer': 'csharp-developer',
  '.NET Core Expert': 'dotnet-core-expert',
  '.NET Framework 4.8 Expert': 'dotnet-framework-4.8-expert',
  'Full-Stack Developer': 'fullstack-developer',
  'Go Pro': 'golang-pro',
  'PowerShell 5.1 Expert': 'powershell-5.1-expert',
  'PowerShell 7 Expert': 'powershell-7-expert',
  'React Native Expert': 'expo-react-native-expert',
  'Next.js Developer': 'nextjs-developer',
  'PS Security Hardening': 'powershell-security-hardening',
  'RL Engineer': 'reinforcement-learning-engineer',
  'PS UI Architect': 'powershell-ui-architect',
  'PS Module Architect': 'powershell-module-architect',
  'Scientific Researcher': 'scientific-literature-researcher',
}

/**
 * Look up a rich soul by agent display name (Title Case → kebab-case).
 * Returns the full MD body if found, null otherwise.
 */
export function getAgentSoul(displayName: string): AgentSoul | null {
  // Check overrides first for names with special characters
  const override = SLUG_OVERRIDES[displayName]
  if (override) return AGENT_SOULS.get(override) ?? null

  const key = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return AGENT_SOULS.get(key) ?? null
}
