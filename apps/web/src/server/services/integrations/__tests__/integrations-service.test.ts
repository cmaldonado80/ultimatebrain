import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ArtifactService,
  ChannelService,
  ModelFallbackService,
  WebhookService,
} from '../integrations-service'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@solarc/db', () => ({
  channels: { id: 'id', enabled: 'enabled' },
  webhooks: { id: 'id', enabled: 'enabled', source: 'source' },
  artifacts: { id: 'id', ticketId: 'ticketId', agentId: 'agentId', createdAt: 'createdAt' },
  modelFallbacks: { id: 'id', agentId: 'agentId' },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => args,
  desc: (col: string) => ({ desc: col }),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  const whereFn = vi.fn().mockReturnThis()
  const setFn = vi.fn().mockReturnValue({ where: whereFn })
  const returningFn = vi.fn().mockResolvedValue([{ id: 'new-1', type: 'slack', enabled: true }])
  const valuesFn = vi.fn().mockReturnValue({ returning: returningFn })

  return {
    query: {
      channels: {
        findFirst: vi.fn().mockResolvedValue(undefined),
        findMany: vi.fn().mockResolvedValue([]),
      },
      webhooks: {
        findFirst: vi.fn().mockResolvedValue(undefined),
        findMany: vi.fn().mockResolvedValue([]),
      },
      artifacts: {
        findFirst: vi.fn().mockResolvedValue(undefined),
        findMany: vi.fn().mockResolvedValue([]),
      },
      modelFallbacks: {
        findFirst: vi.fn().mockResolvedValue(undefined),
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    insert: vi.fn().mockReturnValue({ values: valuesFn }),
    update: vi.fn().mockReturnValue({ set: setFn }),
    delete: vi.fn().mockReturnValue({ where: whereFn }),
    _mock: { whereFn, setFn, valuesFn, returningFn },
  } as any
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ChannelService', () => {
  let service: ChannelService
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
    service = new ChannelService(db)
  })

  it('should create a channel and return it', async () => {
    const result = await service.create({ type: 'slack', config: { token: 'xoxb' } })

    expect(db.insert).toHaveBeenCalled()
    expect(result).toEqual({ id: 'new-1', type: 'slack', enabled: true })
  })

  it('should default enabled to true when not provided', async () => {
    await service.create({ type: 'discord' })

    expect(db._mock.valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'discord', enabled: true }),
    )
  })

  it('should get a channel by id', async () => {
    const channel = { id: 'ch-1', type: 'email', enabled: true }
    db.query.channels.findFirst.mockResolvedValue(channel)

    const result = await service.get('ch-1')

    expect(result).toEqual(channel)
    expect(db.query.channels.findFirst).toHaveBeenCalled()
  })

  it('should list all channels', async () => {
    const channels = [{ id: 'ch-1' }, { id: 'ch-2' }]
    db.query.channels.findMany.mockResolvedValue(channels)

    const result = await service.list()

    expect(result).toHaveLength(2)
  })

  it('should toggle channel enabled state', async () => {
    await service.toggle('ch-1', false)

    expect(db.update).toHaveBeenCalled()
    expect(db._mock.setFn).toHaveBeenCalledWith({ enabled: false })
  })

  it('should delete a channel', async () => {
    await service.delete('ch-1')

    expect(db.delete).toHaveBeenCalled()
    expect(db._mock.whereFn).toHaveBeenCalled()
  })
})

describe('WebhookService', () => {
  let service: WebhookService
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
    service = new WebhookService(db)
  })

  it('should create a webhook and return it', async () => {
    db._mock.returningFn.mockResolvedValue([
      { id: 'wh-1', url: 'https://example.com', enabled: true },
    ])

    const result = await service.create({ url: 'https://example.com', source: 'github' })

    expect(db.insert).toHaveBeenCalled()
    expect(result).toEqual({ id: 'wh-1', url: 'https://example.com', enabled: true })
  })

  it('should dispatch events to enabled webhooks', async () => {
    db.query.webhooks.findMany.mockResolvedValue([
      { id: 'wh-1', url: 'https://hook.example.com/1', secret: null, enabled: true },
    ])

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', mockFetch)

    const results = await service.dispatch({ type: 'test', payload: { foo: 'bar' } })

    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)
    expect(results[0].statusCode).toBe(200)

    vi.unstubAllGlobals()
  })

  it('should handle dispatch errors gracefully', async () => {
    db.query.webhooks.findMany.mockResolvedValue([
      { id: 'wh-1', url: 'https://hook.example.com/1', secret: null, enabled: true },
    ])

    const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'))
    vi.stubGlobal('fetch', mockFetch)

    const results = await service.dispatch({ type: 'test', payload: {} })

    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(false)
    expect(results[0].error).toBe('Connection refused')

    vi.unstubAllGlobals()
  })

  it('should include HMAC signature when webhook has a secret', async () => {
    db.query.webhooks.findMany.mockResolvedValue([
      { id: 'wh-1', url: 'https://hook.example.com/1', secret: 'my-secret', enabled: true },
    ])

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', mockFetch)

    await service.dispatch({ type: 'test', payload: {} })

    const callHeaders = mockFetch.mock.calls[0][1].headers
    expect(callHeaders['X-Webhook-Signature']).toMatch(/^sha256=/)

    vi.unstubAllGlobals()
  })
})

describe('ArtifactService', () => {
  let service: ArtifactService
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
    service = new ArtifactService(db)
  })

  it('should create an artifact and return it', async () => {
    db._mock.returningFn.mockResolvedValue([{ id: 'art-1', name: 'report.pdf' }])

    const result = await service.create({ name: 'report.pdf', content: 'data', ticketId: 't-1' })

    expect(db.insert).toHaveBeenCalled()
    expect(result).toEqual({ id: 'art-1', name: 'report.pdf' })
  })

  it('should get an artifact by id', async () => {
    const artifact = { id: 'art-1', name: 'report.pdf' }
    db.query.artifacts.findFirst.mockResolvedValue(artifact)

    const result = await service.get('art-1')

    expect(result).toEqual(artifact)
  })

  it('should return undefined for non-existent artifact', async () => {
    db.query.artifacts.findFirst.mockResolvedValue(undefined)

    const result = await service.get('nonexistent')

    expect(result).toBeUndefined()
  })

  it('should list artifacts by ticket', async () => {
    const artifacts = [{ id: 'art-1' }, { id: 'art-2' }]
    db.query.artifacts.findMany.mockResolvedValue(artifacts)

    const result = await service.listByTicket('ticket-1')

    expect(result).toHaveLength(2)
    expect(db.query.artifacts.findMany).toHaveBeenCalled()
  })

  it('should delete an artifact', async () => {
    await service.delete('art-1')

    expect(db.delete).toHaveBeenCalled()
  })
})

describe('ModelFallbackService', () => {
  let service: ModelFallbackService
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
    service = new ModelFallbackService(db)
  })

  it('should set a new fallback chain when none exists', async () => {
    db.query.modelFallbacks.findFirst.mockResolvedValue(undefined)
    db._mock.returningFn.mockResolvedValue([
      { id: 'fb-1', agentId: 'a1', chain: ['gpt-4', 'gpt-3.5'] },
    ])

    const result = await service.setChain('a1', ['gpt-4', 'gpt-3.5'])

    expect(db.insert).toHaveBeenCalled()
    expect(result).toBeDefined()
  })

  it('should update an existing fallback chain', async () => {
    db.query.modelFallbacks.findFirst.mockResolvedValue({
      id: 'fb-1',
      agentId: 'a1',
      chain: ['gpt-4'],
    })

    await service.setChain('a1', ['gpt-4', 'claude-3'])

    expect(db.update).toHaveBeenCalled()
  })

  it('should return empty chain when none exists', async () => {
    db.query.modelFallbacks.findFirst.mockResolvedValue(undefined)

    const chain = await service.getChain('a1')

    expect(chain).toEqual([])
  })

  it('should resolve the next fallback model in the chain', async () => {
    db.query.modelFallbacks.findFirst.mockResolvedValue({ chain: ['gpt-4', 'gpt-3.5', 'claude-3'] })

    const next = await service.resolveNext('a1', 'gpt-4')

    expect(next).toBe('gpt-3.5')
  })

  it('should return null when no more fallbacks are available', async () => {
    db.query.modelFallbacks.findFirst.mockResolvedValue({ chain: ['gpt-4', 'gpt-3.5'] })

    const next = await service.resolveNext('a1', 'gpt-3.5')

    expect(next).toBeNull()
  })

  it('should return first model in chain when failed model is not in chain', async () => {
    db.query.modelFallbacks.findFirst.mockResolvedValue({ chain: ['gpt-4', 'gpt-3.5'] })

    const next = await service.resolveNext('a1', 'unknown-model')

    expect(next).toBe('gpt-4')
  })
})
