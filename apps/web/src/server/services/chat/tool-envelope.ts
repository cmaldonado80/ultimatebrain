/**
 * Structured Tool Error Envelopes
 *
 * Stolen from Larksuite CLI's error handling pattern.
 * Every tool result gets a typed envelope with:
 * - code: machine-readable error classification
 * - message: human-readable description
 * - hint: what the agent should try next
 * - remediation: specific fix steps
 *
 * This helps agents self-correct instead of retrying blindly.
 */

// ── Error Codes ──────────────────────────────────────────────────────────

export type ToolErrorCode =
  | 'success'
  | 'validation_error' // bad input from agent
  | 'permission_denied' // tool not allowed by policy
  | 'resource_not_found' // entity doesn't exist
  | 'rate_limited' // too many calls
  | 'timeout' // execution took too long
  | 'sandbox_limit' // resource budget exhausted
  | 'dry_run' // preview only, not executed
  | 'blocked' // dangerous operation prevented
  | 'dependency_error' // upstream service failed
  | 'internal_error' // unexpected crash

// ── Envelope Types ───────────────────────────────────────────────────────

export interface ToolSuccess<T = unknown> {
  ok: true
  code: 'success'
  data: T
  durationMs: number
}

export interface ToolDryRun<T = unknown> {
  ok: true
  code: 'dry_run'
  preview: T
  message: string
  wouldAffect: string
}

export interface ToolError {
  ok: false
  code: ToolErrorCode
  message: string
  hint: string | null
  remediation: string | null
  tool: string
  input?: Record<string, unknown>
}

export type ToolEnvelope<T = unknown> = ToolSuccess<T> | ToolDryRun<T> | ToolError

// ── Builders ─────────────────────────────────────────────────────────────

export function toolSuccess<T>(data: T, durationMs: number): ToolSuccess<T> {
  return { ok: true, code: 'success', data, durationMs }
}

export function toolDryRun<T>(preview: T, wouldAffect: string): ToolDryRun<T> {
  return {
    ok: true,
    code: 'dry_run',
    preview,
    message: 'Dry run — no changes made. Approve to execute.',
    wouldAffect,
  }
}

export function toolError(
  code: ToolErrorCode,
  tool: string,
  message: string,
  hint?: string,
  remediation?: string,
  input?: Record<string, unknown>,
): ToolError {
  return {
    ok: false,
    code,
    message,
    hint: hint ?? null,
    remediation: remediation ?? null,
    tool,
    input,
  }
}

// ── Error Classification ─────────────────────────────────────────────────

const ERROR_PATTERNS: Array<{
  pattern: RegExp
  code: ToolErrorCode
  hint: string
  remediation: string
}> = [
  {
    pattern: /not found|404|does not exist|no such/i,
    code: 'resource_not_found',
    hint: 'The resource you referenced does not exist.',
    remediation: 'Verify the ID/name is correct, or list available resources first.',
  },
  {
    pattern: /permission|denied|unauthorized|403|forbidden/i,
    code: 'permission_denied',
    hint: 'You do not have access to this operation.',
    remediation: 'Check your tool access permissions or request elevated access.',
  },
  {
    pattern: /rate.?limit|429|too many|throttle/i,
    code: 'rate_limited',
    hint: 'Too many requests. Wait before retrying.',
    remediation: 'Wait 30 seconds, then retry. Reduce request frequency.',
  },
  {
    pattern: /timeout|timed? out|deadline|ETIMEDOUT/i,
    code: 'timeout',
    hint: 'The operation took too long.',
    remediation: 'Try with a smaller input, or break the task into smaller steps.',
  },
  {
    pattern: /invalid|validation|required|missing|malformed/i,
    code: 'validation_error',
    hint: 'The input parameters are invalid.',
    remediation: 'Check the tool schema for required fields and correct formats.',
  },
  {
    pattern: /ECONNREFUSED|ENOTFOUND|network|fetch failed/i,
    code: 'dependency_error',
    hint: 'An upstream service is unavailable.',
    remediation: 'This is a transient error. Wait and retry in 60 seconds.',
  },
]

/**
 * Classify a raw error string into a structured ToolError.
 */
export function classifyError(
  tool: string,
  rawError: string,
  input?: Record<string, unknown>,
): ToolError {
  for (const { pattern, code, hint, remediation } of ERROR_PATTERNS) {
    if (pattern.test(rawError)) {
      return toolError(code, tool, rawError, hint, remediation, input)
    }
  }

  return toolError(
    'internal_error',
    tool,
    rawError,
    'An unexpected error occurred.',
    'Report this error if it persists. Try a different approach.',
    input,
  )
}
