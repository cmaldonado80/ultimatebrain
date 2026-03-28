import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const mockChannelCreate = vi.fn()
const mockChannelList = vi.fn()
const mockWebhookCreate = vi.fn()
const mockWebhookList = vi.fn()
const mockArtifactCreate = vi.fn()
const mockArtifactGet = vi.fn()
const mockArtifactListByTicket = vi.fn()
const mockFallbackSetChain = vi.fn()
const mockFallbackGetChain = vi.fn()

vi.mock('../../services/integrations', () => ({
  ChannelService: vi.fn().mockImplementation(() => ({
    create: mockChannelCreate,
    list: mockChannelList,
    toggle: vi.fn(),
    delete: vi.fn(),
  })),
  WebhookService: vi.fn().mockImplementation(() => ({
    create: mockWebhookCreate,
    list: mockWebhookList,
    toggle: vi.fn(),
    delete: vi.fn(),
    dispatch: vi.fn(),
  })),
  ArtifactService: vi.fn().mockImplementation(() => ({
    create: mockArtifactCreate,
    get: mockArtifactGet,
    listByTicket: mockArtifactListByTicket,
    listByAgent: vi.fn(),
    delete: vi.fn(),
  })),
  ModelFallbackService: vi.fn().mockImplementation(() => ({
    setChain: mockFallbackSetChain,
    getChain: mockFallbackGetChain,
    listAll: vi.fn(),
    resolveNext: vi.fn(),
    delete: vi.fn(),
  })),
}))

const { integrationsRouter } = await import('../integrations')

import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

const caller = (ctx: MockContext) => t.createCallerFactory(integrationsRouter as any)(ctx)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const UUID = '550e8400-e29b-41d4-a716-446655440000'

describe('integrations router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  describe('channels', () => {
    it('lists channels', async () => {
      const channels = [{ id: '1', type: 'slack' }]
      mockChannelList.mockResolvedValue(channels)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.channels()

      expect(result).toEqual(channels)
    })

    it('creates a channel', async () => {
      const channel = { id: '1', type: 'slack' }
      mockChannelCreate.mockResolvedValue(channel)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.createChannel({ type: 'slack' })

      expect(mockChannelCreate).toHaveBeenCalledWith({ type: 'slack' })
      expect(result).toEqual(channel)
    })

    it('rejects empty type', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.createChannel({ type: '' })).rejects.toThrow()
    })
  })

  describe('webhooks', () => {
    it('creates a webhook', async () => {
      const webhook = { id: '1', url: 'https://example.com/hook' }
      mockWebhookCreate.mockResolvedValue(webhook)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.createWebhook({ url: 'https://example.com/hook' })

      expect(result).toEqual(webhook)
    })

    it('rejects invalid webhook url', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.createWebhook({ url: 'not-a-url' })).rejects.toThrow()
    })

    it('lists webhooks', async () => {
      const webhooks = [{ id: '1', url: 'https://example.com' }]
      mockWebhookList.mockResolvedValue(webhooks)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.webhooks()

      expect(result).toEqual(webhooks)
    })
  })

  describe('artifacts', () => {
    it('creates an artifact', async () => {
      const artifact = { id: UUID, name: 'output.json' }
      mockArtifactCreate.mockResolvedValue(artifact)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.createArtifact({ name: 'output.json' })

      expect(result).toEqual(artifact)
    })

    it('rejects empty artifact name', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.createArtifact({ name: '' })).rejects.toThrow()
    })
  })

  describe('auth', () => {
    it('rejects unauthenticated requests', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.channels()).rejects.toThrow()
    })
  })
})
