import type { OpenClawClient } from './client'

export class OpenClawHealthMonitor {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private lastSeen: Date | null = null

  constructor(
    private client: OpenClawClient,
    private pingIntervalMs = 10_000,
  ) {
    // Track when we last got a response from the daemon
    this.client.on('message', () => {
      this.lastSeen = new Date()
    })
    this.client.on('connected', () => {
      this.lastSeen = new Date()
    })
  }

  start(): void {
    this.intervalId = setInterval(() => {
      if (this.client.isConnected()) {
        try {
          this.client.send({ type: 'ping' })
        } catch {
          console.warn('[OpenClaw Health] Ping failed')
        }
      }
    }, this.pingIntervalMs)
    console.warn(`[OpenClaw Health] Monitoring started (every ${this.pingIntervalMs}ms)`)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  getLastSeen(): Date | null {
    return this.lastSeen
  }
}
