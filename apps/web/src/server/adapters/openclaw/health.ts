import type { OpenClawClient } from './client'

export class OpenClawHealthMonitor {
  private intervalId: ReturnType<typeof setInterval> | null = null

  constructor(
    private client: OpenClawClient,
    private pingIntervalMs = 10_000,
  ) {}

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
    console.log(`[OpenClaw Health] Monitoring started (every ${this.pingIntervalMs}ms)`)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }
}
