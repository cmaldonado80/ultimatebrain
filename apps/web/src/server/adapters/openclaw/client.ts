import { EventEmitter } from 'events'

export interface OpenClawConfig {
  wsUrl: string
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

export class OpenClawClient extends EventEmitter {
  private ws: WebSocket | null = null
  private config: Required<OpenClawConfig>
  private reconnectAttempts = 0
  private connected = false

  constructor(config: OpenClawConfig) {
    super()
    this.config = {
      wsUrl: config.wsUrl,
      reconnectInterval: config.reconnectInterval ?? 10_000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
    }
  }

  async connect(): Promise<void> {
    try {
      this.ws = new WebSocket(this.config.wsUrl)

      this.ws.onopen = () => {
        console.log('[OpenClaw] Connected to daemon')
        this.connected = true
        this.reconnectAttempts = 0
        this.emit('connected')
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data))
          this.emit('message', data)
        } catch (e) {
          console.warn('[OpenClaw] Failed to parse message:', e)
        }
      }

      this.ws.onclose = () => {
        this.connected = false
        this.emit('disconnected')
        this.scheduleReconnect()
      }

      this.ws.onerror = (err) => {
        console.error('[OpenClaw] WebSocket error:', err)
        this.emit('error', err)
      }
    } catch (err) {
      console.error('[OpenClaw] Connection failed:', err)
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[OpenClaw] Max reconnect attempts reached')
      return
    }
    const delay = this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts)
    this.reconnectAttempts++
    console.log(`[OpenClaw] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
    setTimeout(() => this.connect(), delay)
  }

  send(data: unknown): void {
    if (!this.ws || !this.connected) {
      throw new Error('[OpenClaw] Not connected')
    }
    this.ws.send(JSON.stringify(data))
  }

  isConnected(): boolean {
    return this.connected
  }

  async disconnect(): Promise<void> {
    this.ws?.close()
    this.connected = false
  }
}
