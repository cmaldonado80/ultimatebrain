/**
 * Sandbox Command Audit — Security classification for shell commands.
 *
 * Inspired by DeerFlow's SandboxAuditMiddleware.
 * Classifies commands into three tiers:
 *   - BLOCK: Dangerous, irreversible, or data-destructive operations
 *   - WARN: Risky but potentially needed operations (logged with warning)
 *   - PASS: Safe operations (no intervention)
 *
 * Usage: Call auditCommand() before executing any shell command or SQL query.
 */

// ── Types ─────────────────────────────────────────────────────────────

export type AuditVerdict = 'pass' | 'warn' | 'block'

export interface AuditResult {
  verdict: AuditVerdict
  command: string
  reason: string | null
  matchedPattern: string | null
  timestamp: number
}

// ── Patterns ─────────────────────────────────────────────────────────

interface AuditPattern {
  pattern: RegExp
  label: string
}

/**
 * High-risk patterns — commands that are destructive, irreversible, or
 * provide unauthorized access. These are BLOCKED unconditionally.
 */
const BLOCK_PATTERNS: AuditPattern[] = [
  // Destructive file operations
  {
    pattern: /\brm\s+(-[a-z]*r|-[a-z]*f)+\s*[\/~]/i,
    label: 'recursive/forced delete on root paths',
  },
  { pattern: /\brm\s+-rf\s/i, label: 'rm -rf' },
  { pattern: /\bmkfs\b/i, label: 'filesystem format' },
  { pattern: /\bdd\s+.*of=\/dev\//i, label: 'dd to device' },
  // Command injection via download + execute
  { pattern: /\b(curl|wget)\b.*\|\s*(ba)?sh/i, label: 'remote code execution (curl|sh)' },
  { pattern: /\b(curl|wget)\b.*-o.*&&.*\bsh\b/i, label: 'download and execute' },
  // Sensitive file access
  { pattern: /\bcat\s+\/etc\/(shadow|passwd|sudoers)/i, label: 'sensitive file read' },
  // Process/system destruction
  { pattern: /\bkill\s+-9\s+-1\b/i, label: 'kill all processes' },
  { pattern: /\bshutdown\b/i, label: 'system shutdown' },
  { pattern: /\breboot\b/i, label: 'system reboot' },
  // Privilege escalation
  { pattern: /\bsudo\s+su\b/i, label: 'privilege escalation' },
  { pattern: /\bchmod\s+[0-7]*s/i, label: 'setuid/setgid change' },
  // Network exfiltration
  { pattern: /\bnc\s+-l/i, label: 'netcat listener' },
  // SQL destruction
  { pattern: /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i, label: 'SQL data destruction' },
  { pattern: /\bDELETE\s+FROM\s+\w+\s*(;|$)/i, label: 'DELETE without WHERE' },
  { pattern: /\bUPDATE\s+\w+\s+SET\s+.*(?:WHERE\s+1\s*=\s*1|;$)/i, label: 'UPDATE all rows' },
]

/**
 * Medium-risk patterns — operations that modify environment or could
 * have side effects, but are sometimes legitimately needed.
 * These are WARNED but allowed.
 */
const WARN_PATTERNS: AuditPattern[] = [
  { pattern: /\bchmod\s+777\b/i, label: 'world-writable permissions' },
  { pattern: /\bchown\b/i, label: 'ownership change' },
  { pattern: /\bpip\s+install\b/i, label: 'package installation (pip)' },
  { pattern: /\bnpm\s+install\b.*-g/i, label: 'global npm install' },
  { pattern: /\bapt(-get)?\s+install\b/i, label: 'system package install' },
  { pattern: /\byum\s+install\b/i, label: 'system package install (yum)' },
  { pattern: /\bcurl\b.*-[a-z]*o/i, label: 'file download' },
  { pattern: /\bwget\b/i, label: 'file download (wget)' },
  { pattern: /\bgit\s+push\b.*(-f|--force)/i, label: 'force push' },
  { pattern: /\bgit\s+reset\s+--hard\b/i, label: 'hard reset' },
  { pattern: /\benv\b.*=.*\bexport\b/i, label: 'environment variable modification' },
  { pattern: /\bALTER\s+TABLE\b/i, label: 'schema modification' },
  { pattern: /\bGRANT\b.*\bTO\b/i, label: 'permission grant' },
]

// ── Audit Function ──────────────────────────────────────────────────

/**
 * Classify a command before execution.
 *
 * @param command - The shell command or SQL query to audit
 * @returns AuditResult with verdict (pass/warn/block) and reason
 */
export function auditCommand(command: string): AuditResult {
  const normalized = command.replace(/\s+/g, ' ').trim()
  const timestamp = Date.now()

  // Check block patterns first (highest priority)
  for (const { pattern, label } of BLOCK_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        verdict: 'block',
        command: normalized.slice(0, 200),
        reason: `Blocked: ${label}`,
        matchedPattern: label,
        timestamp,
      }
    }
  }

  // Check warn patterns
  for (const { pattern, label } of WARN_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        verdict: 'warn',
        command: normalized.slice(0, 200),
        reason: `Warning: ${label}`,
        matchedPattern: label,
        timestamp,
      }
    }
  }

  // Default: pass
  return {
    verdict: 'pass',
    command: normalized.slice(0, 200),
    reason: null,
    matchedPattern: null,
    timestamp,
  }
}

/**
 * Quick check — returns true if command is safe to execute.
 * Blocks are rejected, warns are allowed with logging.
 */
export function isCommandSafe(command: string): boolean {
  return auditCommand(command).verdict !== 'block'
}
