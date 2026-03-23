import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryService } from '../memory-service'
import type { EmbedFunction } from '../memory-service'

// --- Mock helpers ---

function createMockDb() {
  const tx = {
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }

  return {
    query: {
      memories: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      cognitiveCandidates: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        groupBy: vi.fn().mockResolvedValue([]),
      }),
    }),
    transaction: vi.fn(async (fn: (tx: typeof tx) => Promise<void>) => {
      await fn(tx as any)
    }),
    _tx: tx,
  } as any
}

describe('MemoryService', () => {
  let db: ReturnType<typeof createMockDb>
  let service: MemoryService

  beforeEach(() => {
    db = createMockDb()
    service = new MemoryService(db)
  })

  describe('store', () => {
    it('should store a memory with default tier "recall"', async () => {
      const storedMem = { id: 'mem-1', key: 'test-key', content: 'hello', tier: 'recall' }
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([storedMem]),
        }),
      })

      const result = await service.store({ key: 'test-key', content: 'hello' })

      expect(result).toEqual(storedMem)
      expect(db.insert).toHaveBeenCalled()
    })

    it('should auto-embed when an embed function is set', async () => {
      const storedMem = { id: 'mem-2', key: 'k', content: 'data', tier: 'recall' }
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([storedMem]),
        }),
      })

      const mockEmbed: EmbedFunction = vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
      service.setEmbedFunction(mockEmbed)

      await service.store({ key: 'k', content: 'data' })

      expect(mockEmbed).toHaveBeenCalledWith('data')
      // Second insert call is for the vector
      expect(db.insert).toHaveBeenCalledTimes(2)
    })

    it('should store without vector if embedding fails', async () => {
      const storedMem = { id: 'mem-3', key: 'k', content: 'data', tier: 'recall' }
      db.insert
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([storedMem]),
          }),
        })

      const mockEmbed: EmbedFunction = vi.fn().mockRejectedValue(new Error('embedding failed'))
      service.setEmbedFunction(mockEmbed)

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = await service.store({ key: 'k', content: 'data' })

      expect(result).toEqual(storedMem)
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('search (keyword fallback)', () => {
    it('should return scored results from keyword search when no embed function is set', async () => {
      db.query.memories.findMany.mockResolvedValue([
        { id: '1', key: 'project-setup', content: 'How to setup the project environment', tier: 'recall', createdAt: new Date() },
        { id: '2', key: 'deploy-guide', content: 'Guide for deployment to production', tier: 'recall', createdAt: new Date() },
        { id: '3', key: 'cooking-recipe', content: 'Chocolate cake recipe', tier: 'archival', createdAt: new Date() },
      ])

      const results = await service.search('project setup')

      expect(results.length).toBeGreaterThanOrEqual(1)
      // The first result should match "project" and "setup"
      expect(results[0]!.key).toBe('project-setup')
      expect(results[0]!.score).toBeGreaterThan(0)
    })

    it('should return empty results when no memories match', async () => {
      db.query.memories.findMany.mockResolvedValue([
        { id: '1', key: 'unrelated', content: 'Totally unrelated content', tier: 'recall', createdAt: new Date() },
      ])

      const results = await service.search('quantum physics')

      expect(results).toEqual([])
    })
  })

  describe('processPromotions', () => {
    it('should promote a recall memory with sufficient confidence to core', async () => {
      db.query.cognitiveCandidates.findMany.mockResolvedValue([
        { id: 'cand-1', memoryId: 'mem-1', status: 'pending' },
      ])
      db.query.memories.findFirst.mockResolvedValue({
        id: 'mem-1',
        key: 'important-fact',
        content: 'Critical business rule',
        tier: 'recall',
        confidence: 0.9, // Exceeds core threshold of 0.85
      })

      const result = await service.processPromotions()

      expect(result.promoted).toBe(1)
      expect(result.rejected).toBe(0)
      // updateTier should have been called to promote to 'core'
      expect(db.update).toHaveBeenCalled()
    })

    it('should reject a candidate when memory has insufficient confidence', async () => {
      db.query.cognitiveCandidates.findMany.mockResolvedValue([
        { id: 'cand-2', memoryId: 'mem-2', status: 'pending' },
      ])
      db.query.memories.findFirst.mockResolvedValue({
        id: 'mem-2',
        key: 'low-confidence',
        content: 'Some content',
        tier: 'recall',
        confidence: 0.5, // Below core threshold of 0.85
      })

      const result = await service.processPromotions()

      expect(result.promoted).toBe(0)
      expect(result.rejected).toBe(1)
    })

    it('should reject a candidate with no memoryId', async () => {
      db.query.cognitiveCandidates.findMany.mockResolvedValue([
        { id: 'cand-3', memoryId: null, status: 'pending' },
      ])

      const result = await service.processPromotions()

      expect(result.promoted).toBe(0)
      expect(result.rejected).toBe(1)
    })
  })
})
