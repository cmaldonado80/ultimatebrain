/**
 * Offline Request Queue
 *
 * Buffers requests when Brain is unreachable, replays on reconnect.
 */

export interface QueuedRequest {
  id: string
  method: string
  path: string
  body?: unknown
  queuedAt: Date
  retries: number
}

export class RequestQueue {
  private queue: QueuedRequest[] = []
  private _isOnline = true
  private onDrain?: (request: QueuedRequest) => Promise<void>

  get isOnline(): boolean {
    return this._isOnline
  }

  get size(): number {
    return this.queue.length
  }

  /** Set the handler called when draining the queue */
  setDrainHandler(handler: (request: QueuedRequest) => Promise<void>): void {
    this.onDrain = handler
  }

  /** Add a request to the queue (when offline) */
  enqueue(method: string, path: string, body?: unknown): string {
    const id = crypto.randomUUID()
    this.queue.push({ id, method, path, body, queuedAt: new Date(), retries: 0 })
    return id
  }

  /** Mark connection as online and drain the queue */
  async goOnline(): Promise<{ sent: number; failed: number }> {
    this._isOnline = true
    return this.drain()
  }

  /** Mark connection as offline */
  goOffline(): void {
    this._isOnline = false
  }

  /** Drain all queued requests in order */
  private async drain(): Promise<{ sent: number; failed: number }> {
    if (!this.onDrain) return { sent: 0, failed: 0 }

    let sent = 0
    let failed = 0
    const pending = [...this.queue]
    this.queue = []

    for (const req of pending) {
      try {
        await this.onDrain(req)
        sent++
      } catch (err) {
        console.warn(`[RequestQueue] Drain failed for ${req.method} ${req.path} (attempt ${req.retries + 1}):`, err)
        req.retries++
        if (req.retries < 3) {
          this.queue.push(req)
        }
        failed++
      }
    }

    return { sent, failed }
  }

  /** Clear the queue */
  clear(): void {
    this.queue = []
  }
}
