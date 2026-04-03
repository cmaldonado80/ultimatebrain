/**
 * Sandbox Policy Generator
 *
 * Generates sandbox policies from agent config, department rules,
 * and governance settings. Policies are composable: agent-level
 * policies inherit from department-level which inherit from org-level.
 *
 * Policy inheritance: Org → Department → Agent (most restrictive wins)
 */

import type { AuditResult, AuditVerdict } from '../chat/sandbox-audit'
import { auditCommand } from '../chat/sandbox-audit'

// ── Types ────────────────────────────────────────────────────────────────

export interface SandboxPolicy {
  id: string
  name: string
  scope: 'org' | 'department' | 'agent'
  scopeId: string // org/dept/agent ID

  // Tool allowlist/denylist
  allowedTools: string[] // empty = all allowed
  deniedTools: string[]

  // Command patterns
  blockedCommands: RegExp[]
  warnCommands: RegExp[]

  // Network rules
  allowedDomains: string[] // empty = all allowed
  deniedDomains: string[]
  maxRequestsPerMinute: number

  // File rules
  allowedPaths: string[] // glob patterns
  deniedPaths: string[]
  maxFileSizeBytes: number

  // Resource limits (override sandbox defaults)
  resourceOverrides: Partial<{
    maxMemoryMb: number
    maxCpuTimeMs: number
    maxFileOps: number
    maxNetworkCalls: number
    maxOutputBytes: number
    timeoutMs: number
  }>
}

export interface PolicyCheckResult {
  allowed: boolean
  verdict: AuditVerdict
  reason: string | null
  policy: string // which policy blocked/warned
}

// ── Declarative Policy Loading ────────────────────────────────────────────
// Policies loaded from JSON config files (stolen from ClawLess YAML pattern).
// This makes policies editable by non-engineers.

import departmentConfigs from './policies/departments.json'
import orgDefaultConfig from './policies/org-default.json'

function buildOrgDefault(): SandboxPolicy {
  return {
    id: orgDefaultConfig.id,
    name: orgDefaultConfig.name,
    scope: 'org',
    scopeId: 'brain',
    allowedTools: orgDefaultConfig.allowedTools,
    deniedTools: orgDefaultConfig.deniedTools,
    blockedCommands: [],
    warnCommands: [],
    allowedDomains: orgDefaultConfig.allowedDomains,
    deniedDomains: orgDefaultConfig.deniedDomains,
    maxRequestsPerMinute: orgDefaultConfig.maxRequestsPerMinute,
    allowedPaths: orgDefaultConfig.allowedPaths,
    deniedPaths: orgDefaultConfig.deniedPaths,
    maxFileSizeBytes: orgDefaultConfig.maxFileSizeBytes,
    resourceOverrides: orgDefaultConfig.resourceOverrides,
  }
}

const ORG_DEFAULT_POLICY: SandboxPolicy = buildOrgDefault()

const DEPARTMENT_POLICIES: Record<string, Partial<SandboxPolicy>> = Object.fromEntries(
  Object.entries(departmentConfigs as Record<string, Record<string, unknown>>).map(
    ([key, config]) => [
      key,
      {
        deniedTools: (config.deniedTools as string[]) ?? undefined,
        deniedDomains: (config.deniedDomains as string[]) ?? undefined,
        maxRequestsPerMinute: (config.maxRequestsPerMinute as number) ?? undefined,
        resourceOverrides: (config.resourceOverrides as Record<string, number>) ?? undefined,
      },
    ],
  ),
)

// ── Policy Engine ────────────────────────────────────────────────────────

export class SandboxPolicyEngine {
  private policies = new Map<string, SandboxPolicy>()

  constructor() {
    // Register org default
    this.policies.set('org_default', ORG_DEFAULT_POLICY)
  }

  /**
   * Generate a merged policy for an agent based on org → dept → agent hierarchy.
   */
  generatePolicy(
    agentId: string,
    agentName: string,
    departmentDomain?: string,
    agentOverrides?: Partial<SandboxPolicy>,
  ): SandboxPolicy {
    // Start with org default
    const orgPolicy = { ...ORG_DEFAULT_POLICY }

    // Layer department policy
    const deptOverrides = departmentDomain ? (DEPARTMENT_POLICIES[departmentDomain] ?? {}) : {}

    // Merge: most restrictive wins for denials, most permissive for allows
    const merged: SandboxPolicy = {
      id: `policy_${agentId.slice(0, 8)}`,
      name: `Policy: ${agentName}`,
      scope: 'agent',
      scopeId: agentId,
      allowedTools:
        agentOverrides?.allowedTools ?? deptOverrides.allowedTools ?? orgPolicy.allowedTools,
      deniedTools: [
        ...new Set([
          ...orgPolicy.deniedTools,
          ...(deptOverrides.deniedTools ?? []),
          ...(agentOverrides?.deniedTools ?? []),
        ]),
      ],
      blockedCommands: [...orgPolicy.blockedCommands, ...(agentOverrides?.blockedCommands ?? [])],
      warnCommands: [...orgPolicy.warnCommands, ...(agentOverrides?.warnCommands ?? [])],
      allowedDomains:
        agentOverrides?.allowedDomains ?? deptOverrides.allowedDomains ?? orgPolicy.allowedDomains,
      deniedDomains: [
        ...new Set([
          ...orgPolicy.deniedDomains,
          ...(deptOverrides.deniedDomains ?? []),
          ...(agentOverrides?.deniedDomains ?? []),
        ]),
      ],
      maxRequestsPerMinute: Math.min(
        orgPolicy.maxRequestsPerMinute,
        deptOverrides.maxRequestsPerMinute ?? Infinity,
        agentOverrides?.maxRequestsPerMinute ?? Infinity,
      ),
      allowedPaths: agentOverrides?.allowedPaths ?? orgPolicy.allowedPaths,
      deniedPaths: [...new Set([...orgPolicy.deniedPaths, ...(agentOverrides?.deniedPaths ?? [])])],
      maxFileSizeBytes: Math.min(
        orgPolicy.maxFileSizeBytes,
        agentOverrides?.maxFileSizeBytes ?? Infinity,
      ),
      resourceOverrides: {
        ...orgPolicy.resourceOverrides,
        ...deptOverrides.resourceOverrides,
        ...agentOverrides?.resourceOverrides,
      },
    }

    this.policies.set(merged.id, merged)
    return merged
  }

  /**
   * Check if a tool call is allowed by the policy.
   */
  checkTool(policy: SandboxPolicy, toolName: string): PolicyCheckResult {
    // Denied tools always block
    if (policy.deniedTools.includes(toolName)) {
      return {
        allowed: false,
        verdict: 'block',
        reason: `Tool '${toolName}' is denied by policy '${policy.name}'`,
        policy: policy.id,
      }
    }

    // Allowed tools whitelist (empty = all allowed)
    if (policy.allowedTools.length > 0 && !policy.allowedTools.includes(toolName)) {
      return {
        allowed: false,
        verdict: 'block',
        reason: `Tool '${toolName}' not in allowlist for policy '${policy.name}'`,
        policy: policy.id,
      }
    }

    return { allowed: true, verdict: 'pass', reason: null, policy: policy.id }
  }

  /**
   * Check if a command/query is allowed by the policy.
   * Layers policy patterns on top of the base sandbox-audit patterns.
   */
  checkCommand(policy: SandboxPolicy, command: string): PolicyCheckResult {
    // Base audit check first
    const baseAudit: AuditResult = auditCommand(command)
    if (baseAudit.verdict === 'block') {
      return {
        allowed: false,
        verdict: 'block',
        reason: baseAudit.reason,
        policy: 'base_audit',
      }
    }

    // Policy-specific blocked commands
    for (const pattern of policy.blockedCommands) {
      if (pattern.test(command)) {
        return {
          allowed: false,
          verdict: 'block',
          reason: `Command blocked by policy '${policy.name}'`,
          policy: policy.id,
        }
      }
    }

    // Policy-specific warn commands
    for (const pattern of policy.warnCommands) {
      if (pattern.test(command)) {
        return {
          allowed: true,
          verdict: 'warn',
          reason: `Command warned by policy '${policy.name}'`,
          policy: policy.id,
        }
      }
    }

    // Base audit warnings pass through
    if (baseAudit.verdict === 'warn') {
      return {
        allowed: true,
        verdict: 'warn',
        reason: baseAudit.reason,
        policy: 'base_audit',
      }
    }

    return { allowed: true, verdict: 'pass', reason: null, policy: policy.id }
  }

  /**
   * Check if a domain is allowed for network access.
   */
  checkDomain(policy: SandboxPolicy, domain: string): PolicyCheckResult {
    // Denied domains always block
    for (const denied of policy.deniedDomains) {
      const pattern = denied.replace(/\*/g, '.*')
      if (new RegExp(`^${pattern}$`, 'i').test(domain)) {
        return {
          allowed: false,
          verdict: 'block',
          reason: `Domain '${domain}' blocked by policy`,
          policy: policy.id,
        }
      }
    }

    // Allowed domains whitelist (empty = all allowed)
    if (policy.allowedDomains.length > 0) {
      const allowed = policy.allowedDomains.some((d) => {
        const pattern = d.replace(/\*/g, '.*')
        return new RegExp(`^${pattern}$`, 'i').test(domain)
      })
      if (!allowed) {
        return {
          allowed: false,
          verdict: 'block',
          reason: `Domain '${domain}' not in allowlist`,
          policy: policy.id,
        }
      }
    }

    return { allowed: true, verdict: 'pass', reason: null, policy: policy.id }
  }

  /**
   * Get a policy by ID.
   */
  getPolicy(id: string): SandboxPolicy | undefined {
    return this.policies.get(id)
  }

  /**
   * Get all registered policies.
   */
  getAllPolicies(): SandboxPolicy[] {
    return Array.from(this.policies.values())
  }
}
