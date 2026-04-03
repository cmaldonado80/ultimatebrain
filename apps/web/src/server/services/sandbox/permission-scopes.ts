/**
 * Scope-Based Permission System
 *
 * Replaces flat toolAccess arrays with granular, auditable scopes.
 * Inspired by OAuth 2.0 scope model (from Larksuite CLI review).
 *
 * Scopes follow the pattern: domain:action
 *   tools:read       — read-only tools (file_read, memory_search)
 *   tools:write      — write tools (file_write, memory_store)
 *   tools:execute    — execution tools (workflow_execute, run_tests)
 *   tools:admin      — admin tools (docker_manage, shell_exec)
 *   network:internal — internal API calls
 *   network:external — external HTTP requests
 *   data:query       — database queries
 *   data:mutate      — database mutations
 *   comms:send       — send messages (Slack, Notion)
 *   system:heal      — healing/recovery actions
 */

// ── Types ────────────────────────────────────────────────────────────────

export type PermissionScope =
  | 'tools:read'
  | 'tools:write'
  | 'tools:execute'
  | 'tools:admin'
  | 'network:internal'
  | 'network:external'
  | 'data:query'
  | 'data:mutate'
  | 'comms:send'
  | 'system:heal'

export interface ScopeGrant {
  scope: PermissionScope
  granted: boolean
  grantedBy: 'system' | 'admin' | 'department_head'
  expiresAt?: number
}

export interface AgentPermissions {
  agentId: string
  scopes: ScopeGrant[]
}

// ── Tool → Scope Mapping ─────────────────────────────────────────────────

const TOOL_SCOPE_MAP: Record<string, PermissionScope[]> = {
  // Read-only tools → tools:read
  memory_search: ['tools:read'],
  file_read: ['tools:read'],
  file_list: ['tools:read'],
  file_exists: ['tools:read'],

  // Ephemeris (compute-only) → tools:read
  ephemeris_natal_chart: ['tools:read'],
  ephemeris_current_transits: ['tools:read'],
  ephemeris_synastry: ['tools:read'],
  ephemeris_solar_return: ['tools:read'],
  ephemeris_transit_calendar: ['tools:read'],
  ephemeris_moon_phase: ['tools:read'],
  ephemeris_houses: ['tools:read'],
  ephemeris_annual_profections: ['tools:read'],
  ephemeris_panchanga: ['tools:read'],
  ephemeris_vimshottari_dasha: ['tools:read'],
  ephemeris_secondary_progressions: ['tools:read'],
  ephemeris_arabic_parts: ['tools:read'],
  ephemeris_aspect_patterns: ['tools:read'],
  ephemeris_firdaria: ['tools:read'],
  ephemeris_fixed_stars: ['tools:read'],
  ephemeris_fixed_star_conjunctions: ['tools:read'],
  ephemeris_dispositor_chain: ['tools:read'],
  ephemeris_midpoints: ['tools:read'],
  ephemeris_lunar_return: ['tools:read'],
  ephemeris_medical: ['tools:read'],
  ephemeris_natal_report: ['tools:read'],

  // Write tools → tools:write
  memory_store: ['tools:write'],
  file_write: ['tools:write'],
  create_ticket: ['tools:write'],
  create_project: ['tools:write'],

  // Network tools
  web_search: ['network:external'],
  web_scrape: ['network:external'],
  deep_research: ['network:external'],
  vision_analyze: ['network:external'],

  // Database tools
  db_query: ['data:query'],

  // Communication tools
  notion_create_page: ['comms:send', 'network:external'],
  notion_update_page: ['comms:send', 'network:external'],
  slack_send_message: ['comms:send', 'network:external'],

  // Execution tools
  workflow_execute: ['tools:execute'],
  git_operations: ['tools:write', 'network:external'],
  render_preview: ['tools:execute'],

  // Admin tools
  docker_manage: ['tools:admin'],
  shell_exec: ['tools:admin'],
  run_tests: ['tools:execute'],
}

// ── Role → Default Scopes ────────────────────────────────────────────────

const ROLE_DEFAULT_SCOPES: Record<string, PermissionScope[]> = {
  ceo: [
    'tools:read',
    'tools:write',
    'tools:execute',
    'tools:admin',
    'network:internal',
    'network:external',
    'data:query',
    'data:mutate',
    'comms:send',
    'system:heal',
  ],
  department_head: [
    'tools:read',
    'tools:write',
    'tools:execute',
    'network:internal',
    'network:external',
    'data:query',
    'comms:send',
  ],
  specialist: ['tools:read', 'tools:write', 'network:internal', 'network:external', 'data:query'],
  monitor: ['tools:read', 'network:internal', 'data:query', 'system:heal'],
  healer: [
    'tools:read',
    'tools:write',
    'network:internal',
    'data:query',
    'data:mutate',
    'system:heal',
  ],
}

// ── Permission Audit Trail ────────────────────────────────────────────────

export interface PermissionAuditEntry {
  timestamp: number
  agentId: string
  action: 'check' | 'grant' | 'revoke' | 'initialize'
  scope: string
  result: 'allowed' | 'denied' | 'granted' | 'revoked'
  detail?: string
}

const MAX_AUDIT_ENTRIES = 500

// ── Permission Checker ───────────────────────────────────────────────────

export class PermissionChecker {
  private agentPermissions = new Map<string, AgentPermissions>()
  private auditTrail: PermissionAuditEntry[] = []

  /**
   * Initialize permissions for an agent based on their role.
   */
  initializeForRole(agentId: string, role: string): AgentPermissions {
    const defaultScopes = ROLE_DEFAULT_SCOPES[role] ?? ROLE_DEFAULT_SCOPES['specialist']!
    const grants: ScopeGrant[] = defaultScopes.map((scope) => ({
      scope,
      granted: true,
      grantedBy: 'system' as const,
    }))

    const permissions: AgentPermissions = { agentId, scopes: grants }
    this.agentPermissions.set(agentId, permissions)
    this.audit({
      agentId,
      action: 'initialize',
      scope: role,
      result: 'granted',
      detail: `${grants.length} scopes`,
    })
    return permissions
  }

  /**
   * Check if an agent has permission to use a tool.
   */
  canUseTool(
    agentId: string,
    toolName: string,
  ): { allowed: boolean; missingScopes: PermissionScope[] } {
    const requiredScopes = TOOL_SCOPE_MAP[toolName] ?? ['tools:read']
    const permissions = this.agentPermissions.get(agentId)

    if (!permissions) {
      this.audit({
        agentId,
        action: 'check',
        scope: toolName,
        result: 'denied',
        detail: 'Unknown agent',
      })
      return { allowed: false, missingScopes: requiredScopes }
    }

    const now = Date.now()
    const grantedScopes = new Set(
      permissions.scopes
        .filter((g) => g.granted && (!g.expiresAt || g.expiresAt > now))
        .map((g) => g.scope),
    )

    const missing = requiredScopes.filter((s) => !grantedScopes.has(s))
    const allowed = missing.length === 0
    this.audit({
      agentId,
      action: 'check',
      scope: toolName,
      result: allowed ? 'allowed' : 'denied',
      detail: allowed ? undefined : `Missing: ${missing.join(', ')}`,
    })
    return { allowed, missingScopes: missing }
  }

  /**
   * Grant a scope to an agent.
   */
  grantScope(
    agentId: string,
    scope: PermissionScope,
    grantedBy: ScopeGrant['grantedBy'],
    expiresAt?: number,
  ) {
    const permissions = this.agentPermissions.get(agentId)
    if (!permissions) return

    // Remove existing grant for this scope
    permissions.scopes = permissions.scopes.filter((g) => g.scope !== scope)
    permissions.scopes.push({ scope, granted: true, grantedBy, expiresAt })
    this.audit({ agentId, action: 'grant', scope, result: 'granted', detail: `By ${grantedBy}` })
  }

  /**
   * Revoke a scope from an agent.
   */
  revokeScope(agentId: string, scope: PermissionScope) {
    const permissions = this.agentPermissions.get(agentId)
    if (!permissions) return

    permissions.scopes = permissions.scopes.filter((g) => g.scope !== scope)
    permissions.scopes.push({ scope, granted: false, grantedBy: 'admin' })
    this.audit({ agentId, action: 'revoke', scope, result: 'revoked' })
  }

  /**
   * Get all permissions for an agent.
   */
  getPermissions(agentId: string): AgentPermissions | undefined {
    return this.agentPermissions.get(agentId)
  }

  /**
   * Get all agents with a specific scope.
   */
  getAgentsWithScope(scope: PermissionScope): string[] {
    const result: string[] = []
    for (const [agentId, permissions] of this.agentPermissions) {
      if (permissions.scopes.some((g) => g.scope === scope && g.granted)) {
        result.push(agentId)
      }
    }
    return result
  }

  /**
   * Get required scopes for a tool.
   */
  static getScopesForTool(toolName: string): PermissionScope[] {
    return TOOL_SCOPE_MAP[toolName] ?? ['tools:read']
  }

  /**
   * Get default scopes for a role.
   */
  static getDefaultScopesForRole(role: string): PermissionScope[] {
    return ROLE_DEFAULT_SCOPES[role] ?? ROLE_DEFAULT_SCOPES['specialist']!
  }

  /**
   * Get the permission audit trail.
   */
  getAuditTrail(limit = 50): PermissionAuditEntry[] {
    return this.auditTrail.slice(-limit)
  }

  /**
   * Get audit entries for a specific agent.
   */
  getAgentAuditTrail(agentId: string, limit = 50): PermissionAuditEntry[] {
    return this.auditTrail.filter((e) => e.agentId === agentId).slice(-limit)
  }

  private audit(entry: Omit<PermissionAuditEntry, 'timestamp'>) {
    this.auditTrail.push({ ...entry, timestamp: Date.now() })
    while (this.auditTrail.length > MAX_AUDIT_ENTRIES) this.auditTrail.shift()
  }
}
