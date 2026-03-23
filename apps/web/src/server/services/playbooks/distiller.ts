/**
 * Playbook Distiller
 *
 * LLM-powered analysis of recorded sessions:
 * - Extracts reusable patterns from raw steps
 * - Parameterizes: replaces specific values with {{variables}}
 * - Generates: description, trigger conditions, expected outcomes
 * - Outputs: SKILL.md-format playbook documentation
 */

import type { Database } from '@solarc/db'
import { GatewayRouter } from '../gateway'
import type { PlaybookStep, RecordedEvent, SavedPlaybook } from './recorder'

export interface DistilledPlaybook {
  name: string
  description: string
  triggerConditions: string[]
  expectedOutcomes: string[]
  steps: PlaybookStep[]
  /** SKILL.md-format documentation */
  skillDoc: string
  /** Extracted variable names → descriptions */
  variables: Record<string, string>
  confidence: number
}

export interface DistillOptions {
  /** Suggested name (LLM may refine it) */
  suggestedName?: string
  /** Additional context to help LLM understand the recording */
  context?: string
  /** Whether to aggressively parameterize (replace more values with vars) */
  aggressiveParameterization?: boolean
}

export class PlaybookDistiller {
  private gateway: GatewayRouter | null = null

  constructor(opts?: { db?: Database }) {
    if (opts?.db) {
      this.gateway = new GatewayRouter(opts.db)
    }
  }
  /**
   * Distill raw playbook steps into a reusable parameterized playbook.
   * Calls LLM to extract patterns, parameterize values, and generate docs.
   */
  async distill(steps: PlaybookStep[], options: DistillOptions = {}): Promise<DistilledPlaybook> {
    // Step 1: Extract variables (parameterize specific values)
    const { parameterizedSteps, variables } = this.parameterize(
      steps,
      options.aggressiveParameterization ?? false
    )

    // Step 2: LLM analysis — extract name, description, triggers, outcomes
    const analysis = await this.analyzeWithLLM(parameterizedSteps, options)

    // Step 3: Generate SKILL.md documentation
    const skillDoc = this.generateSkillDoc(analysis, parameterizedSteps, variables)

    return {
      name: analysis.name,
      description: analysis.description,
      triggerConditions: analysis.triggerConditions,
      expectedOutcomes: analysis.expectedOutcomes,
      steps: parameterizedSteps,
      skillDoc,
      variables,
      confidence: analysis.confidence,
    }
  }

  /**
   * Generate SKILL.md format documentation for a saved playbook.
   */
  generateSkillDocForPlaybook(playbook: SavedPlaybook): string {
    return this.generateSkillDoc(
      {
        name: playbook.name,
        description: playbook.description ?? '',
        triggerConditions: playbook.triggerConditions ?? [],
        expectedOutcomes: [],
        confidence: 1.0,
      },
      playbook.steps,
      {}
    )
  }

  // ── Parameterization ──────────────────────────────────────────────────

  /**
   * Replace specific values with {{variable}} placeholders.
   * Returns updated steps and a variable map.
   */
  private parameterize(
    steps: PlaybookStep[],
    aggressive: boolean
  ): { parameterizedSteps: PlaybookStep[]; variables: Record<string, string> } {
    const variables: Record<string, string> = {}
    let varCounter = 0

    function toVarName(key: string, value: unknown): string {
      // Generate a readable variable name
      const base = key.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
      const name = `${base}_${varCounter++}`
      variables[name] = `Value for ${key} (example: ${JSON.stringify(value)})`
      return `{{${name}}}`
    }

    const parameterizedSteps = steps.map((step) => {
      const newParams: Record<string, unknown> = {}

      for (const [key, value] of Object.entries(step.parameters)) {
        // Always parameterize UUIDs, URLs, emails
        if (shouldParameterize(key, value, aggressive)) {
          newParams[key] = toVarName(key, value)
        } else {
          newParams[key] = value
        }
      }

      return { ...step, parameters: newParams }
    })

    return { parameterizedSteps, variables }
  }

  // ── LLM Analysis ──────────────────────────────────────────────────────

  private async analyzeWithLLM(
    steps: PlaybookStep[],
    options: DistillOptions
  ): Promise<{
    name: string
    description: string
    triggerConditions: string[]
    expectedOutcomes: string[]
    confidence: number
  }> {
    const stepSummary = steps.map((s, i) => `${i + 1}. [${s.type}] ${s.name}: ${s.description}`).join('\n')

    // Try LLM analysis for pattern extraction and parameterization suggestions
    try {
      if (this.gateway) {
        const result = await this.gateway.chat({
          messages: [
            {
              role: 'system',
              content:
                'You are a playbook analyst. Analyze the following recorded steps and extract: ' +
                'a concise name, description, trigger conditions, expected outcomes, and confidence (0-1). ' +
                'Also suggest which parameters should be extracted as variables. ' +
                'Respond with a JSON object: ' +
                '{"name": "...", "description": "...", "triggerConditions": ["..."], ' +
                '"expectedOutcomes": ["..."], "confidence": 0.0-1.0}. ' +
                'Respond ONLY with JSON.',
            },
            {
              role: 'user',
              content:
                (options.suggestedName ? `Suggested name: ${options.suggestedName}\n` : '') +
                (options.context ? `Context: ${options.context}\n` : '') +
                `\nSteps:\n${stepSummary}`,
            },
          ],
        })

        const parsed = JSON.parse(result.content)
        return {
          name: String(parsed.name ?? options.suggestedName ?? 'Unnamed Playbook'),
          description: String(parsed.description ?? ''),
          triggerConditions: Array.isArray(parsed.triggerConditions) ? parsed.triggerConditions.map(String) : [],
          expectedOutcomes: Array.isArray(parsed.expectedOutcomes) ? parsed.expectedOutcomes.map(String) : [],
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
        }
      }
    } catch (err) {
      console.error('[PlaybookDistiller] LLM analysis failed, using heuristic fallback:', err)
    }

    // Fallback: heuristic-based analysis
    const firstAction = steps[0]?.name ?? 'unknown action'
    const lastAction = steps[steps.length - 1]?.name ?? 'completion'
    const inferredName =
      options.suggestedName ??
      `Playbook: ${firstAction.slice(0, 40)} → ${lastAction.slice(0, 30)}`

    const triggerConditions = this.inferTriggers(steps)
    const expectedOutcomes = this.inferOutcomes(steps)

    return {
      name: inferredName,
      description:
        `Automated playbook with ${steps.length} steps. ` +
        (options.context ? `Context: ${options.context}. ` : '') +
        `Steps: ${stepSummary.slice(0, 200)}`,
      triggerConditions,
      expectedOutcomes,
      confidence: steps.length > 0 ? Math.min(0.5 + steps.length * 0.05, 0.95) : 0.3,
    }
  }

  private inferTriggers(steps: PlaybookStep[]): string[] {
    const triggers: string[] = []
    const first = steps[0]

    if (!first) return ['Manual trigger']

    if (first.type === 'navigation') {
      triggers.push(`User navigates to ${first.parameters['target_path'] ?? 'a page'}`)
    } else if (first.type === 'click') {
      triggers.push(`User clicks ${first.name}`)
    } else if (first.type === 'api_call') {
      triggers.push(`API call: ${first.description}`)
    } else {
      triggers.push('Manual trigger')
    }

    // Look for decision points as additional triggers
    const decisions = steps.filter((s) => s.type === 'decision')
    if (decisions.length > 0) {
      triggers.push(`When ${decisions[0].description.toLowerCase()}`)
    }

    return triggers
  }

  private inferOutcomes(steps: PlaybookStep[]): string[] {
    const outcomes: string[] = []
    const last = steps[steps.length - 1]

    if (!last) return ['Task completed']

    if (last.type === 'api_call') {
      outcomes.push(`${last.description} completed successfully`)
    } else if (last.type === 'transformation') {
      outcomes.push('Data transformed and saved')
    } else if (last.type === 'navigation') {
      outcomes.push(`User landed on ${last.parameters['target_path'] ?? 'target page'}`)
    } else {
      outcomes.push('All steps executed successfully')
    }

    const transforms = steps.filter((s) => s.type === 'transformation')
    if (transforms.length > 0) {
      outcomes.push(`${transforms.length} data transformation(s) applied`)
    }

    return outcomes
  }

  // ── SKILL.md Generation ───────────────────────────────────────────────

  private generateSkillDoc(
    analysis: {
      name: string
      description: string
      triggerConditions: string[]
      expectedOutcomes: string[]
      confidence: number
    },
    steps: PlaybookStep[],
    variables: Record<string, string>
  ): string {
    const lines: string[] = [
      `# ${analysis.name}`,
      '',
      `> ${analysis.description}`,
      '',
      `**Confidence**: ${Math.round(analysis.confidence * 100)}%`,
      `**Steps**: ${steps.length}`,
      '',
      '## Trigger Conditions',
      '',
      ...analysis.triggerConditions.map((t) => `- ${t}`),
      '',
      '## Expected Outcomes',
      '',
      ...analysis.expectedOutcomes.map((o) => `- ${o}`),
      '',
    ]

    if (Object.keys(variables).length > 0) {
      lines.push('## Variables', '')
      for (const [name, desc] of Object.entries(variables)) {
        lines.push(`- \`{{${name}}}\`: ${desc}`)
      }
      lines.push('')
    }

    lines.push('## Steps', '')
    steps.forEach((step, i) => {
      lines.push(`### ${i + 1}. ${step.name}`)
      lines.push('')
      lines.push(`**Type**: \`${step.type}\``)
      lines.push(`**Description**: ${step.description}`)
      if (Object.keys(step.parameters).length > 0) {
        lines.push('**Parameters**:')
        for (const [k, v] of Object.entries(step.parameters)) {
          lines.push(`  - \`${k}\`: \`${JSON.stringify(v)}\``)
        }
      }
      if (step.expectedOutcome) {
        lines.push(`**Expected**: ${step.expectedOutcome}`)
      }
      lines.push('')
    })

    return lines.join('\n')
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function shouldParameterize(key: string, value: unknown, aggressive: boolean): boolean {
  if (typeof value !== 'string') return false

  // Always parameterize
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (uuidRegex.test(value)) return true
  if (value.startsWith('http://') || value.startsWith('https://')) return true
  if (value.includes('@') && value.includes('.')) return true // email

  // Parameterize IDs and names if aggressive
  if (aggressive) {
    if (key.endsWith('Id') || key.endsWith('_id')) return true
    if (key.endsWith('Name') || key.endsWith('_name')) return true
    if (key === 'title' || key === 'description') return true
  }

  return false
}
