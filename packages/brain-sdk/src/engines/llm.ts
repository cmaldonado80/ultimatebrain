/**
 * LLM Engine — chat, streaming, embeddings
 *
 * Calls Brain REST API at /llm/chat, /llm/embed
 */

import type { RetryPolicy } from '../transport/retry'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  model?: string
  messages: ChatMessage[]
  maxTokens?: number
  temperature?: number
  tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>
}

export interface ChatResponse {
  content: string
  model: string
  toolUse?: { id: string; name: string; input: Record<string, unknown> } | null
}

export interface EmbedOptions {
  text: string | string[]
  model?: string
}

export interface EmbedResult {
  embeddings: number[][]
  model: string
  usage: { totalTokens: number }
}

export class LLMEngine {
  constructor(
    private fetch: (path: string, body: unknown) => Promise<unknown>,
    private retry: RetryPolicy,
  ) {}

  /** Send a chat completion request */
  async chat(options: ChatOptions): Promise<ChatResponse> {
    return this.retry.execute(async () => {
      const result = await this.fetch('/llm/chat', options)
      return result as ChatResponse
    })
  }

  /** Stream a chat completion (returns AsyncIterator) */
  async *chatStream(options: ChatOptions): AsyncIterableIterator<string> {
    const response = await this.retry.execute(async () => {
      return this.fetch('/llm/chat/stream', { ...options, stream: true }) as Promise<{
        chunks: string[]
      }>
    })

    const data = response as { chunks?: string[] }
    if (data.chunks) {
      for (const chunk of data.chunks) {
        yield chunk
      }
    }
  }

  /** Generate embeddings */
  async embed(options: EmbedOptions): Promise<EmbedResult> {
    return this.retry.execute(async () => {
      const result = await this.fetch('/llm/embed', options)
      return result as EmbedResult
    })
  }
}
