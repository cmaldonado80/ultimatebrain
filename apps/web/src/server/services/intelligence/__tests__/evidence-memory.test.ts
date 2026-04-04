import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EvidenceMemoryPipeline } from '../evidence-memory'

// ── Tests ───────────────────────────────────────────────────────────────────

describe('EvidenceMemoryPipeline', () => {
  let pipeline: EvidenceMemoryPipeline

  beforeEach(() => {
    pipeline = new EvidenceMemoryPipeline()
  })

  // ── recordHealingOutcome ────────────────────────────────────────────────

  describe('recordHealingOutcome', () => {
    it('should enqueue with correct key format and tier', () => {
      const record = pipeline.recordHealingOutcome({
        action: 'restart',
        target: 'agent-1',
        success: true,
        reason: 'Agent was unresponsive',
      })

      expect(record.source).toBe('healing')
      expect(record.key).toBe('healing:restart:agent-1')
      expect(record.tier).toBe('recall') // success = recall
      expect(record.confidence).toBe(0.7)
      expect(record.content).toContain('SUCCESS')
      expect(pipeline.getQueue()).toHaveLength(1)
    })

    it('should assign "core" tier to failed outcomes', () => {
      const record = pipeline.recordHealingOutcome({
        action: 'restart',
        target: 'agent-1',
        success: false,
        reason: 'Timeout',
      })

      expect(record.tier).toBe('core')
      expect(record.confidence).toBe(0.9)
      expect(record.content).toContain('FAILED')
    })
  })

  // ── recordVerification ─────────────────────────────────────────────────

  describe('recordVerification', () => {
    it('should enqueue verification records', () => {
      const record = pipeline.recordVerification({
        passed: true,
        score: 0.95,
        summary: 'All checks passed',
        agentId: 'agent-1',
      })

      expect(record.source).toBe('verification')
      expect(record.key).toMatch(/^verify:\d+$/)
      expect(record.tier).toBe('recall')
      expect(record.confidence).toBe(0.95)
      expect(record.agentId).toBe('agent-1')
      expect(record.content).toContain('PASSED')
      expect(pipeline.getQueue()).toHaveLength(1)
    })

    it('should assign "core" tier to failed verifications', () => {
      const record = pipeline.recordVerification({
        passed: false,
        score: 0.3,
        summary: 'Check failed',
      })

      expect(record.tier).toBe('core')
      expect(record.content).toContain('FAILED')
    })
  })

  // ── recordTicketCompletion ─────────────────────────────────────────────

  describe('recordTicketCompletion', () => {
    it('should enqueue ticket records', () => {
      const record = pipeline.recordTicketCompletion({
        title: 'Fix login bug',
        summary: 'Resolved null pointer in auth flow',
        agentId: 'agent-2',
        workspaceId: 'ws-1',
      })

      expect(record.source).toBe('ticket')
      expect(record.key).toBe('ticket:Fix login bug')
      expect(record.tier).toBe('recall')
      expect(record.confidence).toBe(0.8)
      expect(record.agentId).toBe('agent-2')
      expect(record.workspaceId).toBe('ws-1')
      expect(pipeline.getQueue()).toHaveLength(1)
    })
  })

  // ── recordInstinctPromotion ────────────────────────────────────────────

  describe('recordInstinctPromotion', () => {
    it('should enqueue with "core" tier', () => {
      const record = pipeline.recordInstinctPromotion({
        trigger: 'high error rate detected',
        action: 'throttle requests',
        confidence: 0.85,
      })

      expect(record.source).toBe('instinct')
      expect(record.key).toMatch(/^instinct:/)
      expect(record.tier).toBe('core')
      expect(record.confidence).toBe(0.85)
      expect(record.content).toContain('Learned pattern')
      expect(pipeline.getQueue()).toHaveLength(1)
    })
  })

  // ── recordCriticalRule ─────────────────────────────────────────────────

  describe('recordCriticalRule', () => {
    it('should enqueue with "critical" tier', () => {
      const record = pipeline.recordCriticalRule({
        key: 'no-hallucination',
        content: 'Never invent system topology',
        reason: 'Anti-hallucination safety',
      })

      expect(record.source).toBe('operator')
      expect(record.key).toBe('critical:no-hallucination')
      expect(record.tier).toBe('critical')
      expect(record.confidence).toBe(1.0)
      expect(pipeline.getQueue()).toHaveLength(1)
    })
  })

  // ── flush ──────────────────────────────────────────────────────────────

  describe('flush', () => {
    it('should write all queued items to memory store and clear queue', async () => {
      const storeFn = vi.fn().mockResolvedValue(undefined)
      const memoryStore = { store: storeFn }

      pipeline.recordHealingOutcome({
        action: 'restart',
        target: 'a1',
        success: true,
        reason: 'ok',
      })
      pipeline.recordCriticalRule({
        key: 'rule1',
        content: 'test rule',
        reason: 'test',
      })

      expect(pipeline.getQueue()).toHaveLength(2)

      const written = await pipeline.flush(memoryStore)

      expect(written).toBe(2)
      expect(storeFn).toHaveBeenCalledTimes(2)
      expect(pipeline.getQueue()).toHaveLength(0)
    })

    it('should return 0 without a store', async () => {
      pipeline.recordHealingOutcome({
        action: 'restart',
        target: 'a1',
        success: true,
        reason: 'ok',
      })

      const written = await pipeline.flush()
      expect(written).toBe(0)
    })

    it('should return 0 with empty queue', async () => {
      const memoryStore = { store: vi.fn().mockResolvedValue(undefined) }
      const written = await pipeline.flush(memoryStore)
      expect(written).toBe(0)
    })

    it('should handle store errors gracefully', async () => {
      const storeFn = vi.fn().mockRejectedValue(new Error('write failed'))
      const memoryStore = { store: storeFn }

      pipeline.recordHealingOutcome({
        action: 'restart',
        target: 'a1',
        success: true,
        reason: 'ok',
      })

      const written = await pipeline.flush(memoryStore)
      expect(written).toBe(0)
      expect(pipeline.getQueue()).toHaveLength(0) // queue is still cleared
    })
  })

  // ── getQueue and getLog ────────────────────────────────────────────────

  describe('getQueue and getLog', () => {
    it('should return current queue contents', () => {
      expect(pipeline.getQueue()).toHaveLength(0)

      pipeline.recordHealingOutcome({
        action: 'restart',
        target: 'a1',
        success: true,
        reason: 'ok',
      })

      const queue = pipeline.getQueue()
      expect(queue).toHaveLength(1)
      expect(queue[0]!.source).toBe('healing')
    })

    it('should return a copy of the queue (not a reference)', () => {
      pipeline.recordHealingOutcome({
        action: 'restart',
        target: 'a1',
        success: true,
        reason: 'ok',
      })

      const queue = pipeline.getQueue()
      queue.pop()
      expect(pipeline.getQueue()).toHaveLength(1) // original unaffected
    })

    it('should return recent log entries', () => {
      pipeline.recordHealingOutcome({
        action: 'a1',
        target: 't1',
        success: true,
        reason: 'r1',
      })
      pipeline.recordCriticalRule({
        key: 'k1',
        content: 'c1',
        reason: 'r1',
      })

      const log = pipeline.getLog()
      expect(log).toHaveLength(2)
    })

    it('should respect getLog limit', () => {
      for (let i = 0; i < 10; i++) {
        pipeline.recordHealingOutcome({
          action: `a${i}`,
          target: `t${i}`,
          success: true,
          reason: 'ok',
        })
      }

      const log = pipeline.getLog(3)
      expect(log).toHaveLength(3)
    })
  })

  // ── buildInfluence (static) ────────────────────────────────────────────

  describe('buildInfluence', () => {
    it('should return correct shape with no memories and no snapshots', () => {
      const influence = EvidenceMemoryPipeline.buildInfluence([], [])

      expect(influence.used).toBe(false)
      expect(influence.influenceLevel).toBe('none')
      expect(influence.memoryCount).toBe(0)
      expect(influence.memoryTiers).toEqual([])
      expect(influence.truthSnapshotsUsed).toEqual([])
      expect(influence.explanation).toContain('without memory')
    })

    it('should return "low" influence with few memories', () => {
      const influence = EvidenceMemoryPipeline.buildInfluence([{ tier: 'recall' }], ['workspace'])

      expect(influence.used).toBe(true)
      expect(influence.influenceLevel).toBe('low')
      expect(influence.memoryCount).toBe(1)
      expect(influence.memoryTiers).toEqual(['recall'])
    })

    it('should return "medium" influence with core memories or >2 count', () => {
      const influence = EvidenceMemoryPipeline.buildInfluence(
        [{ tier: 'core' }, { tier: 'recall' }],
        ['workspace'],
      )

      expect(influence.influenceLevel).toBe('medium')
    })

    it('should return "high" influence with critical memories or >5 count', () => {
      const influence = EvidenceMemoryPipeline.buildInfluence([{ tier: 'critical' }], ['workspace'])

      expect(influence.influenceLevel).toBe('high')
    })

    it('should return "high" influence with more than 5 memories', () => {
      const memories = Array.from({ length: 6 }, () => ({ tier: 'recall' }))
      const influence = EvidenceMemoryPipeline.buildInfluence(memories, [])

      expect(influence.influenceLevel).toBe('high')
      expect(influence.memoryCount).toBe(6)
    })

    it('should deduplicate memory tiers', () => {
      const influence = EvidenceMemoryPipeline.buildInfluence(
        [{ tier: 'recall' }, { tier: 'recall' }, { tier: 'core' }],
        [],
      )

      expect(influence.memoryTiers).toEqual(['recall', 'core'])
    })

    it('should report "used" when only snapshots are present', () => {
      const influence = EvidenceMemoryPipeline.buildInfluence([], ['workspace', 'health'])

      expect(influence.used).toBe(true)
      expect(influence.influenceLevel).toBe('none')
      expect(influence.explanation).toContain('runtime snapshots')
    })
  })
})
