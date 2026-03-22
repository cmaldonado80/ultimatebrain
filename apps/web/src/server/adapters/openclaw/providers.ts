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

export class OpenClawProviders {
  constructor(private client: OpenClawClient) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // TODO: Route through OpenClaw daemon's 20+ LLM providers
    // For now, stub response
    throw new Error('OpenClaw chat not yet implemented. Build AI Gateway (Phase 1) first.')
  }

  async embed(text: string, model?: string): Promise<number[]> {
    // TODO: Route through OpenClaw embedding providers
    throw new Error('OpenClaw embed not yet implemented. Build AI Gateway (Phase 1) first.')
  }

  async complete(prompt: string, model?: string): Promise<string> {
    // TODO: Simple completion endpoint
    throw new Error('OpenClaw complete not yet implemented. Build AI Gateway (Phase 1) first.')
  }
}
