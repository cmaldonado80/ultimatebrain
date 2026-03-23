import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock DB layer
// ---------------------------------------------------------------------------

function createMockDb() {
  return {} as any
}

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

vi.mock('@solarc/db', () => ({
  default: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
}))

const mockDetectMode = vi.fn()
const mockSetMode = vi.fn()
const mockRoute = vi.fn()
const mockExecuteQuick = vi.fn()
const mockExecuteAutonomous = vi.fn()
const mockStartDeepWork = vi.fn()

vi.mock('../../services/task-runner/mode-router', () => ({
  ModeRouter: vi.fn().mockImplementation(() => ({
    detectMode: mockDetectMode,
    setMode: mockSetMode,
    route: mockRoute,
    executeQuick: mockExecuteQuick,
    executeAutonomous: mockExecuteAutonomous,
    startDeepWork: mockStartDeepWork,
    executeDeepWork: vi.fn(),
  })),
}))

const { taskRunnerRouter } = await import('../task-runner')

import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

const caller = (ctx: MockContext) =>
  t.createCallerFactory(taskRunnerRouter as any)(ctx)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const UUID = '550e8400-e29b-41d4-a716-446655440000'

describe('task-runner router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  describe('detectMode', () => {
    it('auto-detects execution mode for a ticket', async () => {
      mockDetectMode.mockResolvedValue('quick')

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.detectMode({ ticketId: UUID })

      expect(mockDetectMode).toHaveBeenCalledWith(UUID)
      expect(result).toEqual({ mode: 'quick' })
    })

    it('rejects non-uuid ticketId', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.detectMode({ ticketId: 'bad' })).rejects.toThrow()
    })
  })

  describe('setMode', () => {
    it('sets execution mode on a ticket', async () => {
      mockSetMode.mockResolvedValue(undefined)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.setMode({ ticketId: UUID, mode: 'autonomous' })

      expect(mockSetMode).toHaveBeenCalledWith(UUID, 'autonomous')
      expect(result).toEqual({ success: true })
    })

    it('rejects invalid mode', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(
        trpc.setMode({ ticketId: UUID, mode: 'invalid' as any }),
      ).rejects.toThrow()
    })
  })

  describe('route', () => {
    it('routes a ticket through the pipeline', async () => {
      const routeResult = { mode: 'quick', result: { output: 'done' } }
      mockRoute.mockResolvedValue(routeResult)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.route({
        ticketId: UUID,
        prompt: 'Fix the bug',
      })

      expect(result).toEqual(routeResult)
    })
  })

  describe('executeQuick', () => {
    it('executes quick mode', async () => {
      const quickResult = { output: 'Fixed!', durationMs: 120 }
      mockExecuteQuick.mockResolvedValue(quickResult)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.executeQuick({
        ticketId: UUID,
        prompt: 'Quick fix',
      })

      expect(result).toEqual(quickResult)
    })
  })

  describe('startDeepWork', () => {
    it('starts deep work and returns a plan', async () => {
      const plan = { ticketId: UUID, steps: [], status: 'awaiting_approval' }
      mockStartDeepWork.mockResolvedValue(plan)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.startDeepWork({ ticketId: UUID })

      expect(result).toEqual(plan)
    })
  })

  describe('auth', () => {
    it('rejects unauthenticated requests', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.detectMode({ ticketId: UUID })).rejects.toThrow()
    })
  })
})
