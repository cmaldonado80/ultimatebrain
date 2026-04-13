/**
 * YAML Agent Loader — OpenAgents-inspired agent definitions.
 *
 * Load agent configurations from YAML files instead of hardcoded TypeScript.
 * Supports: name, type, soul, skills, model, temperature.
 */

export interface YamlAgentDef {
  name: string
  type?: string
  description?: string
  soul?: string
  skills?: string[]
  model?: string
  temperature?: number
  maxTokens?: number
  tags?: string[]
  requiredModelType?: string
}

/**
 * Parse a YAML-like agent definition from a string.
 * Supports a simplified YAML subset (key: value pairs).
 */
export function parseAgentYaml(content: string): YamlAgentDef {
  const lines = content.split('\n')
  const result: Record<string, unknown> = {}
  let currentKey = ''
  let multilineValue = ''
  let inMultiline = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    if (inMultiline) {
      if (line.startsWith('  ') || line.startsWith('\t')) {
        multilineValue += (multilineValue ? '\n' : '') + trimmed
        continue
      } else {
        result[currentKey] = multilineValue
        inMultiline = false
        multilineValue = ''
      }
    }

    const match = trimmed.match(/^(\w+)\s*:\s*(.*)$/)
    if (match) {
      const [, key, value] = match
      if (!value || value === '|') {
        currentKey = key!
        inMultiline = true
        multilineValue = ''
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Array: [item1, item2]
        result[key!] = value
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean)
      } else if (value === 'true' || value === 'false') {
        result[key!] = value === 'true'
      } else if (!isNaN(Number(value))) {
        result[key!] = Number(value)
      } else {
        result[key!] = value.replace(/^['"]|['"]$/g, '')
      }
    }
  }

  if (inMultiline && currentKey) {
    result[currentKey] = multilineValue
  }

  return {
    name: (result.name as string) ?? 'unnamed-agent',
    type: result.type as string | undefined,
    description: result.description as string | undefined,
    soul: result.soul as string | undefined,
    skills: result.skills as string[] | undefined,
    model: result.model as string | undefined,
    temperature: result.temperature as number | undefined,
    maxTokens: result.maxTokens as number | undefined,
    tags: result.tags as string[] | undefined,
    requiredModelType: result.requiredModelType as string | undefined,
  }
}

/**
 * Convert a YAML agent definition to DB-ready values.
 */
export function yamlToAgentValues(def: YamlAgentDef, workspaceId?: string) {
  return {
    name: def.name,
    type: def.type ?? 'specialist',
    description: def.description,
    soul: def.soul,
    skills: def.skills ?? [],
    model: def.model,
    temperature: def.temperature,
    maxTokens: def.maxTokens,
    tags: def.tags ?? [],
    requiredModelType: def.requiredModelType as string | undefined,
    workspaceId,
  }
}
