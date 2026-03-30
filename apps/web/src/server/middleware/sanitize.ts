/**
 * Input Sanitization — XSS prevention for tRPC inputs.
 *
 * Recursively sanitizes string values in tRPC procedure inputs to prevent
 * stored XSS attacks. HTML special characters are escaped before storage.
 *
 * Fields in SAFE_FIELDS are skipped (code content, prompts, etc. that
 * need to preserve special characters).
 */

/** Fields that should NOT be sanitized (code, prompts, template content). */
const SAFE_FIELDS = new Set([
  'soul',
  'content',
  'code',
  'handler',
  'template',
  'prompt',
  'system',
  'backstory',
  'htmlContent',
  'rawContent',
  'codeContent',
  'diff',
])

/** Escape HTML special characters to prevent XSS. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

/** Recursively sanitize all string values in an object, skipping safe fields. */
export function sanitizeInput<T>(input: T, parentKey?: string): T {
  if (input === null || input === undefined) return input
  if (typeof input === 'string') {
    // Skip safe fields
    if (parentKey && SAFE_FIELDS.has(parentKey)) return input
    return escapeHtml(input) as T
  }
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeInput(item, parentKey)) as T
  }
  if (typeof input === 'object') {
    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      sanitized[key] = sanitizeInput(value, key)
    }
    return sanitized as T
  }
  return input
}
