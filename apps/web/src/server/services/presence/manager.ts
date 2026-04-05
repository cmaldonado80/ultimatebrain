/**
 * Multiplayer Presence Manager (server-only)
 *
 * Tracks real-time presence for users and agents.
 * DB-backed for persistence across restarts.
 *
 * CLIENT COMPONENTS: import types/constants from './types' instead.
 */

import { logger } from '../../../lib/logger'
import type {
  CursorPosition,
  EntityType,
  PresenceEntry,
  PresenceEvent,
  PresenceListener,
} from './types'

// Re-export types for backward compatibility (server-side consumers)
export type { CursorPosition, EntityType, PresenceEntry, PresenceEvent, PresenceListener }
export { PRESENCE_CONFIG } from './types'

// ── Configuration ───────────────────────────────────────────────────────

const DISCONNECT_TIMEOUT_MS = 10_000

// ── Manager ─────────────────────────────────────────────────────────────

export class PresenceManager {
  private entries = new Map<string, PresenceEntry>()
  private listeners = new Set<PresenceListener>()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null
  private db: unknown = null // Optional DB reference for persistence

  constructor(db?: unknown) {
    this.db = db ?? null
    // Start periodic cleanup of stale entries
    this.cleanupInterval = setInterval(() => {
      try {
        this.cleanStale()
      } catch (err) {
        console.warn('[PresenceManager] Stale cleanup error:', err)
      }
    }, DISCONNECT_TIMEOUT_MS)
    // Load existing entries from DB if available
    if (this.db) {
      this.loadFromDb().catch((err) => {
        logger.error(
          { err: err instanceof Error ? err : undefined },
          '[PresenceManager] Failed to load from DB',
        )
      })
    }
  }

  /** Inject database reference after construction */
  setDb(db: unknown): void {
    this.db = db
  }

  /** Load active presence entries from database on startup */
  private async loadFromDb(): Promise<void> {
    if (!this.db) return
    try {
      const { presenceEntries } = await import('@solarc/db')
      const { gt } = await import('drizzle-orm')
      const db = this.db as import('@solarc/db').Database
      const cutoff = new Date(Date.now() - DISCONNECT_TIMEOUT_MS)
      const rows = await db.query.presenceEntries.findMany({
        where: gt(presenceEntries.lastHeartbeat, cutoff),
      })
      for (const row of rows) {
        this.entries.set(row.id, {
          id: row.id,
          type: row.type as EntityType,
          name: row.userId ?? 'unknown',
          location: row.location ?? '/',
          workspaceId: row.workspaceId ?? undefined,
          cursor: row.cursor as CursorPosition | undefined,
          lastSeen: row.lastHeartbeat,
          connectedAt: row.connectedAt,
        })
      }
    } catch (err) {
      console.warn('[PresenceManager] DB load failed, continuing in-memory only:', err)
    }
  }

  /** Persist a presence entry to DB (fire-and-forget) */
  private persistEntry(entry: PresenceEntry): void {
    if (!this.db) return
    import('@solarc/db')
      .then(async ({ presenceEntries }) => {
        const db = this.db as import('@solarc/db').Database
        await db
          .insert(presenceEntries)
          .values({
            id: entry.id,
            userId: entry.name,
            type: entry.type,
            location: entry.location,
            workspaceId: entry.workspaceId ?? null,
            cursor: (entry.cursor as unknown as Record<string, unknown> | null) ?? null,
            status:
              entry.isExecuting != null
                ? { isExecuting: entry.isExecuting, ticketId: entry.ticketId }
                : null,
            lastHeartbeat: entry.lastSeen,
            connectedAt: entry.connectedAt,
          })
          .onConflictDoUpdate({
            target: presenceEntries.id,
            set: {
              location: entry.location,
              cursor: (entry.cursor as unknown as Record<string, unknown> | null) ?? null,
              lastHeartbeat: entry.lastSeen,
            },
          })
      })
      .catch((err) => {
        logger.error(
          { err: err instanceof Error ? err : undefined },
          '[PresenceManager] DB persist failed',
        )
      })
  }

  /** Remove a presence entry from DB */
  private removeFromDb(entityId: string): void {
    if (!this.db) return
    import('@solarc/db')
      .then(async ({ presenceEntries }) => {
        const { eq } = await import('drizzle-orm')
        const db = this.db as import('@solarc/db').Database
        await db.delete(presenceEntries).where(eq(presenceEntries.id, entityId))
      })
      .catch((err) => {
        logger.error(
          { err: err instanceof Error ? err : undefined },
          '[PresenceManager] DB remove failed',
        )
      })
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
    this.persistEntry(full)

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
    this.removeFromDb(entityId)

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
  updateAgentStatus(agentId: string, isExecuting: boolean, ticketId?: string): void {
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

export function getPresenceManager(db?: unknown): PresenceManager {
  if (!_instance) _instance = new PresenceManager(db)
  else if (db && !_instance['db']) _instance.setDb(db)
  return _instance
}

// PRESENCE_CONFIG re-exported from ./types at top of file
