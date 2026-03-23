import { vi } from 'vitest'

/**
 * Creates a mock Database object that mirrors the Drizzle ORM query interface.
 * Typed as `any` because fully replicating Drizzle's generic types is impractical
 * in test helpers — callers can cast to `Database` at the call site if needed.
 */
export function createMockDb() {
  const makeQueryTable = () => ({
    findFirst: vi.fn(),
    findMany: vi.fn(),
  })

  const mock = {
    query: {
      tickets: makeQueryTable(),
      agents: makeQueryTable(),
      workspaces: makeQueryTable(),
      memories: makeQueryTable(),
    },

    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    }),

    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),

    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),

    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),

    transaction: vi.fn().mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      return cb(mock)
    }),
  }

  return mock as any
}
