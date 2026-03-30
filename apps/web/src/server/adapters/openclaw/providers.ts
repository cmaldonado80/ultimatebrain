import type { ProviderAdapter } from '../../services/gateway'
import type { OpenClawClient } from './client'

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

  /**
   * Streaming chat — sends a stream request and yields tokens as they arrive.
   * Falls back to single-chunk if daemon doesn't support streaming.
   */
  async *chatStream(params: {
    model: string
    messages: Array<{ role: string; content: string }>
    tools?: unknown[]
    apiKey?: string
    temperature?: number
    maxTokens?: number
  }): AsyncGenerator<string, void, unknown> {
    if (!this.client.isConnected()) {
      throw new Error('OpenClaw daemon not connected')
    }

    const requestId = crypto.randomUUID()
    const chunks: string[] = []
    let done = false
    let error: Error | null = null

    // Set up listeners for streaming chunks
    const onChunk = (data: { content?: string; delta?: string; done?: boolean }) => {
      const text = data.delta ?? data.content ?? ''
      if (text) chunks.push(text)
      if (data.done) done = true
    }
    const onError = (err: { message: string }) => {
      error = new Error(`OpenClaw stream error: ${err.message}`)
      done = true
    }
    const onResponse = (data: ChatResponse) => {
      // Non-streaming fallback — daemon sent full response
      if (data.content) chunks.push(data.content)
      done = true
    }

    this.client.on(`chunk:${requestId}`, onChunk)
    this.client.once(`error:${requestId}`, onError)
    this.client.once(`response:${requestId}`, onResponse)

    // Send stream request
    this.client.send({
      type: 'chat',
      requestId,
      model: params.model,
      messages: params.messages,
      tools: params.tools,
      stream: true,
    })

    // Yield chunks as they arrive (poll with small delay)
    const timeout = Date.now() + 120_000
    let yielded = 0
    try {
      while (!done && Date.now() < timeout) {
        if (chunks.length > yielded) {
          while (yielded < chunks.length) {
            yield chunks[yielded]!
            yielded++
          }
        }
        await new Promise((r) => setTimeout(r, 10))
      }
      // Yield any remaining chunks
      while (yielded < chunks.length) {
        yield chunks[yielded]!
        yielded++
      }
      if (error) throw error
      if (!done) throw new Error('OpenClaw stream timed out after 120s')
    } finally {
      this.client.removeAllListeners(`chunk:${requestId}`)
      this.client.removeAllListeners(`error:${requestId}`)
      this.client.removeAllListeners(`response:${requestId}`)
    }
  }
}
