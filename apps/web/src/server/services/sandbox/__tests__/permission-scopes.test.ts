import { describe, expect, it } from 'vitest'

import { PermissionChecker } from '../permission-scopes'

describe('PermissionChecker (scope-based permissions)', () => {
  it('should initialize permissions for a role', () => {
    const checker = new PermissionChecker()
    const perms = checker.initializeForRole('agent-1', 'specialist')
    expect(perms.scopes.length).toBeGreaterThan(0)
    expect(perms.scopes.every((s) => s.granted)).toBe(true)
    expect(perms.scopes.every((s) => s.grantedBy === 'system')).toBe(true)
  })

  it('should allow tools matching agent scopes', () => {
    const checker = new PermissionChecker()
    checker.initializeForRole('agent-1', 'specialist')
    expect(checker.canUseTool('agent-1', 'memory_search').allowed).toBe(true)
    expect(checker.canUseTool('agent-1', 'web_search').allowed).toBe(true)
  })

  it('should deny tools requiring admin scopes for non-admin', () => {
    const checker = new PermissionChecker()
    checker.initializeForRole('agent-1', 'specialist')
    const result = checker.canUseTool('agent-1', 'docker_manage')
    expect(result.allowed).toBe(false)
    expect(result.missingScopes).toContain('tools:admin')
  })

  it('should allow admin tools for CEO', () => {
    const checker = new PermissionChecker()
    checker.initializeForRole('ceo-1', 'ceo')
    expect(checker.canUseTool('ceo-1', 'docker_manage').allowed).toBe(true)
  })

  it('should deny unknown agents', () => {
    const checker = new PermissionChecker()
    expect(checker.canUseTool('unknown', 'memory_search').allowed).toBe(false)
  })

  it('should grant a scope dynamically', () => {
    const checker = new PermissionChecker()
    checker.initializeForRole('agent-1', 'specialist')
    expect(checker.canUseTool('agent-1', 'docker_manage').allowed).toBe(false)
    checker.grantScope('agent-1', 'tools:admin', 'admin')
    expect(checker.canUseTool('agent-1', 'docker_manage').allowed).toBe(true)
  })

  it('should revoke a scope', () => {
    const checker = new PermissionChecker()
    checker.initializeForRole('agent-1', 'ceo')
    expect(checker.canUseTool('agent-1', 'docker_manage').allowed).toBe(true)
    checker.revokeScope('agent-1', 'tools:admin')
    expect(checker.canUseTool('agent-1', 'docker_manage').allowed).toBe(false)
  })

  it('should respect scope expiration', () => {
    const checker = new PermissionChecker()
    checker.initializeForRole('agent-1', 'specialist')
    // Grant with past expiration
    checker.grantScope('agent-1', 'tools:admin', 'admin', Date.now() - 1000)
    expect(checker.canUseTool('agent-1', 'docker_manage').allowed).toBe(false)
    // Grant with future expiration
    checker.grantScope('agent-1', 'tools:admin', 'admin', Date.now() + 60000)
    expect(checker.canUseTool('agent-1', 'docker_manage').allowed).toBe(true)
  })

  it('should find agents with a specific scope', () => {
    const checker = new PermissionChecker()
    checker.initializeForRole('agent-1', 'ceo')
    checker.initializeForRole('agent-2', 'specialist')
    const admins = checker.getAgentsWithScope('tools:admin')
    expect(admins).toContain('agent-1')
    expect(admins).not.toContain('agent-2')
  })

  it('should return correct scopes for tools', () => {
    expect(PermissionChecker.getScopesForTool('docker_manage')).toContain('tools:admin')
    expect(PermissionChecker.getScopesForTool('memory_search')).toContain('tools:read')
    expect(PermissionChecker.getScopesForTool('web_search')).toContain('network:external')
  })

  it('should return default scopes for roles', () => {
    const ceoScopes = PermissionChecker.getDefaultScopesForRole('ceo')
    expect(ceoScopes).toContain('tools:admin')
    const specScopes = PermissionChecker.getDefaultScopesForRole('specialist')
    expect(specScopes).not.toContain('tools:admin')
  })
})

describe('Permission Audit Trail', () => {
  it('should log initialization', () => {
    const checker = new PermissionChecker()
    checker.initializeForRole('agent-1', 'specialist')
    const trail = checker.getAuditTrail()
    expect(trail.length).toBeGreaterThan(0)
    expect(trail[0]!.action).toBe('initialize')
    expect(trail[0]!.agentId).toBe('agent-1')
    expect(trail[0]!.result).toBe('granted')
  })

  it('should log permission checks', () => {
    const checker = new PermissionChecker()
    checker.initializeForRole('agent-1', 'specialist')
    checker.canUseTool('agent-1', 'memory_search')
    checker.canUseTool('agent-1', 'docker_manage')

    const trail = checker.getAuditTrail()
    const checks = trail.filter((e) => e.action === 'check')
    expect(checks).toHaveLength(2)
    expect(checks[0]!.result).toBe('allowed')
    expect(checks[1]!.result).toBe('denied')
    expect(checks[1]!.detail).toContain('tools:admin')
  })

  it('should log grant and revoke', () => {
    const checker = new PermissionChecker()
    checker.initializeForRole('agent-1', 'specialist')
    checker.grantScope('agent-1', 'tools:admin', 'admin')
    checker.revokeScope('agent-1', 'tools:admin')

    const trail = checker.getAuditTrail()
    const grants = trail.filter((e) => e.action === 'grant')
    const revokes = trail.filter((e) => e.action === 'revoke')
    expect(grants).toHaveLength(1)
    expect(grants[0]!.result).toBe('granted')
    expect(revokes).toHaveLength(1)
    expect(revokes[0]!.result).toBe('revoked')
  })

  it('should filter audit by agent', () => {
    const checker = new PermissionChecker()
    checker.initializeForRole('agent-1', 'specialist')
    checker.initializeForRole('agent-2', 'ceo')
    checker.canUseTool('agent-1', 'memory_search')
    checker.canUseTool('agent-2', 'docker_manage')

    const agent1Trail = checker.getAgentAuditTrail('agent-1')
    const agent2Trail = checker.getAgentAuditTrail('agent-2')
    expect(agent1Trail.every((e) => e.agentId === 'agent-1')).toBe(true)
    expect(agent2Trail.every((e) => e.agentId === 'agent-2')).toBe(true)
  })

  it('should log denied checks for unknown agents', () => {
    const checker = new PermissionChecker()
    checker.canUseTool('unknown-agent', 'web_search')
    const trail = checker.getAuditTrail()
    expect(trail).toHaveLength(1)
    expect(trail[0]!.result).toBe('denied')
    expect(trail[0]!.detail).toBe('Unknown agent')
  })

  it('should respect audit limit', () => {
    const checker = new PermissionChecker()
    const trail = checker.getAuditTrail(5)
    expect(trail.length).toBeLessThanOrEqual(5)
  })
})
