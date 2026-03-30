/**
 * Presence Types & Constants — client-safe exports.
 *
 * This file is importable from client components (no Node.js / DB dependencies).
 * The actual PresenceManager class is in manager.ts (server-only).
 */

export type EntityType = 'user' | 'agent'

export interface CursorPosition {
  x: number
  y: number
  target?: string
}

export interface PresenceEntry {
  id: string
  type: EntityType
  name: string
  avatarUrl?: string
  location: string
  workspaceId?: string
  ticketId?: string
  cursor?: CursorPosition
  isExecuting?: boolean
  lastSeen: Date
  connectedAt: Date
  meta?: Record<string, unknown>
}

export type PresenceEventType = 'join' | 'leave' | 'move' | 'cursor' | 'heartbeat' | 'status'

export interface PresenceEvent {
  type: PresenceEventType
  entityId: string
  entityType: EntityType
  timestamp: Date
  data: Partial<PresenceEntry>
}

export type PresenceListener = (event: PresenceEvent) => void

// ── Configuration (safe for client use) ──────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 5_000
const DISCONNECT_TIMEOUT_MS = 10_000
const CURSOR_THROTTLE_MS = 50

export const PRESENCE_CONFIG = {
  heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
  disconnectTimeoutMs: DISCONNECT_TIMEOUT_MS,
  cursorThrottleMs: CURSOR_THROTTLE_MS,
} as const
