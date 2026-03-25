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

const mockGetFeatures = vi.fn()
const mockSetFeature = vi.fn()
const mockIsFeatureEnabled = vi.fn()
const mockGetState = vi.fn()
const mockListSessions = vi.fn()
const mockGetSession = vi.fn()
const mockCreateSession = vi.fn()
const mockAddMessage = vi.fn()
const mockSend = vi.fn()
const mockInbox = vi.fn()

vi.mock('../../services/intelligence', () => ({
  CognitionManager: vi.fn().mockImplementation(() => ({
    getFeatures: mockGetFeatures,
    setFeature: mockSetFeature,
    isFeatureEnabled: mockIsFeatureEnabled,
    getPolicies: vi.fn(),
    setPolicy: vi.fn(),
    removePolicy: vi.fn(),
    getState: mockGetState,
    getActiveOverlays: vi.fn(),
    createOverlay: vi.fn(),
    toggleOverlay: vi.fn(),
    deleteOverlay: vi.fn(),
    buildPromptOverlay: vi.fn(),
    getTrustScore: vi.fn(),
    updateTrustScore: vi.fn(),
    recalculateTrust: vi.fn(),
  })),
  ChatSessionManager: vi.fn().mockImplementation(() => ({
    listSessions: mockListSessions,
    getSession: mockGetSession,
    createSession: mockCreateSession,
    addMessage: mockAddMessage,
    getContextWindow: vi.fn(),
    compact: vi.fn(),
    deleteSession: vi.fn(),
  })),
  AgentMessagingService: vi.fn().mockImplementation(() => ({
    send: mockSend,
    broadcast: vi.fn(),
    inbox: mockInbox,
    history: vi.fn(),
    thread: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    acknowledge: vi.fn(),
    unreadCount: vi.fn(),
  })),
}))

const { intelligenceRouter } = await import('../intelligence')

import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

interface MockContext {
  db: ReturnType<typeof createMockDb>
  session: { userId: string } | null
}

const t = initTRPC.context<MockContext>().create({ transformer: superjson })

const caller = (ctx: MockContext) => t.createCallerFactory(intelligenceRouter as any)(ctx)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const UUID = '550e8400-e29b-41d4-a716-446655440000'
const UUID2 = '660e8400-e29b-41d4-a716-446655440000'

describe('intelligence router', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    db = createMockDb()
  })

  describe('features', () => {
    it('returns cognition features', async () => {
      const features = { reasoning: true, memory: false }
      mockGetFeatures.mockResolvedValue(features)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.features()

      expect(result).toEqual(features)
    })
  })

  describe('setFeature', () => {
    it('enables a feature', async () => {
      mockSetFeature.mockResolvedValue({ name: 'reasoning', enabled: true })

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.setFeature({ name: 'reasoning', enabled: true })

      expect(mockSetFeature).toHaveBeenCalledWith('reasoning', true)
      expect(result).toEqual({ name: 'reasoning', enabled: true })
    })

    it('rejects empty feature name', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(trpc.setFeature({ name: '', enabled: true })).rejects.toThrow()
    })
  })

  describe('chatSessions', () => {
    it('lists chat sessions', async () => {
      const sessions = [{ id: UUID, agentId: UUID2 }]
      mockListSessions.mockResolvedValue(sessions)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.chatSessions()

      expect(result).toEqual(sessions)
    })
  })

  describe('addChatMessage', () => {
    it('adds a message to a session', async () => {
      const msg = { id: 'm-1', role: 'user', text: 'Hello' }
      mockAddMessage.mockResolvedValue(msg)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.addChatMessage({
        sessionId: UUID,
        role: 'user',
        text: 'Hello',
      })

      expect(mockAddMessage).toHaveBeenCalledWith(UUID, 'user', 'Hello', undefined)
      expect(result).toEqual(msg)
    })

    it('rejects empty text', async () => {
      const trpc = caller({ db, session: { userId: 'user-1' } })
      await expect(
        trpc.addChatMessage({ sessionId: UUID, role: 'user', text: '' }),
      ).rejects.toThrow()
    })
  })

  describe('sendMessage', () => {
    it('sends an inter-agent message', async () => {
      const sent = { id: 'm-1', status: 'sent' }
      mockSend.mockResolvedValue(sent)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.sendMessage({
        fromAgentId: UUID,
        toAgentId: UUID2,
        text: 'Task complete',
      })

      expect(result).toEqual(sent)
    })
  })

  describe('cognitionState', () => {
    it('returns full cognition state', async () => {
      const state = { features: {}, policies: {} }
      mockGetState.mockResolvedValue(state)

      const trpc = caller({ db, session: { userId: 'user-1' } })
      const result = await trpc.cognitionState()

      expect(result).toEqual(state)
    })
  })

  describe('auth', () => {
    it('rejects unauthenticated requests', async () => {
      const trpc = caller({ db, session: null })
      await expect(trpc.features()).rejects.toThrow()
    })
  })
})
