/**
 * Healing Engine — real-time incident monitoring
 */

export interface Incident {
  id: string
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  source: string
  detectedAt: string
  resolvedAt?: string
  resolution?: string
}

export type IncidentListener = (incident: Incident) => void

export class HealingEngine {
  private listeners: IncidentListener[] = []
  private ws: WebSocket | null = null

  constructor(private wsUrl: string) {}

  /** Subscribe to incident events */
  onIncident(listener: IncidentListener): () => void {
    this.listeners.push(listener)
    this.ensureConnected()
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  /** Connect the WebSocket if not already connected */
  private ensureConnected(): void {
    if (this.ws) return
    try {
      this.ws = new WebSocket(this.wsUrl)
      this.ws.onmessage = (event) => {
        try {
          const incident = JSON.parse(event.data) as Incident
          for (const listener of this.listeners) listener(incident)
        } catch (err) { console.warn('[HealingEngine] Malformed WebSocket message:', err) }
      }
      this.ws.onclose = () => {
        this.ws = null
        // Auto-reconnect after 5s if there are listeners
        if (this.listeners.length > 0) {
          setTimeout(() => this.ensureConnected(), 5000)
        }
      }
    } catch (err) {
      console.warn('[HealingEngine] WebSocket connection failed:', err)
      this.ws = null
    }
  }

  /** Disconnect the WebSocket */
  disconnect(): void {
    this.ws?.close()
    this.ws = null
    this.listeners = []
  }
}
