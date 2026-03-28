import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type PresenceEvent, PresenceManager } from '../manager'

describe('PresenceManager', () => {
  let manager: PresenceManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new PresenceManager()
  })

  afterEach(() => {
    manager.destroy()
    vi.useRealTimers()
  })

  const userEntry = {
    id: 'u1',
    type: 'user' as const,
    name: 'Alice',
    location: '/tickets',
  }

  const agentEntry = {
    id: 'a1',
    type: 'agent' as const,
    name: 'Builder',
    location: '/workspaces',
    workspaceId: 'w1',
  }

  describe('join/leave', () => {
    it('registers an entity and returns it via getAll', () => {
      manager.join(userEntry)
      expect(manager.getAll()).toHaveLength(1)
      expect(manager.getAll()[0].name).toBe('Alice')
    })

    it('sets lastSeen and connectedAt on join', () => {
      manager.join(userEntry)
      const entry = manager.get('u1')!
      expect(entry.lastSeen).toBeInstanceOf(Date)
      expect(entry.connectedAt).toBeInstanceOf(Date)
    })

    it('removes entity on leave', () => {
      manager.join(userEntry)
      manager.leave('u1')
      expect(manager.getAll()).toHaveLength(0)
    })

    it('is a no-op to leave a non-existent entity', () => {
      manager.leave('nonexistent')
      expect(manager.getAll()).toHaveLength(0)
    })

    it('broadcasts join event', () => {
      const events: PresenceEvent[] = []
      manager.subscribe((e) => events.push(e))
      manager.join(userEntry)
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('join')
      expect(events[0].entityId).toBe('u1')
    })

    it('broadcasts leave event', () => {
      manager.join(userEntry)
      const events: PresenceEvent[] = []
      manager.subscribe((e) => events.push(e))
      manager.leave('u1')
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('leave')
    })
  })

  describe('queries', () => {
    it('filters users and agents', () => {
      manager.join(userEntry)
      manager.join(agentEntry)
      expect(manager.getUsers()).toHaveLength(1)
      expect(manager.getAgents()).toHaveLength(1)
    })

    it('filters by location', () => {
      manager.join(userEntry)
      manager.join(agentEntry)
      expect(manager.getByLocation('/tickets')).toHaveLength(1)
      expect(manager.getByLocation('/workspaces')).toHaveLength(1)
      expect(manager.getByLocation('/nowhere')).toHaveLength(0)
    })

    it('getCount returns correct counts', () => {
      manager.join(userEntry)
      manager.join(agentEntry)
      const counts = manager.getCount()
      expect(counts).toEqual({ users: 1, agents: 1, total: 2 })
    })

    it('get returns null for missing entity', () => {
      expect(manager.get('missing')).toBeNull()
    })
  })

  describe('updates', () => {
    it('heartbeat updates lastSeen', () => {
      manager.join(userEntry)
      const before = manager.get('u1')!.lastSeen
      vi.advanceTimersByTime(1000)
      manager.heartbeat('u1')
      const after = manager.get('u1')!.lastSeen
      expect(after.getTime()).toBeGreaterThan(before.getTime())
    })

    it('updateLocation changes location', () => {
      manager.join(userEntry)
      manager.updateLocation('u1', '/agents')
      expect(manager.get('u1')!.location).toBe('/agents')
    })

    it('updateCursor sets cursor position', () => {
      manager.join(userEntry)
      manager.updateCursor('u1', { x: 100, y: 200 })
      expect(manager.get('u1')!.cursor).toEqual({ x: 100, y: 200 })
    })

    it('updateAgentStatus sets execution state', () => {
      manager.join(agentEntry)
      manager.updateAgentStatus('a1', true, 't1')
      const entry = manager.get('a1')!
      expect(entry.isExecuting).toBe(true)
      expect(entry.ticketId).toBe('t1')
    })

    it('updateAgentStatus ignores non-agent entities', () => {
      manager.join(userEntry)
      manager.updateAgentStatus('u1', true)
      expect(manager.get('u1')!.isExecuting).toBeUndefined()
    })
  })

  describe('stale cleanup', () => {
    it('removes stale entries after timeout', () => {
      manager.join(userEntry)
      // Advance past 2 interval ticks: first tick at 10s sees entry at boundary,
      // second tick at 20s sees entry 10s past cutoff
      vi.advanceTimersByTime(21_000)
      expect(manager.getAll()).toHaveLength(0)
    })

    it('keeps entries that send heartbeats', () => {
      manager.join(userEntry)
      vi.advanceTimersByTime(8_000)
      manager.heartbeat('u1')
      vi.advanceTimersByTime(8_000)
      expect(manager.getAll()).toHaveLength(1)
    })
  })

  describe('subscribe', () => {
    it('unsubscribe stops receiving events', () => {
      const events: PresenceEvent[] = []
      const unsub = manager.subscribe((e) => events.push(e))
      manager.join(userEntry)
      expect(events).toHaveLength(1)
      unsub()
      manager.join(agentEntry)
      expect(events).toHaveLength(1) // no new event
    })
  })

  describe('destroy', () => {
    it('clears all state', () => {
      manager.join(userEntry)
      manager.join(agentEntry)
      manager.destroy()
      expect(manager.getAll()).toHaveLength(0)
    })
  })
})
