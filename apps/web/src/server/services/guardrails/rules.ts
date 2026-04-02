/**
 * Guardrail rule interface and built-in rules.
 *
 * Each rule implements `check()` which returns violations.
 * Rules are organized by layer: input, output, tool.
 */

export type GuardrailLayer = 'input' | 'tool' | 'output'
export type Severity = 'low' | 'medium' | 'high' | 'critical'

export interface Violation {
  rule: string
  detail: string
  severity: Severity
}

export interface RuleContext {
  agentId?: string
  ticketId?: string
  layer: GuardrailLayer
}

export interface GuardrailRule {
  /** Unique rule name */
  name: string
  /** Which layers this rule applies to */
  layers: GuardrailLayer[]
  /** Check content and return violations (empty = passed) */
  check(content: string, ctx: RuleContext): Violation[]
  /** Optional: sanitize content (return modified version) */
  sanitize?(content: string, ctx: RuleContext): string
}

// === PII Detection ===

const PII_PATTERNS: Array<{ name: string; pattern: RegExp; severity: Severity }> = [
  { name: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g, severity: 'critical' },
  { name: 'credit_card', pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, severity: 'critical' },
  {
    name: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    severity: 'high',
  },
  {
    name: 'phone_us',
    pattern: /\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    severity: 'medium',
  },
  { name: 'ip_address', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, severity: 'medium' },
  {
    name: 'api_key_generic',
    pattern: /\b(?:sk|pk|api|key|token|secret|password)[-_]?[A-Za-z0-9]{20,}\b/gi,
    severity: 'critical',
  },
  { name: 'aws_key', pattern: /\bAKIA[0-9A-Z]{16}\b/g, severity: 'critical' },
  {
    name: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    severity: 'high',
  },
]

export const piiDetector: GuardrailRule = {
  name: 'pii_detector',
  layers: ['input', 'output'],
  check(content: string): Violation[] {
    const violations: Violation[] = []
    for (const { name, pattern, severity } of PII_PATTERNS) {
      // Reset lastIndex for global regexes
      pattern.lastIndex = 0
      const matches = content.match(pattern)
      if (matches) {
        violations.push({
          rule: `pii.${name}`,
          detail: `Found ${matches.length} potential ${name.replace(/_/g, ' ')} pattern(s)`,
          severity,
        })
      }
    }
    return violations
  },
  sanitize(content: string): string {
    let sanitized = content
    for (const { pattern } of PII_PATTERNS) {
      pattern.lastIndex = 0
      sanitized = sanitized.replace(pattern, '[REDACTED]')
    }
    return sanitized
  },
}

// === Prompt Injection Shield ===

const INJECTION_PATTERNS: Array<{ name: string; pattern: RegExp; severity: Severity }> = [
  {
    name: 'ignore_instructions',
    pattern:
      /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|above|prior|earlier)\s+(?:instructions|prompts|rules|context)/gi,
    severity: 'critical',
  },
  {
    name: 'system_override',
    pattern:
      /\b(?:you\s+are\s+now|new\s+instructions?|override\s+system|act\s+as\s+if|pretend\s+(?:you(?:'re|\s+are)))/gi,
    severity: 'critical',
  },
  {
    name: 'role_hijack',
    pattern: /\b(?:you\s+are\s+(?:a|an)\s+(?:different|new|evil|unrestricted))\b/gi,
    severity: 'high',
  },
  {
    name: 'jailbreak_dan',
    pattern: /\b(?:DAN|do\s+anything\s+now|developer\s+mode|jailbreak)\b/gi,
    severity: 'critical',
  },
  {
    name: 'encoding_attack',
    pattern: /(?:base64|rot13|hex|unicode)\s*(?:decode|encode|convert)/gi,
    severity: 'high',
  },
  {
    name: 'delimiter_injection',
    pattern:
      /(?:<\/?system>|<\/?user>|<\/?assistant>|\[INST\]|\[\/INST\]|###\s*(?:System|User|Assistant))/gi,
    severity: 'critical',
  },
  { name: 'markdown_escape', pattern: /```(?:system|prompt|instruction)/gi, severity: 'high' },
]

export const promptInjectionShield: GuardrailRule = {
  name: 'prompt_injection_shield',
  layers: ['input'],
  check(content: string): Violation[] {
    const violations: Violation[] = []
    for (const { name, pattern, severity } of INJECTION_PATTERNS) {
      pattern.lastIndex = 0
      if (pattern.test(content)) {
        violations.push({
          rule: `injection.${name}`,
          detail: `Potential prompt injection detected: ${name.replace(/_/g, ' ')}`,
          severity,
        })
      }
    }
    return violations
  },
}

// === Content Safety ===

const UNSAFE_PATTERNS: Array<{ name: string; pattern: RegExp; severity: Severity }> = [
  {
    name: 'sql_injection',
    pattern: /(?:'\s*(?:OR|AND)\s+[\d'"]|;\s*(?:DROP|DELETE|UPDATE|INSERT|ALTER)\s)/gi,
    severity: 'critical',
  },
  {
    name: 'command_injection',
    pattern: /(?:;\s*(?:rm|cat|curl|wget|chmod|eval)\s|`[^`]*`|\$\([^)]*\))/gi,
    severity: 'critical',
  },
  { name: 'path_traversal', pattern: /(?:\.\.\/|\.\.\\){2,}/g, severity: 'high' },
  {
    name: 'xss_attempt',
    pattern: /<script[^>]*>|javascript:|on(?:error|load|click)\s*=/gi,
    severity: 'high',
  },
]

export const contentSafetyRule: GuardrailRule = {
  name: 'content_safety',
  layers: ['input', 'output', 'tool'],
  check(content: string): Violation[] {
    const violations: Violation[] = []
    for (const { name, pattern, severity } of UNSAFE_PATTERNS) {
      pattern.lastIndex = 0
      if (pattern.test(content)) {
        violations.push({
          rule: `safety.${name}`,
          detail: `Unsafe content pattern detected: ${name.replace(/_/g, ' ')}`,
          severity,
        })
      }
    }
    return violations
  },
}

// === Output Length Limiter ===

export const outputLengthRule: GuardrailRule = {
  name: 'output_length',
  layers: ['output'],
  check(content: string): Violation[] {
    const MAX_OUTPUT_CHARS = 100_000
    if (content.length > MAX_OUTPUT_CHARS) {
      return [
        {
          rule: 'output.too_long',
          detail: `Output exceeds ${MAX_OUTPUT_CHARS} characters (got ${content.length})`,
          severity: 'medium',
        },
      ]
    }
    return []
  },
  sanitize(content: string): string {
    const MAX_OUTPUT_CHARS = 100_000
    if (content.length > MAX_OUTPUT_CHARS) {
      return content.slice(0, MAX_OUTPUT_CHARS) + '\n[TRUNCATED]'
    }
    return content
  },
}

// === Tool Call Validator ===

const BLOCKED_TOOLS = new Set([
  'exec',
  'shell',
  'run_command',
  'system',
  'delete_database',
  'drop_table',
  'format_disk',
])

export const toolCallValidator: GuardrailRule = {
  name: 'tool_call_validator',
  layers: ['tool'],
  check(content: string): Violation[] {
    const violations: Violation[] = []
    try {
      const parsed = JSON.parse(content)
      const toolName = parsed?.name ?? parsed?.function?.name ?? ''
      if (BLOCKED_TOOLS.has(toolName)) {
        violations.push({
          rule: 'tool.blocked',
          detail: `Blocked tool call: ${toolName}`,
          severity: 'critical',
        })
      }
    } catch {
      // Not a JSON tool call — skip
    }
    return violations
  },
}

/**
 * Anti-rationalization detector (inspired by Superpowers' verification-before-completion).
 * Flags when agents make unverified completion claims using weasel words.
 */
export const antiRationalizationRule: GuardrailRule = {
  name: 'anti_rationalization',
  layers: ['output'],
  check(content: string): Violation[] {
    const violations: Violation[] = []
    const lower = content.toLowerCase()

    // Completion claims without evidence
    const claimPatterns = [
      /\b(should\s+(?:work|pass|be\s+fine|be\s+correct))\b/gi,
      /\b(probably\s+(?:works?|fine|correct|pass(?:es|ing)?))\b/gi,
      /\b(i(?:'m| am)\s+confident)\b/gi,
      /\b(seems?\s+to\s+(?:work|be\s+(?:fine|correct|working)))\b/gi,
      /\b(i\s+(?:think|believe)\s+(?:it|this|that)\s+(?:works?|is\s+(?:correct|fine)))\b/gi,
    ]

    // Only flag if the content also contains completion-like language
    const hasCompletionClaim =
      /\b(done|complete|finished|fixed|resolved|pass(?:es|ing)?|success|ready)\b/i.test(lower)

    if (hasCompletionClaim) {
      for (const pattern of claimPatterns) {
        const matches = content.match(pattern)
        if (matches) {
          violations.push({
            rule: 'anti_rationalization',
            detail: `Unverified claim detected: "${matches[0]}". Use verify_claim tool to provide evidence before asserting completion.`,
            severity: 'medium',
          })
        }
      }
    }

    return violations
  },
}

/** All built-in rules */
export const BUILTIN_RULES: GuardrailRule[] = [
  piiDetector,
  promptInjectionShield,
  contentSafetyRule,
  outputLengthRule,
  toolCallValidator,
  antiRationalizationRule,
]

// ── Diagnostic Guardrail Categories (AgentDoG + Galileo-inspired) ────

/**
 * Three-category guardrail taxonomy for diagnostic analysis.
 * Each rule is classified into a failure mode category:
 *   - structural: Malformed outputs, dangling tool calls, format errors
 *   - content: Hallucination, unverified claims, PII leakage
 *   - security: Injection attacks, command injection, privilege escalation
 */
export type GuardrailCategory = 'structural' | 'content' | 'security'

export const RULE_CATEGORIES: Record<string, GuardrailCategory> = {
  output_length: 'structural',
  tool_call_validator: 'structural',
  anti_rationalization: 'content',
  pii_detector: 'content',
  prompt_injection_shield: 'security',
  content_safety: 'security',
}

export interface DiagnosticSummary {
  totalViolations: number
  byCategory: Record<GuardrailCategory, { count: number; violations: Violation[] }>
  bySeverity: Record<Severity, number>
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical'
}

/**
 * Generate a diagnostic summary from guardrail violations.
 * Categorizes violations by failure mode (structural/content/security)
 * and computes an overall risk level.
 */
export function diagnoseViolations(violations: Violation[]): DiagnosticSummary {
  const byCategory: Record<GuardrailCategory, { count: number; violations: Violation[] }> = {
    structural: { count: 0, violations: [] },
    content: { count: 0, violations: [] },
    security: { count: 0, violations: [] },
  }

  const bySeverity: Record<Severity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  }

  for (const v of violations) {
    const category = RULE_CATEGORIES[v.rule] ?? 'content'
    byCategory[category].count++
    byCategory[category].violations.push(v)
    bySeverity[v.severity]++
  }

  let riskLevel: DiagnosticSummary['riskLevel'] = 'safe'
  if (bySeverity.critical > 0 || byCategory.security.count > 0) riskLevel = 'critical'
  else if (bySeverity.high > 0) riskLevel = 'high'
  else if (bySeverity.medium > 0) riskLevel = 'medium'
  else if (violations.length > 0) riskLevel = 'low'

  return {
    totalViolations: violations.length,
    byCategory,
    bySeverity,
    riskLevel,
  }
}
