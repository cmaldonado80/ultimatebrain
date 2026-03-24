import { EventEmitter } from 'events'

export interface OpenClawConfig {
  wsUrl: string
  token?: string
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

export class OpenClawClient extends EventEmitter {
  private ws: WebSocket | null = null
  private config: Required<Omit<OpenClawConfig, 'token'>> & { token?: string }
  private reconnectAttempts = 0
  private connected = false
  private daemonVersion: string | null = null

  constructor(config: OpenClawConfig) {
    super()
    this.config = {
      wsUrl: config.wsUrl,
      token: config.token,
      reconnectInterval: config.reconnectInterval ?? 10_000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
    }
  }

  async connect(): Promise<void> {
    try {
      this.ws = new WebSocket(this.config.wsUrl)

      this.ws.onopen = () => {
        if (this.config.token) {
          // Send auth handshake before marking connected
          this.ws!.send(JSON.stringify({ type: 'auth', token: this.config.token }))
          // Wait for auth_ok/auth_failed in onmessage
        } else {
          this.markConnected()
        }
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data))

          // Handle auth response before anything else
          if (data.type === 'auth_ok') {
            this.markConnected()
            return
          }
          if (data.type === 'auth_failed') {
            console.error('[OpenClaw] Authentication failed:', data.reason ?? 'invalid token')
            this.emit('error', new Error(`OpenClaw auth failed: ${data.reason ?? 'invalid token'}`))
            this.ws?.close()
            return
          }

          // Route responses to waiting callers
          if (data.requestId) {
            if (data.error) {
              this.emit(`error:${data.requestId}`, data.error)
            } else {
              this.emit(`response:${data.requestId}`, data)
            }
          }

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

  private markConnected(): void {
    console.warn('[OpenClaw] Connected to daemon')
    this.connected = true
    this.reconnectAttempts = 0
    this.emit('connected')
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[OpenClaw] Max reconnect attempts reached')
      return
    }
    const delay = this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts)
    this.reconnectAttempts++
    console.warn(`[OpenClaw] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
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

  getDaemonVersion(): string | null {
    return this.daemonVersion
  }

  setDaemonVersion(version: string): void {
    this.daemonVersion = version
  }

  async disconnect(): Promise<void> {
    this.ws?.close()
    this.connected = false
  }
}
