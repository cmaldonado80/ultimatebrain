import type { OpenClawClient } from './client'
import type { ProviderAdapter } from '../../services/gateway'

export interface ChatRequest {
  model: string
  messages: Array<{ role: string; content: string }>
  tools?: unknown[]
  stream?: boolean
}

export interface ChatResponse {
  content: string
  model: string
  tokensIn: number
  tokensOut: number
  latencyMs: number
}

/**
 * OpenClaw adapter implementing ProviderAdapter.
 * Routes LLM calls through OpenClaw daemon's 20+ providers via WebSocket.
 */
export class OpenClawProviders implements ProviderAdapter {
  constructor(private client: OpenClawClient) {}

  async chat(params: {
    model: string
    messages: Array<{ role: string; content: string }>
    tools?: unknown[]
    apiKey?: string
  }): Promise<{ content: string; tokensIn: number; tokensOut: number }> {
    if (!this.client.isConnected()) {
      throw new Error('OpenClaw daemon not connected')
    }

    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID()
      const timeout = setTimeout(() => {
        this.client.removeAllListeners(`response:${requestId}`)
        reject(new Error('OpenClaw chat request timed out after 120s'))
      }, 120_000)

      this.client.once(`response:${requestId}`, (data: ChatResponse) => {
        clearTimeout(timeout)
        resolve({
          content: data.content,
          tokensIn: data.tokensIn,
          tokensOut: data.tokensOut,
        })
      })

      this.client.once(`error:${requestId}`, (err: { message: string }) => {
        clearTimeout(timeout)
        reject(new Error(`OpenClaw error: ${err.message}`))
      })

      this.client.send({
        type: 'chat',
        requestId,
        model: params.model,
        messages: params.messages,
        tools: params.tools,
      })
    })
  }

  async embed(params: {
    text: string
    model?: string
    apiKey?: string
  }): Promise<{ embedding: number[]; dimensions: number }> {
    if (!this.client.isConnected()) {
      throw new Error('OpenClaw daemon not connected')
    }

    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID()
      const timeout = setTimeout(() => {
        this.client.removeAllListeners(`response:${requestId}`)
        reject(new Error('OpenClaw embed request timed out after 30s'))
      }, 30_000)

      this.client.once(`response:${requestId}`, (data: { embedding: number[] }) => {
        clearTimeout(timeout)
        resolve({
          embedding: data.embedding,
          dimensions: data.embedding.length,
        })
      })

      this.client.once(`error:${requestId}`, (err: { message: string }) => {
        clearTimeout(timeout)
        reject(new Error(`OpenClaw embed error: ${err.message}`))
      })

      this.client.send({
        type: 'embed',
        requestId,
        text: params.text,
        model: params.model ?? 'text-embedding-3-small',
      })
    })
  }
}
