/**
 * Multiplayer Presence Manager
 *
 * Tracks real-time presence for users and agents:
 * - Which users are online, which tab/view, cursor position
 * - Which agents are executing, which ticket/workspace
 * - Broadcasts state via SSE to all connected clients
 * - Heartbeat: 5s from client, 10s timeout for disconnect
 */

export type EntityType = 'user' | 'agent'

export interface CursorPosition {
  x: number
  y: number
  /** Element or area the cursor is over */
  target?: string
}

export interface PresenceEntry {
  id: string
  type: EntityType
  name: string
  avatarUrl?: string
  /** Current view/tab the entity is on */
  location: string
  /** For agents: workspace they belong to */
  workspaceId?: string
  /** For agents: ticket they're working on */
  ticketId?: string
  /** Cursor position on shared views */
  cursor?: CursorPosition
  /** Agent-specific: is it actively executing? */
  isExecuting?: boolean
  /** Last heartbeat timestamp */
  lastSeen: Date
  /** When this entity connected */
  connectedAt: Date
  /** Arbitrary metadata */
  meta?: Record<string, unknown>
}

export type PresenceEventType =
  | 'join'
  | 'leave'
  | 'move'        // location/tab change
  | 'cursor'      // cursor position update
  | 'heartbeat'
  | 'status'      // agent started/stopped executing

export interface PresenceEvent {
  type: PresenceEventType
  entityId: string
  entityType: EntityType
  timestamp: Date
  data: Partial<PresenceEntry>
}

export type PresenceListener = (event: PresenceEvent) => void

// ── Configuration ───────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 5_000
const DISCONNECT_TIMEOUT_MS = 10_000
const CURSOR_THROTTLE_MS = 50

// ── Manager ─────────────────────────────────────────────────────────────

export class PresenceManager {
  private entries = new Map<string, PresenceEntry>()
  private listeners = new Set<PresenceListener>()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    // Start periodic cleanup of stale entries
    this.cleanupInterval = setInterval(() => {
      try { this.cleanStale() } catch (err) { console.warn('[PresenceManager] Stale cleanup error:', err) }
    }, DISCONNECT_TIMEOUT_MS)
  }

  /** Shut down the manager */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.entries.clear()
    this.listeners.clear()
  }

  // ── Join / Leave ──────────────────────────────────────────────────────

  /** Register a user or agent as present */
  join(entry: Omit<PresenceEntry, 'lastSeen' | 'connectedAt'>): void {
    const now = new Date()
    const full: PresenceEntry = { ...entry, lastSeen: now, connectedAt: now }
    this.entries.set(entry.id, full)

    this.broadcast({
      type: 'join',
      entityId: entry.id,
      entityType: entry.type,
      timestamp: now,
      data: full,
    })
  }

  /** Remove a user or agent from presence */
  leave(entityId: string): void {
    const entry = this.entries.get(entityId)
    if (!entry) return
    this.entries.delete(entityId)

    this.broadcast({
      type: 'leave',
      entityId,
      entityType: entry.type,
      timestamp: new Date(),
      data: { id: entityId, name: entry.name },
    })
  }

  // ── Updates ───────────────────────────────────────────────────────────

  /** Update heartbeat — keeps the entry alive */
  heartbeat(entityId: string): void {
    const entry = this.entries.get(entityId)
    if (!entry) return
    entry.lastSeen = new Date()

    this.broadcast({
      type: 'heartbeat',
      entityId,
      entityType: entry.type,
      timestamp: entry.lastSeen,
      data: { id: entityId },
    })
  }

  /** Update location (tab/view change) */
  updateLocation(entityId: string, location: string): void {
    const entry = this.entries.get(entityId)
    if (!entry) return

    entry.location = location
    entry.lastSeen = new Date()

    this.broadcast({
      type: 'move',
      entityId,
      entityType: entry.type,
      timestamp: entry.lastSeen,
      data: { id: entityId, location },
    })
  }

  /** Update cursor position */
  updateCursor(entityId: string, cursor: CursorPosition): void {
    const entry = this.entries.get(entityId)
    if (!entry) return

    entry.cursor = cursor
    entry.lastSeen = new Date()

    this.broadcast({
      type: 'cursor',
      entityId,
      entityType: entry.type,
      timestamp: entry.lastSeen,
      data: { id: entityId, cursor },
    })
  }

  /** Update agent execution status */
  updateAgentStatus(
    agentId: string,
    isExecuting: boolean,
    ticketId?: string
  ): void {
    const entry = this.entries.get(agentId)
    if (!entry || entry.type !== 'agent') return

    entry.isExecuting = isExecuting
    if (ticketId !== undefined) entry.ticketId = ticketId
    entry.lastSeen = new Date()

    this.broadcast({
      type: 'status',
      entityId: agentId,
      entityType: 'agent',
      timestamp: entry.lastSeen,
      data: { id: agentId, isExecuting, ticketId },
    })
  }

  // ── Queries ───────────────────────────────────────────────────────────

  /** Get all currently present entities */
  getAll(): PresenceEntry[] {
    return Array.from(this.entries.values())
  }

  /** Get only online users */
  getUsers(): PresenceEntry[] {
    return this.getAll().filter((e) => e.type === 'user')
  }

  /** Get only active agents */
  getAgents(): PresenceEntry[] {
    return this.getAll().filter((e) => e.type === 'agent')
  }

  /** Get entities on a specific view/location */
  getByLocation(location: string): PresenceEntry[] {
    return this.getAll().filter((e) => e.location === location)
  }

  /** Get a single entry */
  get(entityId: string): PresenceEntry | null {
    return this.entries.get(entityId) ?? null
  }

  /** Get count of online entities */
  getCount(): { users: number; agents: number; total: number } {
    const all = this.getAll()
    const users = all.filter((e) => e.type === 'user').length
    const agents = all.filter((e) => e.type === 'agent').length
    return { users, agents, total: all.length }
  }

  // ── SSE Subscription ──────────────────────────────────────────────────

  /** Subscribe to presence events (for SSE broadcast) */
  subscribe(listener: PresenceListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private broadcast(event: PresenceEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  /** Remove entries that haven't sent a heartbeat within the timeout */
  private cleanStale(): void {
    const cutoff = new Date(Date.now() - DISCONNECT_TIMEOUT_MS)
    for (const [id, entry] of this.entries) {
      if (entry.lastSeen < cutoff) {
        this.leave(id)
      }
    }
  }
}

// ── Singleton ───────────────────────────────────────────────────────────

let _instance: PresenceManager | null = null

export function getPresenceManager(): PresenceManager {
  if (!_instance) _instance = new PresenceManager()
  return _instance
}

// ── Constants (exported for client use) ─────────────────────────────────

export const PRESENCE_CONFIG = {
  heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
  disconnectTimeoutMs: DISCONNECT_TIMEOUT_MS,
  cursorThrottleMs: CURSOR_THROTTLE_MS,
} as const
