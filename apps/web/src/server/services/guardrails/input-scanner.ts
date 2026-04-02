/**
 * Input Context Scanner — Detects prompt injection in context files and user inputs.
 *
 * Inspired by Hermes Agent's prompt injection defense.
 * Scans ALL injected context (memory, atlas, instincts, soul prompts)
 * for patterns that attempt to override system instructions.
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface InjectionScanResult {
  safe: boolean
  threats: InjectionThreat[]
}

export interface InjectionThreat {
  pattern: string
  match: string
  severity: 'high' | 'medium'
  location: string
}

// ── Detection Patterns ──────────────────────────────────────────────

interface ThreatPattern {
  regex: RegExp
  label: string
  severity: 'high' | 'medium'
}

const THREAT_PATTERNS: ThreatPattern[] = [
  // Direct instruction override attempts
  {
    regex: /ignore\s+(all\s+)?previous\s+(instructions|prompts|rules)/i,
    label: 'instruction override',
    severity: 'high',
  },
  {
    regex: /disregard\s+(all\s+)?(above|prior|previous)/i,
    label: 'disregard directive',
    severity: 'high',
  },
  {
    regex: /forget\s+(everything|all|your)\s*(instructions|rules|guidelines)?/i,
    label: 'forget directive',
    severity: 'high',
  },
  { regex: /you\s+are\s+now\s+(a|an|the)\b/i, label: 'identity override', severity: 'high' },
  { regex: /new\s+instructions?\s*:/i, label: 'new instructions injection', severity: 'high' },
  {
    regex: /system\s*:\s*you\s+(are|must|should)/i,
    label: 'fake system message',
    severity: 'high',
  },

  // Hidden Unicode attacks
  {
    regex: /[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g,
    label: 'hidden Unicode characters',
    severity: 'high',
  },

  // Credential exfiltration
  {
    regex: /curl\b.*\$\{?(API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIALS)/i,
    label: 'credential exfiltration via curl',
    severity: 'high',
  },
  {
    regex: /wget\b.*\$\{?(API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIALS)/i,
    label: 'credential exfiltration via wget',
    severity: 'high',
  },
  {
    regex: /fetch\(['"]https?:\/\/.*\$\{?(API_KEY|SECRET|TOKEN)/i,
    label: 'credential exfiltration via fetch',
    severity: 'high',
  },

  // HTML/comment-based injection
  {
    regex: /<!--\s*(override|system|ignore|admin)/i,
    label: 'HTML comment injection',
    severity: 'medium',
  },
  { regex: /<script\b/i, label: 'script tag injection', severity: 'medium' },

  // Encoded/obfuscated attacks
  {
    regex: /base64\s*[\(:].*[A-Za-z0-9+/=]{20,}/i,
    label: 'base64 encoded payload',
    severity: 'medium',
  },
  { regex: /eval\s*\(/i, label: 'eval injection', severity: 'medium' },

  // Social engineering of the model
  {
    regex: /(?:admin|developer|creator)\s+mode\s*(activated|enabled|on)/i,
    label: 'fake mode activation',
    severity: 'high',
  },
  {
    regex: /do\s+not\s+follow\s+(your|the)\s+(safety|content|moderation)/i,
    label: 'safety bypass attempt',
    severity: 'high',
  },
  { regex: /jailbreak/i, label: 'explicit jailbreak reference', severity: 'high' },
]

// ── Scanner ─────────────────────────────────────────────────────────

/**
 * Scan a piece of context for prompt injection patterns.
 *
 * @param content - The text to scan (memory, atlas context, user input, etc.)
 * @param location - Label for where this content came from (for logging)
 * @returns InjectionScanResult with threats found
 */
export function scanForInjection(
  content: string,
  location: string = 'unknown',
): InjectionScanResult {
  const threats: InjectionThreat[] = []

  for (const { regex, label, severity } of THREAT_PATTERNS) {
    const match = content.match(regex)
    if (match) {
      threats.push({
        pattern: label,
        match: match[0].slice(0, 100),
        severity,
        location,
      })
    }
  }

  return {
    safe: threats.filter((t) => t.severity === 'high').length === 0,
    threats,
  }
}

/**
 * Sanitize content by removing detected high-severity injection patterns.
 * Returns the cleaned content with threats stripped.
 */
export function sanitizeContext(
  content: string,
  _location: string = 'unknown',
): {
  sanitized: string
  threatsRemoved: number
} {
  let sanitized = content
  let threatsRemoved = 0

  for (const { regex, severity } of THREAT_PATTERNS) {
    if (severity !== 'high') continue
    const before = sanitized
    sanitized = sanitized.replace(regex, '[BLOCKED]')
    if (sanitized !== before) threatsRemoved++
  }

  return { sanitized, threatsRemoved }
}
