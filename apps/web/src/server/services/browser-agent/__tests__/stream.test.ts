import { describe, it, expect, beforeEach } from 'vitest'
import { BrowserAgentStream } from '../stream'

describe('BrowserAgentStream', () => {
  let stream: BrowserAgentStream

  beforeEach(() => {
    stream = new BrowserAgentStream()
  })

  describe('startSession()', () => {
    it('should return a session ID string', () => {
      const id = stream.startSession('agent-1', 'Test Agent', 'https://example.com')
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    })

    it('should create a retrievable session', () => {
      const id = stream.startSession('agent-1', 'Test Agent', 'https://example.com')
      const session = stream.getSession(id)
      expect(session).toBeTruthy()
      expect(session?.agentId).toBe('agent-1')
      expect(session?.agentName).toBe('Test Agent')
      expect(session?.status).toBe('running')
    })
  })

  describe('session lifecycle', () => {
    it('should pause a running session', () => {
      const id = stream.startSession('agent-1', 'Agent', 'https://example.com')
      stream.pauseSession(id)
      expect(stream.getSession(id)?.status).toBe('paused')
    })

    it('should resume a paused session', () => {
      const id = stream.startSession('agent-1', 'Agent', 'https://example.com')
      stream.pauseSession(id)
      stream.resumeSession(id)
      expect(stream.getSession(id)?.status).toBe('running')
    })

    it('should stop a session', () => {
      const id = stream.startSession('agent-1', 'Agent', 'https://example.com')
      stream.stopSession(id)
      // After stop, session is either removed or marked stopped
      const session = stream.getSession(id)
      if (session) {
        expect(session.status).toBe('stopped')
      }
    })

    it('should support takeover mode', () => {
      const id = stream.startSession('agent-1', 'Agent', 'https://example.com')
      stream.takeoverSession(id)
      // Takeover changes status or mode
      const session = stream.getSession(id)
      expect(session).toBeTruthy()
    })
  })

  describe('events', () => {
    it('should record navigation events', () => {
      const id = stream.startSession('agent-1', 'Agent', 'https://example.com')
      stream.emitNavigation(id, 'https://a.com', 'https://b.com', 200)
      const events = stream.getSessionEvents(id)
      expect(events.length).toBeGreaterThan(0)
    })

    it('should record error events', () => {
      const id = stream.startSession('agent-1', 'Agent', 'https://example.com')
      stream.emitError(id, 'Page timeout', true, 'TIMEOUT')
      const events = stream.getSessionEvents(id)
      expect(events.some((e) => e.type === 'error')).toBe(true)
    })
  })

  describe('listActiveSessions()', () => {
    it('should list running sessions', () => {
      stream.startSession('agent-1', 'Agent 1', 'https://a.com')
      const id2 = stream.startSession('agent-2', 'Agent 2', 'https://b.com')
      stream.stopSession(id2)

      const active = stream.listActiveSessions()
      expect(active.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('cleanExpiredScreenshots()', () => {
    it('should return a number', () => {
      const cleaned = stream.cleanExpiredScreenshots()
      expect(typeof cleaned).toBe('number')
    })
  })

  describe('getSession()', () => {
    it('should return null for unknown session', () => {
      expect(stream.getSession('nonexistent')).toBeNull()
    })
  })
})
