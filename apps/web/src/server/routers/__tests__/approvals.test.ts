import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock DB layer
// ---------------------------------------------------------------------------

const mockFindMany = vi.fn()
const mockUpdateReturning = vi.fn()

function createMockDb() {
  return {
    query: {
      approvalGates: { findMany: mockFindMany },
    },
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: mockUpdateReturning,
        }),
      }),
    }),
  } as any
}

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

vi.mock('@solarc/db', () => ({
  approvalGates: { id: 'id', status: 'status' },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
}))

const { approvalsRouter } = await import('../approvals')

import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

const caller = (ctx: MockContext) => t.createCallerFactory(approvalsRouter as any)(ctx)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('approvals router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  describe('pending', () => {
    it('returns pending approval gates', async () => {
      const gates = [{ id: 'g1', status: 'pending' }]
      mockFindMany.mockResolvedValue(gates)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.pending()

      expect(mockFindMany).toHaveBeenCalled()
      expect(result).toEqual(gates)
    })

    it('rejects without a session (UNAUTHORIZED)', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.pending()).rejects.toThrow()
    })
  })

  describe('decide', () => {
    it('approves an approval gate', async () => {
      const gate = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'approved',
        decidedBy: 'admin',
      }
      mockUpdateReturning.mockResolvedValue([gate])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.decide({
        id: gate.id,
        status: 'approved',
        decidedBy: 'admin',
      })

      expect(result).toEqual(gate)
    })

    it('denies an approval gate with a reason', async () => {
      const gate = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'denied',
        reason: 'Not needed',
      }
      mockUpdateReturning.mockResolvedValue([gate])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.decide({
        id: gate.id,
        status: 'denied',
        decidedBy: 'admin',
        reason: 'Not needed',
      })

      expect(result).toEqual(gate)
    })

    it('throws when update returns empty', async () => {
      mockUpdateReturning.mockResolvedValue([undefined])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(
        trpc.decide({
          id: '550e8400-e29b-41d4-a716-446655440000',
          status: 'approved',
          decidedBy: 'admin',
        }),
      ).rejects.toThrow()
    })

    it('rejects non-uuid id', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(
        trpc.decide({ id: 'bad', status: 'approved', decidedBy: 'admin' }),
      ).rejects.toThrow()
    })

    it('rejects invalid status value', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(
        trpc.decide({
          id: '550e8400-e29b-41d4-a716-446655440000',
          status: 'maybe' as any,
          decidedBy: 'admin',
        }),
      ).rejects.toThrow()
    })
  })
})
