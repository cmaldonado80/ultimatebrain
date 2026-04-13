import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TokenLedgerService } from '../token-ledger'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@solarc/db', () => ({
  tokenLedger: {
    entityId: 'entityId',
    agentId: 'agentId',
    model: 'model',
    provider: 'provider',
    tokensIn: 'tokensIn',
    tokensOut: 'tokensOut',
    costUsd: 'costUsd',
    period: 'period',
  },
  tokenBudgets: { entityId: 'entityId' },
  brainEngineUsage: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => args,
  gte: (col: string, val: unknown) => ({ gte: col, val }),
  lte: (col: string, val: unknown) => ({ lte: col, val }),
  sql: (...args: unknown[]) => args,
}))

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  const whereFn = vi.fn().mockResolvedValue([{ total: 0 }])
  const setFn = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })
  const valuesFn = vi.fn().mockResolvedValue(undefined)
  const fromFn = vi.fn().mockReturnValue({ where: whereFn })
  const groupByFn = vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue([]) })

  return {
    query: {
      tokenBudgets: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
    },
    insert: vi.fn().mockReturnValue({ values: valuesFn }),
    update: vi.fn().mockReturnValue({ set: setFn }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          groupBy: groupByFn,
        }),
      }),
    }),
    _mock: { whereFn, setFn, valuesFn, fromFn, groupByFn },
  } as unknown as ReturnType<typeof createMockDb>
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('TokenLedgerService', () => {
  let service: TokenLedgerService
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
    service = new TokenLedgerService(db)
  })

  // ── record ────────────────────────────────────────────────────────────

  describe('record', () => {
    it('should insert a token usage record', async () => {
      await service.record({
        entityId: 'entity-1',
        agentId: 'agent-1',
        model: 'gpt-4',
        provider: 'openai',
        tokensIn: 100,
        tokensOut: 50,
        costUsd: 0.005,
      })

      expect(db.insert).toHaveBeenCalled()
    })

    it('should also record to brainEngineUsage when entityId and provider are set', async () => {
      await service.record({
        entityId: 'entity-1',
        agentId: 'agent-1',
        model: 'gpt-4',
        provider: 'openai',
        tokensIn: 100,
        tokensOut: 50,
        costUsd: 0.005,
      })

      // insert called twice: tokenLedger + brainEngineUsage
      expect(db.insert).toHaveBeenCalledTimes(2)
    })

    it('should skip brainEngineUsage when entityId is missing', async () => {
      await service.record({
        model: 'gpt-4',
        provider: 'openai',
        tokensIn: 100,
        tokensOut: 50,
        costUsd: 0.005,
      })

      expect(db.insert).toHaveBeenCalledTimes(1)
    })

    it('should skip brainEngineUsage when provider is missing', async () => {
      await service.record({
        entityId: 'entity-1',
        tokensIn: 100,
        tokensOut: 50,
        costUsd: 0.005,
      })

      expect(db.insert).toHaveBeenCalledTimes(1)
    })
  })

  // ── checkBudget ───────────────────────────────────────────────────────

  describe('checkBudget', () => {
    it('should return non-overBudget status when no budget is set', async () => {
      db.query.tokenBudgets.findFirst.mockResolvedValue(undefined)
      // mock the Promise.all for daily/monthly selects
      const selectFromWhereFn = vi.fn().mockResolvedValue([{ total: 5.0 }])
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: selectFromWhereFn,
        }),
      })

      const status = await service.checkBudget('entity-1')

      expect(status.entityId).toBe('entity-1')
      expect(status.overBudget).toBe(false)
    })

    it('should return overBudget when daily limit exceeded with enforce', async () => {
      db.query.tokenBudgets.findFirst.mockResolvedValue({
        entityId: 'entity-1',
        dailyLimitUsd: 10,
        monthlyLimitUsd: 300,
        alertThreshold: 0.8,
        enforce: true,
      })
      const selectFromWhereFn = vi
        .fn()
        .mockResolvedValueOnce([{ total: 15.0 }]) // daily > 10
        .mockResolvedValueOnce([{ total: 50.0 }]) // monthly < 300
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: selectFromWhereFn,
        }),
      })

      const status = await service.checkBudget('entity-1')

      expect(status.overBudget).toBe(true)
      expect(status.dailySpent).toBe(15.0)
    })

    it('should trigger alert when spending exceeds threshold', async () => {
      db.query.tokenBudgets.findFirst.mockResolvedValue({
        entityId: 'entity-1',
        dailyLimitUsd: 10,
        monthlyLimitUsd: null,
        alertThreshold: 0.8,
        enforce: false,
      })
      const selectFromWhereFn = vi
        .fn()
        .mockResolvedValueOnce([{ total: 9.0 }]) // daily: 9/10 = 90%
        .mockResolvedValueOnce([{ total: 0 }])
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: selectFromWhereFn,
        }),
      })

      const status = await service.checkBudget('entity-1')

      expect(status.alertTriggered).toBe(true)
      expect(status.overBudget).toBe(false) // enforce is false
    })
  })

  // ── setBudget ─────────────────────────────────────────────────────────

  describe('setBudget', () => {
    it('should insert new budget when none exists', async () => {
      db.query.tokenBudgets.findFirst.mockResolvedValue(undefined)

      await service.setBudget('entity-1', { dailyLimitUsd: 10, monthlyLimitUsd: 300 })

      expect(db.insert).toHaveBeenCalled()
    })

    it('should update existing budget', async () => {
      db.query.tokenBudgets.findFirst.mockResolvedValue({ entityId: 'entity-1' })

      await service.setBudget('entity-1', { dailyLimitUsd: 20 })

      expect(db.update).toHaveBeenCalled()
    })
  })

  // ── usageSummary ──────────────────────────────────────────────────────

  describe('usageSummary', () => {
    it('should return usage summary with totals', async () => {
      const byModelResult = [
        {
          model: 'gpt-4',
          provider: 'openai',
          totalTokensIn: 500,
          totalTokensOut: 200,
          totalCost: 0.05,
          requests: 3,
        },
      ]
      const totalsResult = [
        { totalTokensIn: 500, totalTokensOut: 200, totalCost: 0.05, requests: 3 },
      ]

      // First select call: byModel (with groupBy)
      const groupByFn = vi.fn().mockResolvedValue(byModelResult)
      // Second select call: totals (no groupBy)
      db.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: groupByFn,
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(totalsResult),
          }),
        })

      const result = await service.usageSummary('entity-1')

      expect(result.byModel).toEqual(byModelResult)
      expect(result.totals).toEqual(totalsResult[0])
    })
  })

  // ── agentUsage ────────────────────────────────────────────────────────

  describe('agentUsage', () => {
    it('should return usage grouped by model for an agent', async () => {
      const mockResult = [
        { model: 'gpt-4', totalTokensIn: 100, totalTokensOut: 50, totalCost: 0.01, requests: 1 },
      ]
      const groupByFn = vi.fn().mockResolvedValue(mockResult)
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: groupByFn,
          }),
        }),
      })

      const result = await service.agentUsage('agent-1')

      expect(result).toEqual(mockResult)
    })
  })
})
