import { vi } from 'vitest'

/**
 * Creates a mock GatewayRouter with sensible defaults for chat, embed,
 * and model resolution. Override individual methods with
 * `mock.chat.mockResolvedValueOnce(...)` in your tests.
 */
export function createMockGateway() {
  return {
    chat: vi.fn().mockResolvedValue({
      content: 'mock response',
      model: 'claude-haiku-4-5',
      tokensUsed: 100,
    }),

    embed: vi.fn().mockResolvedValue({
      embedding: Array(1536).fill(0.1),
      model: 'text-embedding-3-small',
      dimensions: 1536,
    }),

    resolveModel: vi.fn().mockReturnValue('claude-haiku-4-5'),
  }
}
