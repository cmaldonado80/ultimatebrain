import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock DB layer
// ---------------------------------------------------------------------------

const _mockFindMany = vi.fn()
const _mockFindFirst = vi.fn()
const mockInsertReturning = vi.fn()

const mockEvalDatasetsFindMany = vi.fn()
const mockEvalCasesFindMany = vi.fn()
const mockEvalRunsFindMany = vi.fn()
const mockEvalRunsFindFirst = vi.fn()

function createMockDb() {
  return {
    query: {
      evalDatasets: { findMany: mockEvalDatasetsFindMany },
      evalCases: { findMany: mockEvalCasesFindMany },
      evalRuns: { findMany: mockEvalRunsFindMany, findFirst: mockEvalRunsFindFirst },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: mockInsertReturning,
      }),
    }),
  } as unknown
}

// ---------------------------------------------------------------------------
// Mock external modules
// ---------------------------------------------------------------------------

const mockEvalRunner = {
  scoreCase: vi.fn(),
  runDataset: vi.fn(),
  compareRuns: vi.fn(),
}

const mockDatasetBuilder = {
  listDatasets: vi.fn(),
  saveFromTrace: vi.fn(),
  autoGenerateFromFailedTickets: vi.fn(),
  autoGenerateFromSuccessfulTraces: vi.fn(),
}

const mockDriftDetector = {
  detectForDataset: vi.fn(),
  detectAll: vi.fn(),
  getHistory: vi.fn(),
}

vi.mock('../../services/evals', () => ({
  EvalRunner: vi.fn().mockImplementation(() => mockEvalRunner),
  DatasetBuilder: vi.fn().mockImplementation(() => mockDatasetBuilder),
  DriftDetector: vi.fn().mockImplementation(() => mockDriftDetector),
}))

vi.mock('@solarc/db', () => ({
  evalDatasets: { id: 'id', name: 'name' },
  evalCases: { id: 'id', datasetId: 'datasetId' },
  evalRuns: { id: 'id', datasetId: 'datasetId', createdAt: 'createdAt' },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: string) => ({ col, val }),
  desc: (col: string) => ({ desc: col }),
}))

// Import after mocks are set up
const { evalsRouter } = await import('../evals')

// Minimal tRPC caller factory
import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

type AnyRouter = Parameters<typeof t.createCallerFactory>[0]
const caller = (ctx: MockContext) => t.createCallerFactory(evalsRouter as AnyRouter)(ctx)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('evals router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  // ── Auth ────────────────────────────────────────────────────────────────

  describe('auth', () => {
    it('rejects datasets query without a session', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.datasets()).rejects.toThrow()
    })

    it('rejects createDataset mutation without a session', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.createDataset({ name: 'test' })).rejects.toThrow()
    })

    it('rejects addCase mutation without a session', async () => {
      const trpc = caller({ db, session: null })
      const id = '550e8400-e29b-41d4-a716-446655440000'
      await expect(trpc.addCase({ datasetId: id, input: 'q' })).rejects.toThrow()
    })
  })

  // ── datasets ────────────────────────────────────────────────────────────

  describe('datasets', () => {
    it('returns all datasets', async () => {
      const datasets = [{ id: '1', name: 'QA Suite' }]
      mockEvalDatasetsFindMany.mockResolvedValue(datasets)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.datasets()

      expect(mockEvalDatasetsFindMany).toHaveBeenCalled()
      expect(result).toEqual(datasets)
    })
  })

  // ── createDataset ───────────────────────────────────────────────────────

  describe('createDataset', () => {
    it('creates a dataset and returns it', async () => {
      const created = { id: 'ds-1', name: 'Regression Suite' }
      mockInsertReturning.mockResolvedValue([created])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.createDataset({ name: 'Regression Suite' })

      expect(result).toEqual(created)
    })

    it('accepts optional description', async () => {
      const created = { id: 'ds-2', name: 'Suite', description: 'A desc' }
      mockInsertReturning.mockResolvedValue([created])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.createDataset({ name: 'Suite', description: 'A desc' })

      expect(result).toEqual(created)
    })

    it('rejects empty name', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.createDataset({ name: '' })).rejects.toThrow()
    })
  })

  // ── cases ───────────────────────────────────────────────────────────────

  describe('cases', () => {
    it('returns cases for a dataset', async () => {
      const cases = [{ id: 'c-1', input: 'What is 2+2?', expectedOutput: '4' }]
      mockEvalCasesFindMany.mockResolvedValue(cases)

      const datasetId = '550e8400-e29b-41d4-a716-446655440000'
      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.cases({ datasetId })

      expect(mockEvalCasesFindMany).toHaveBeenCalled()
      expect(result).toEqual(cases)
    })

    it('rejects non-uuid datasetId', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.cases({ datasetId: 'not-a-uuid' })).rejects.toThrow()
    })
  })

  // ── addCase ─────────────────────────────────────────────────────────────

  describe('addCase', () => {
    it('adds a case to a dataset', async () => {
      const datasetId = '550e8400-e29b-41d4-a716-446655440000'
      const created = { id: 'c-new', datasetId, input: 'Q', expectedOutput: 'A' }
      mockInsertReturning.mockResolvedValue([created])

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.addCase({
        datasetId,
        input: 'Q',
        expectedOutput: 'A',
      })

      expect(result).toEqual(created)
    })
  })

  // ── runDataset ──────────────────────────────────────────────────────────

  describe('runDataset', () => {
    it('runs eval on a dataset with outputs', async () => {
      const datasetId = '550e8400-e29b-41d4-a716-446655440000'
      const caseId = '660e8400-e29b-41d4-a716-446655440000'
      const runResult = { runId: 'run-1', scores: { accuracy: 0.95 } }
      mockEvalRunner.runDataset.mockResolvedValue(runResult)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.runDataset({
        datasetId,
        outputs: [{ caseId, output: 'answer' }],
      })

      expect(mockEvalRunner.runDataset).toHaveBeenCalledWith(datasetId, {
        version: undefined,
        passThreshold: undefined,
        outputs: expect.any(Map),
      })
      expect(result).toEqual(runResult)
    })

    it('rejects non-uuid datasetId', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.runDataset({ datasetId: 'bad', outputs: [] })).rejects.toThrow()
    })
  })

  // ── runs ────────────────────────────────────────────────────────────────

  describe('runs', () => {
    it('returns runs for a dataset with default limit', async () => {
      const runs = [{ id: 'run-1', datasetId: 'ds-1' }]
      mockEvalRunsFindMany.mockResolvedValue(runs)

      const datasetId = '550e8400-e29b-41d4-a716-446655440000'
      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.runs({ datasetId })

      expect(mockEvalRunsFindMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        orderBy: expect.any(Object),
        limit: 20,
      })
      expect(result).toEqual(runs)
    })
  })

  // ── detectDrift ─────────────────────────────────────────────────────────

  describe('detectDrift', () => {
    it('detects drift for a dataset', async () => {
      const driftResult = { drifted: false, delta: 0.01 }
      mockDriftDetector.detectForDataset.mockResolvedValue(driftResult)

      const datasetId = '550e8400-e29b-41d4-a716-446655440000'
      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.detectDrift({ datasetId })

      expect(mockDriftDetector.detectForDataset).toHaveBeenCalledWith(datasetId)
      expect(result).toEqual(driftResult)
    })
  })
})
