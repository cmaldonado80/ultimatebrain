import { describe, expect, it } from 'vitest'

import { generateDryRun, shouldDryRun } from '../tool-dryrun'
import { classifyError, toolDryRun, toolError, toolSuccess } from '../tool-envelope'
import {
  classifyTool,
  getTierSummary,
  getToolsByTier,
  isDestructive,
  requiresApproval,
  requiresPolicyCheck,
  supportsDryRun,
} from '../tool-tiers'

// ── Tool Envelope Tests ──────────────────────────────────────────────────

describe('Tool Envelopes (stolen from Larksuite)', () => {
  it('should create success envelope', () => {
    const result = toolSuccess({ count: 5 }, 100)
    expect(result.ok).toBe(true)
    expect(result.code).toBe('success')
    expect(result.data).toEqual({ count: 5 })
    expect(result.durationMs).toBe(100)
  })

  it('should create error envelope', () => {
    const result = toolError('permission_denied', 'docker_manage', 'Not allowed')
    expect(result.ok).toBe(false)
    expect(result.code).toBe('permission_denied')
    expect(result.tool).toBe('docker_manage')
  })

  it('should create dry-run envelope', () => {
    const result = toolDryRun({ action: 'delete' }, 'Would delete 3 rows')
    expect(result.ok).toBe(true)
    expect(result.code).toBe('dry_run')
    expect(result.wouldAffect).toBe('Would delete 3 rows')
  })

  describe('classifyError', () => {
    it('should classify 404 as resource_not_found', () => {
      const err = classifyError('db_query', 'Record not found')
      expect(err.code).toBe('resource_not_found')
      expect(err.hint).toContain('does not exist')
    })

    it('should classify permission errors', () => {
      const err = classifyError('shell_exec', 'Permission denied')
      expect(err.code).toBe('permission_denied')
    })

    it('should classify rate limits', () => {
      const err = classifyError('web_search', 'Error 429: Too Many Requests')
      expect(err.code).toBe('rate_limited')
      expect(err.hint).toContain('Wait')
    })

    it('should classify timeout', () => {
      const err = classifyError('web_scrape', 'Request timed out')
      expect(err.code).toBe('timeout')
    })

    it('should classify validation errors', () => {
      const err = classifyError('create_ticket', 'Missing required field: title')
      expect(err.code).toBe('validation_error')
    })

    it('should classify network errors', () => {
      const err = classifyError('web_search', 'fetch failed: ECONNREFUSED')
      expect(err.code).toBe('dependency_error')
      expect(err.remediation).toContain('transient')
    })

    it('should fallback to internal_error for unknown patterns', () => {
      const err = classifyError('custom_tool', 'Something weird happened')
      expect(err.code).toBe('internal_error')
    })
  })
})

// ── Tool Tiers Tests ─────────────────────────────────────────────────────

describe('Tool Tiers (stolen from Larksuite 3-layer)', () => {
  it('should classify safe tools', () => {
    const c = classifyTool('ephemeris_natal_chart')
    expect(c.tier).toBe('safe')
    expect(c.destructive).toBe(false)
    expect(c.networkAccess).toBe(false)
  })

  it('should classify privileged tools', () => {
    const c = classifyTool('web_search')
    expect(c.tier).toBe('privileged')
    expect(c.networkAccess).toBe(true)
  })

  it('should classify raw/admin tools', () => {
    const c = classifyTool('docker_manage')
    expect(c.tier).toBe('raw')
    expect(c.destructive).toBe(true)
  })

  it('should default unknown tools to privileged', () => {
    const c = classifyTool('unknown_tool_xyz')
    expect(c.tier).toBe('privileged')
  })

  it('should identify destructive tools', () => {
    expect(isDestructive('file_write')).toBe(true)
    expect(isDestructive('memory_search')).toBe(false)
  })

  it('should identify tools requiring policy check', () => {
    expect(requiresPolicyCheck('ephemeris_natal_chart')).toBe(false) // safe
    expect(requiresPolicyCheck('web_search')).toBe(true) // privileged
    expect(requiresPolicyCheck('docker_manage')).toBe(true) // raw
  })

  it('should identify tools requiring approval', () => {
    expect(requiresApproval('docker_manage')).toBe(true)
    expect(requiresApproval('web_search')).toBe(false)
  })

  it('should identify dry-runnable tools', () => {
    expect(supportsDryRun('file_write')).toBe(true)
    expect(supportsDryRun('web_search')).toBe(false)
  })

  it('should list tools by tier', () => {
    const safe = getToolsByTier('safe')
    const raw = getToolsByTier('raw')
    expect(safe.length).toBeGreaterThan(10)
    expect(raw).toContain('docker_manage')
    expect(raw).toContain('shell_exec')
  })

  it('should provide tier summary', () => {
    const summary = getTierSummary()
    expect(summary.safe).toBeGreaterThan(0)
    expect(summary.privileged).toBeGreaterThan(0)
    expect(summary.raw).toBeGreaterThan(0)
  })
})

// ── Dry-Run Tests ────────────────────────────────────────────────────────

describe('Dry-Run Mode (stolen from Larksuite --dry-run)', () => {
  it('should never dry-run safe tools', () => {
    expect(
      shouldDryRun('ephemeris_natal_chart', {
        agentCapabilityLevel: 'minimal',
        forcePreview: false,
      }),
    ).toBe(false)
  })

  it('should always dry-run raw tools', () => {
    expect(
      shouldDryRun('docker_manage', { agentCapabilityLevel: 'full', forcePreview: false }),
    ).toBe(true)
  })

  it('should dry-run destructive privileged tools when agent is degraded', () => {
    expect(
      shouldDryRun('file_write', { agentCapabilityLevel: 'reduced', forcePreview: false }),
    ).toBe(true)
    expect(shouldDryRun('file_write', { agentCapabilityLevel: 'full', forcePreview: false })).toBe(
      false,
    )
  })

  it('should dry-run when forcePreview is true', () => {
    expect(shouldDryRun('web_search', { agentCapabilityLevel: 'full', forcePreview: true })).toBe(
      true,
    )
  })

  it('should not dry-run non-dry-runnable tools', () => {
    expect(
      shouldDryRun('web_search', { agentCapabilityLevel: 'minimal', forcePreview: false }),
    ).toBe(false)
  })

  it('should generate dry-run preview for file_write', () => {
    const preview = generateDryRun('file_write', { path: '/tmp/test.txt', content: 'hello world' })
    expect(preview.code).toBe('dry_run')
    expect(preview.wouldAffect).toContain('WRITE')
    expect(preview.wouldAffect).toContain('/tmp/test.txt')
  })

  it('should generate dry-run preview for db_query', () => {
    const preview = generateDryRun('db_query', { sql: 'DELETE FROM users WHERE id = 1' })
    expect(preview.wouldAffect).toContain('destructive SQL')
  })

  it('should generate dry-run preview for slack_send_message', () => {
    const preview = generateDryRun('slack_send_message', {
      channel: '#general',
      text: 'Hello team!',
    })
    expect(preview.wouldAffect).toContain('Slack')
    expect(preview.wouldAffect).toContain('#general')
  })

  it('should truncate long inputs in preview', () => {
    const preview = generateDryRun('file_write', {
      path: '/tmp/test.txt',
      content: 'x'.repeat(500),
    })
    expect(JSON.stringify(preview.preview)).toContain('truncated')
  })
})
