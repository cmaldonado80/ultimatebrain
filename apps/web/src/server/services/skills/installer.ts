/**
 * Skill Installer
 *
 * Validates SKILL.md format, sandboxes execution, and manages
 * the permission system for installed skills.
 */

import type { SkillCapability, SkillPermission } from './marketplace'

// ── SKILL.md Validation ─────────────────────────────────────────────────

export interface SkillManifest {
  name: string
  version: string
  description: string
  author: string
  permissions: SkillPermission[]
  /** Entry point handler function name */
  handler: string
  /** Optional trigger conditions */
  triggers?: string[]
  /** Input schema (JSON Schema subset) */
  inputSchema?: Record<string, unknown>
  /** Output schema */
  outputSchema?: Record<string, unknown>
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  manifest?: SkillManifest
}

/**
 * Parse and validate a SKILL.md content string.
 */
export function validateSkillMd(content: string): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!content.trim()) {
    return { valid: false, errors: ['SKILL.md is empty'], warnings }
  }

  // Check required sections
  const requiredSections = ['# ', '## Description', '## Permissions', '## Handler']
  for (const section of requiredSections) {
    if (!content.includes(section)) {
      errors.push(`Missing required section: ${section}`)
    }
  }

  // Extract name from H1
  const nameMatch = content.match(/^# (.+)$/m)
  if (!nameMatch) {
    errors.push('Missing skill name (H1 header)')
    return { valid: false, errors, warnings }
  }

  // Extract version
  const versionMatch = content.match(/\*\*Version\*\*:\s*(.+)/i) ?? content.match(/version:\s*(.+)/i)
  if (!versionMatch) warnings.push('No version specified, defaulting to 1.0.0')

  // Extract author
  const authorMatch = content.match(/\*\*Author\*\*:\s*(.+)/i) ?? content.match(/author:\s*(.+)/i)
  if (!authorMatch) warnings.push('No author specified')

  // Extract description
  const descMatch = content.match(/## Description\s*\n([\s\S]*?)(?=\n##|$)/)
  if (!descMatch) warnings.push('Empty description section')

  // Extract permissions
  const permissions = extractPermissions(content)
  if (permissions.length === 0) {
    warnings.push('No permissions declared — skill will have no capabilities')
  }

  // Extract handler
  const handlerMatch = content.match(/## Handler\s*\n```\w*\n([\s\S]*?)```/)
  const handler = handlerMatch ? handlerMatch[1].trim() : ''
  if (!handler) errors.push('Handler section is empty or missing code block')

  // Validate handler doesn't use dangerous patterns
  const dangerousPatterns = [
    { pattern: /process\.exit/g, msg: 'process.exit() is not allowed in skills' },
    { pattern: /require\s*\(\s*['"]child_process/g, msg: 'Direct child_process access is not allowed' },
    { pattern: /eval\s*\(/g, msg: 'eval() is not allowed in skills' },
    { pattern: /Function\s*\(/g, msg: 'Function constructor is not allowed' },
  ]

  for (const { pattern, msg } of dangerousPatterns) {
    if (pattern.test(handler)) {
      errors.push(msg)
    }
  }

  const manifest: SkillManifest = {
    name: nameMatch[1].trim(),
    version: versionMatch?.[1]?.trim() ?? '1.0.0',
    description: descMatch?.[1]?.trim() ?? '',
    author: authorMatch?.[1]?.trim() ?? 'Unknown',
    permissions,
    handler: 'execute',
    triggers: extractTriggers(content),
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    manifest,
  }
}

// ── Sandbox Execution ───────────────────────────────────────────────────

export interface SandboxContext {
  /** Approved capabilities for this execution */
  approvedCapabilities: Set<SkillCapability>
  /** Input data */
  input: Record<string, unknown>
  /** Timeout in milliseconds */
  timeoutMs: number
}

export interface SandboxResult {
  success: boolean
  output?: unknown
  error?: string
  durationMs: number
  capabilitiesUsed: SkillCapability[]
}

/**
 * Execute a skill handler in a sandboxed context.
 *
 * The sandbox:
 * - Runs in an isolated scope (no direct DB access)
 * - Only allows approved capabilities
 * - Enforces timeout
 * - Tracks which capabilities were actually used
 */
export async function executeSandboxed(
  handler: string,
  context: SandboxContext
): Promise<SandboxResult> {
  const start = Date.now()
  const capabilitiesUsed: SkillCapability[] = []

  // Build capability proxies that track usage
  const capabilities = buildCapabilityProxies(
    context.approvedCapabilities,
    capabilitiesUsed
  )

  try {
    // In production: use Node.js vm module or worker_threads with
    // restricted globals. Here we stub the execution.
    const result = await Promise.race([
      executeHandler(handler, context.input, capabilities),
      timeoutPromise(context.timeoutMs),
    ])

    return {
      success: true,
      output: result,
      durationMs: Date.now() - start,
      capabilitiesUsed,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
      capabilitiesUsed,
    }
  }
}

// ── Permission Checking ─────────────────────────────────────────────────

/**
 * Check if a set of requested permissions are all approved.
 */
export function checkPermissions(
  requested: SkillCapability[],
  approved: SkillCapability[]
): { allowed: boolean; denied: SkillCapability[] } {
  const approvedSet = new Set(approved)
  const denied = requested.filter((r) => !approvedSet.has(r))
  return { allowed: denied.length === 0, denied }
}

/**
 * Categorize permissions by risk level.
 */
export function categorizePermissions(
  permissions: SkillPermission[]
): { low: SkillPermission[]; medium: SkillPermission[]; high: SkillPermission[] } {
  const low: SkillPermission[] = []
  const medium: SkillPermission[] = []
  const high: SkillPermission[] = []

  for (const perm of permissions) {
    switch (perm.capability) {
      case 'file:read':
      case 'llm:invoke':
        low.push(perm)
        break
      case 'network:fetch':
      case 'network:websocket':
      case 'browser:navigate':
      case 'browser:screenshot':
      case 'db:read':
        medium.push(perm)
        break
      case 'file:write':
      case 'shell:execute':
        high.push(perm)
        break
      default:
        medium.push(perm)
    }
  }

  return { low, medium, high }
}

// ── Internals ───────────────────────────────────────────────────────────

function extractPermissions(content: string): SkillPermission[] {
  const permissions: SkillPermission[] = []
  const section = content.match(/## Permissions\s*\n([\s\S]*?)(?=\n##|$)/)
  if (!section) return permissions

  const lines = section[1].split('\n').filter((l) => l.trim().startsWith('-'))
  for (const line of lines) {
    const match = line.match(/-\s*`([^`]+)`[:\s]*(.*)/)
    if (match) {
      permissions.push({
        capability: match[1] as SkillCapability,
        reason: match[2].trim() || 'No reason provided',
      })
    }
  }

  return permissions
}

function extractTriggers(content: string): string[] {
  const section = content.match(/## Triggers\s*\n([\s\S]*?)(?=\n##|$)/)
  if (!section) return []

  return section[1]
    .split('\n')
    .filter((l) => l.trim().startsWith('-'))
    .map((l) => l.replace(/^-\s*/, '').trim())
    .filter(Boolean)
}

function buildCapabilityProxies(
  approved: Set<SkillCapability>,
  used: SkillCapability[]
): Record<string, (...args: unknown[]) => Promise<unknown>> {
  const proxies: Record<string, (...args: unknown[]) => Promise<unknown>> = {}

  const capabilityMap: Record<string, SkillCapability> = {
    readFile: 'file:read',
    writeFile: 'file:write',
    fetch: 'network:fetch',
    navigate: 'browser:navigate',
    screenshot: 'browser:screenshot',
    execute: 'shell:execute',
    queryDb: 'db:read',
    invokeLlm: 'llm:invoke',
  }

  for (const [name, capability] of Object.entries(capabilityMap)) {
    proxies[name] = async (...args: unknown[]) => {
      if (!approved.has(capability)) {
        throw new Error(`Permission denied: ${capability}`)
      }
      if (!used.includes(capability)) used.push(capability)
      // Stub — real impl delegates to actual capability handlers
      return { capability, args, result: 'stub' }
    }
  }

  return proxies
}

async function executeHandler(
  _handler: string,
  input: Record<string, unknown>,
  _capabilities: Record<string, (...args: unknown[]) => Promise<unknown>>
): Promise<unknown> {
  // Stub — real impl uses vm.runInNewContext or worker_threads
  return { executed: true, input }
}

function timeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Skill execution timed out after ${ms}ms`)), ms)
  )
}
