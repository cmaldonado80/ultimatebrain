/**
 * OpenClaw Memory Sync Adapter — Bidirectional pgvector ↔ sqlite-vec sync.
 *
 * Brain (pgvector) is the source of truth. Writes flow to OpenClaw's sqlite-vec
 * for local fast retrieval. OpenClaw memory events flow back to pgvector.
 * On conflict, Brain version wins.
 */
import type { OpenClawClient } from './client'

// ── Types ────────────────────────────────────────────────────────────

export interface MemoryRecord {
  key: string
  content: string
  embedding?: number[]
  tier?: 'core' | 'recall' | 'archival'
  confidence?: number
  metadata?: Record<string, unknown>
  updatedAt: string
}

export type MemoryEventHandler = (record: MemoryRecord) => void | Promise<void>

// ── Adapter ──────────────────────────────────────────────────────────

export class OpenClawMemorySync {
  private handlers: MemoryEventHandler[] = []
  private lastSyncTimestamp: Date | null = null

  constructor(private client: OpenClawClient) {
    // Listen for memory events from OpenClaw
    this.client.on('message', (data: Record<string, unknown>) => {
      if (data.type === 'memory.updated') {
        this.handleInbound(data.record as MemoryRecord)
      }
    })

    // Re-sync on reconnect
    this.client.on('connected', () => {
      this.syncSinceLastTimestamp().catch((err) => {
        console.warn('[OpenClaw Memory] Reconnect sync failed:', err)
      })
    })
  }

  /** Register a handler for inbound memory events from OpenClaw. */
  onMemoryUpdate(handler: MemoryEventHandler): void {
    this.handlers.push(handler)
  }

  private handleInbound(record: MemoryRecord): void {
    for (const handler of this.handlers) {
      try {
        const result = handler(record)
        if (result instanceof Promise) {
          result.catch((err) => console.warn('[OpenClaw Memory] Handler error:', err))
        }
      } catch (err) {
        console.warn('[OpenClaw Memory] Handler error:', err)
      }
    }
  }

  /**
   * Push a memory record from Brain (pgvector) to OpenClaw (sqlite-vec).
   * Called after Brain writes/updates a memory.
   */
  async pushToOpenClaw(record: MemoryRecord): Promise<void> {
    if (!this.client.isConnected()) return // silently skip when disconnected

    return new Promise((resolve) => {
      const requestId = crypto.randomUUID()
      const timeout = setTimeout(() => {
        this.client.removeAllListeners(`response:${requestId}`)
        // Don't fail Brain operations if OpenClaw sync is slow
        resolve()
      }, 5_000)

      this.client.once(`response:${requestId}`, () => {
        clearTimeout(timeout)
        this.lastSyncTimestamp = new Date()
        resolve()
      })

      this.client.once(`error:${requestId}`, (err: { message: string }) => {
        clearTimeout(timeout)
        console.warn(`[OpenClaw Memory] Push failed: ${err.message}`)
        resolve() // don't fail Brain operations
      })

      try {
        this.client.send({
          type: 'memory.upsert',
          requestId,
          record,
        })
      } catch {
        clearTimeout(timeout)
        resolve()
      }
    })
  }

  /**
   * Request all memory changes from OpenClaw since last sync.
   * Called on reconnect to catch up on missed events.
   */
  private async syncSinceLastTimestamp(): Promise<void> {
    if (!this.client.isConnected() || !this.lastSyncTimestamp) return undefined

    return new Promise((resolve) => {
      const requestId = crypto.randomUUID()
      const timeout = setTimeout(() => {
        this.client.removeAllListeners(`response:${requestId}`)
        resolve()
      }, 30_000)

      this.client.once(`response:${requestId}`, (data: { records: MemoryRecord[] }) => {
        clearTimeout(timeout)
        for (const record of data.records) {
          this.handleInbound(record)
        }
        this.lastSyncTimestamp = new Date()
        resolve()
      })

      this.client.once(`error:${requestId}`, () => {
        clearTimeout(timeout)
        resolve()
      })

      try {
        this.client.send({
          type: 'memory.sync',
          requestId,
          since: this.lastSyncTimestamp!.toISOString(),
        })
      } catch {
        clearTimeout(timeout)
        resolve()
      }
    })
  }

  getLastSyncTimestamp(): Date | null {
    return this.lastSyncTimestamp
  }
}
