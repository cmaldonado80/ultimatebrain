/**
 * OpenClaw Channels Adapter — Routes messages between Brain and 26+ channels.
 *
 * Inbound:  OpenClaw receives WhatsApp/Telegram/Slack message → Brain creates
 *           a chat session and optionally a ticket for agent processing.
 * Outbound: Brain sends response → OpenClaw delivers via the originating channel.
 */
import type { OpenClawClient } from './client'

// ── Types ────────────────────────────────────────────────────────────

export interface ChannelMessage {
  channel: string // 'whatsapp', 'telegram', 'slack', 'discord', etc.
  sender: string // channel-specific sender ID
  senderName?: string
  content: string
  timestamp: string
  metadata?: Record<string, unknown>
}

export interface ChannelStatus {
  channel: string
  connected: boolean
  lastMessage?: Date
}

export type InboundHandler = (message: ChannelMessage) => void | Promise<void>

// ── Adapter ──────────────────────────────────────────────────────────

export class OpenClawChannels {
  private handlers: InboundHandler[] = []
  private channelStatuses = new Map<string, ChannelStatus>()

  constructor(private client: OpenClawClient) {
    this.client.on('message', (data: Record<string, unknown>) => {
      if (data.type === 'message.incoming') {
        this.handleInbound(data.message as ChannelMessage)
      }
      if (data.type === 'channel.status') {
        const status = data as unknown as { channel: string; connected: boolean }
        this.channelStatuses.set(status.channel, {
          channel: status.channel,
          connected: status.connected,
        })
      }
    })
  }

  /** Register a handler for inbound messages from any channel. */
  onMessage(handler: InboundHandler): void {
    this.handlers.push(handler)
  }

  /** Remove a previously registered handler. */
  offMessage(handler: InboundHandler): void {
    this.handlers = this.handlers.filter((h) => h !== handler)
  }

  private handleInbound(message: ChannelMessage): void {
    for (const handler of this.handlers) {
      try {
        const result = handler(message)
        if (result instanceof Promise) {
          result.catch((err) => console.warn('[OpenClaw Channels] Handler error:', err))
        }
      } catch (err) {
        console.warn('[OpenClaw Channels] Handler error:', err)
      }
    }
  }

  /**
   * Send a message through an OpenClaw channel.
   * The channel must be connected on the OpenClaw side.
   */
  async sendMessage(
    channel: string,
    to: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<{ delivered: boolean; messageId?: string }> {
    if (!this.client.isConnected()) {
      throw new Error('OpenClaw daemon not connected')
    }

    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID()
      const timeout = setTimeout(() => {
        this.client.removeAllListeners(`response:${requestId}`)
        reject(new Error(`Channel send timed out after 30s`))
      }, 30_000)

      this.client.once(
        `response:${requestId}`,
        (data: { delivered: boolean; messageId?: string }) => {
          clearTimeout(timeout)
          resolve(data)
        },
      )

      this.client.once(`error:${requestId}`, (err: { message: string }) => {
        clearTimeout(timeout)
        reject(new Error(`Channel send failed: ${err.message}`))
      })

      this.client.send({
        type: 'channel.send',
        requestId,
        channel,
        to,
        content,
        metadata,
      })
    })
  }

  /** List currently connected channels. */
  getConnectedChannels(): ChannelStatus[] {
    return Array.from(this.channelStatuses.values()).filter((s) => s.connected)
  }

  /** Get status of all known channels. */
  getAllChannelStatuses(): ChannelStatus[] {
    return Array.from(this.channelStatuses.values())
  }
}
