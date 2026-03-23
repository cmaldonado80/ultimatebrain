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
  { name: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, severity: 'high' },
  { name: 'phone_us', pattern: /\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, severity: 'medium' },
  { name: 'ip_address', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, severity: 'medium' },
  { name: 'api_key_generic', pattern: /\b(?:sk|pk|api|key|token|secret|password)[-_]?[A-Za-z0-9]{20,}\b/gi, severity: 'critical' },
  { name: 'aws_key', pattern: /\bAKIA[0-9A-Z]{16}\b/g, severity: 'critical' },
  { name: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, severity: 'high' },
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
  { name: 'ignore_instructions', pattern: /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|above|prior|earlier)\s+(?:instructions|prompts|rules|context)/gi, severity: 'critical' },
  { name: 'system_override', pattern: /\b(?:you\s+are\s+now|new\s+instructions?|override\s+system|act\s+as\s+if|pretend\s+(?:you(?:'re|\s+are)))/gi, severity: 'critical' },
  { name: 'role_hijack', pattern: /\b(?:you\s+are\s+(?:a|an)\s+(?:different|new|evil|unrestricted))\b/gi, severity: 'high' },
  { name: 'jailbreak_dan', pattern: /\b(?:DAN|do\s+anything\s+now|developer\s+mode|jailbreak)\b/gi, severity: 'critical' },
  { name: 'encoding_attack', pattern: /(?:base64|rot13|hex|unicode)\s*(?:decode|encode|convert)/gi, severity: 'high' },
  { name: 'delimiter_injection', pattern: /(?:<\/?system>|<\/?user>|<\/?assistant>|\[INST\]|\[\/INST\]|###\s*(?:System|User|Assistant))/gi, severity: 'critical' },
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
  { name: 'sql_injection', pattern: /(?:'\s*(?:OR|AND)\s+[\d'"]|;\s*(?:DROP|DELETE|UPDATE|INSERT|ALTER)\s)/gi, severity: 'critical' },
  { name: 'command_injection', pattern: /(?:;\s*(?:rm|cat|curl|wget|chmod|eval)\s|`[^`]*`|\$\([^)]*\))/gi, severity: 'critical' },
  { name: 'path_traversal', pattern: /(?:\.\.\/|\.\.\\){2,}/g, severity: 'high' },
  { name: 'xss_attempt', pattern: /<script[^>]*>|javascript:|on(?:error|load|click)\s*=/gi, severity: 'high' },
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
      return [{
        rule: 'output.too_long',
        detail: `Output exceeds ${MAX_OUTPUT_CHARS} characters (got ${content.length})`,
        severity: 'medium',
      }]
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
  'exec', 'shell', 'run_command', 'system',
  'delete_database', 'drop_table', 'format_disk',
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

/** All built-in rules */
export const BUILTIN_RULES: GuardrailRule[] = [
  piiDetector,
  promptInjectionShield,
  contentSafetyRule,
  outputLengthRule,
  toolCallValidator,
]
