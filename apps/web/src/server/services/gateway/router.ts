/**
 * AI Gateway Router — the central nervous system for all LLM calls.
 *
 * Accept: { model, messages, agent_id, ticket_id, stream? }
 * 1. Resolve provider from model name
 * 2. Check circuit breaker state
 * 3. If open: try next in fallback chain
 * 4. Check rate limits
 * 5. Check semantic cache
 * 6. Route through OpenClaw (primary) or direct fallback
 * 7. Record metrics + cost
 * 8. Cache response if cacheable
 */

import type { Database } from '@solarc/db'
import type { LlmChatInput, LlmChatOutput } from '@solarc/engine-contracts'

// Tracer types — inline stubs (tracing service removed as dead code)
interface Span {
  traceId: string
  spanId: string
  setAttribute(key: string, value: unknown): void
  setStatus(status: string): void
  recordError(err: unknown): void
  end(): Promise<void>
}

interface Tracer {
  start(name: string, options?: Record<string, unknown>): Span | undefined
}
import { SemanticCache, shouldSkipCache } from './cache'
import { CircuitBreakerRegistry } from './circuit-breaker'
import { CostTracker } from './cost-tracker'
import { KeyVault } from './key-vault'
import { RateLimiter } from './rate-limiter'

// === Provider Resolution ===

export type ProviderName = 'anthropic' | 'openai' | 'google' | 'ollama' | 'openclaw'

interface ResolvedProvider {
  provider: ProviderName
  model: string
}

const MODEL_TO_PROVIDER: Record<string, ProviderName> = {
  // Anthropic
  'claude-opus-4-6': 'anthropic',
  'claude-sonnet-4-6': 'anthropic',
  'claude-haiku-4-5': 'anthropic',
  // OpenAI
  'gpt-4o': 'openai',
  'gpt-4o-mini': 'openai',
  'gpt-4.1': 'openai',
  'gpt-4.1-mini': 'openai',
  'gpt-4.1-nano': 'openai',
  o3: 'openai',
  'o3-mini': 'openai',
  'o4-mini': 'openai',
  // Google
  'gemini-2.5-pro': 'google',
  'gemini-2.5-flash': 'google',
  'gemini-2.0-flash': 'google',
}

/** Default fallback chains when a provider is down */
const DEFAULT_FALLBACKS: Record<ProviderName, ProviderName[]> = {
  anthropic: ['ollama', 'openai', 'google'],
  openai: ['ollama', 'anthropic', 'google'],
  google: ['ollama', 'anthropic', 'openai'],
  ollama: ['google', 'openai', 'anthropic'],
  openclaw: ['ollama', 'anthropic', 'openai', 'google'],
}

/** Map to equivalent model on fallback provider */
const MODEL_EQUIVALENTS: Record<string, Record<ProviderName, string>> = {
  'claude-sonnet-4-6': {
    anthropic: 'claude-sonnet-4-6',
    openai: 'gpt-4o',
    google: 'gemini-2.5-pro',
    ollama: 'qwen3.5:cloud',
    openclaw: 'claude-sonnet-4-6',
  },
  'claude-opus-4-6': {
    anthropic: 'claude-opus-4-6',
    openai: 'gpt-4.1',
    google: 'gemini-2.5-pro',
    ollama: 'deepseek-v3.2:cloud',
    openclaw: 'claude-opus-4-6',
  },
  'claude-haiku-4-5': {
    anthropic: 'claude-haiku-4-5',
    openai: 'gpt-4o-mini',
    google: 'gemini-2.5-flash',
    ollama: 'qwen3.5:cloud',
    openclaw: 'claude-haiku-4-5',
  },
  'gpt-4o': {
    anthropic: 'claude-sonnet-4-6',
    openai: 'gpt-4o',
    google: 'gemini-2.5-pro',
    ollama: 'qwen3.5:cloud',
    openclaw: 'gpt-4o',
  },
}

function resolveProvider(model: string): ResolvedProvider {
  // Check for Ollama models (contain colon or ollama/ prefix)
  if (model.includes(':') || model.startsWith('ollama/')) {
    return { provider: 'ollama', model }
  }

  const provider = MODEL_TO_PROVIDER[model]
  if (!provider) {
    // Default to OpenClaw for unknown models (it supports 20+ providers)
    return { provider: 'openclaw', model }
  }

  return { provider, model }
}

function getEquivalentModel(originalModel: string, targetProvider: ProviderName): string {
  const equivalents = MODEL_EQUIVALENTS[originalModel]
  if (equivalents?.[targetProvider]) return equivalents[targetProvider]
  // No mapping — the target provider will use its default
  return originalModel
}

// === Provider Adapters ===

export interface ProviderAdapter {
  chat(params: {
    model: string
    messages: Array<{ role: string; content: string }>
    tools?: unknown[]
    apiKey?: string
    temperature?: number
    maxTokens?: number
  }): Promise<{
    content: string
    tokensIn: number
    tokensOut: number
    toolUse?: { id: string; name: string; input: Record<string, unknown> }
  }>

  chatStream?(params: {
    model: string
    messages: Array<{ role: string; content: string }>
    apiKey?: string
    temperature?: number
    maxTokens?: number
  }): AsyncGenerator<string, void, unknown>

  embed?(params: { text: string; model?: string; apiKey?: string }): Promise<{
    embedding: number[]
    dimensions: number
  }>
}

// === Gateway Router ===

export interface GatewayConfig {
  /** Primary routing strategy */
  primaryRoute: 'openclaw' | 'direct'
  /** Default model when none specified */
  defaultModel: string
  /** Enable semantic cache */
  cacheEnabled: boolean
}

const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
  primaryRoute: 'openclaw',
  defaultModel: process.env.DEFAULT_MODEL ?? 'qwen3-coder:480b-cloud',
  cacheEnabled: true,
}

// === Built-in Provider Adapters ===

class AnthropicAdapter implements ProviderAdapter {
  async chat(params: {
    model: string
    messages: Array<{ role: string; content: string }>
    tools?: unknown[]
    apiKey?: string
    temperature?: number
    maxTokens?: number
  }) {
    const apiKey = params.apiKey ?? process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('No Anthropic API key available')
    const systemMsg = params.messages.find((m) => m.role === 'system')
    const nonSystemMsgs = params.messages.filter((m) => m.role !== 'system')
    const body: Record<string, unknown> = {
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      messages: nonSystemMsgs.map((m) => ({
        role: m.role === 'agent' ? 'assistant' : m.role,
        content: m.content,
      })),
    }
    if (systemMsg) body.system = systemMsg.content
    if (params.temperature != null) body.temperature = params.temperature
    if (params.tools && params.tools.length > 0) body.tools = params.tools
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Anthropic API error ${res.status}: ${err}`)
    }
    const data = (await res.json()) as {
      content: Array<{
        type: string
        text?: string
        id?: string
        name?: string
        input?: Record<string, unknown>
      }>
      usage: { input_tokens: number; output_tokens: number }
    }
    // Check for tool_use in response
    const toolUseBlock = data.content.find((b) => b.type === 'tool_use')
    if (toolUseBlock) {
      return {
        content: data.content
          .filter((c) => c.type === 'text')
          .map((c) => c.text ?? '')
          .join(''),
        tokensIn: data.usage.input_tokens,
        tokensOut: data.usage.output_tokens,
        toolUse: {
          id: toolUseBlock.id!,
          name: toolUseBlock.name!,
          input: toolUseBlock.input!,
        },
      }
    }
    const text = data.content
      .filter((c: { type: string }) => c.type === 'text')
      .map((c: { text?: string }) => c.text ?? '')
      .join('')
    return { content: text, tokensIn: data.usage.input_tokens, tokensOut: data.usage.output_tokens }
  }

  async *chatStream(params: {
    model: string
    messages: Array<{ role: string; content: string }>
    apiKey?: string
    temperature?: number
    maxTokens?: number
  }): AsyncGenerator<string, void, unknown> {
    const apiKey = params.apiKey ?? process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('No Anthropic API key available')
    const systemMsg = params.messages.find((m) => m.role === 'system')
    const nonSystemMsgs = params.messages.filter((m) => m.role !== 'system')
    const body: Record<string, unknown> = {
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      stream: true,
      messages: nonSystemMsgs.map((m) => ({
        role: m.role === 'agent' ? 'assistant' : m.role,
        content: m.content,
      })),
    }
    if (systemMsg) body.system = systemMsg.content
    if (params.temperature != null) body.temperature = params.temperature
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`)
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const json = line.slice(6)
        if (json === '[DONE]') return
        try {
          const event = JSON.parse(json) as {
            type: string
            delta?: { type: string; text?: string }
          }
          if (event.type === 'content_block_delta' && event.delta?.text) {
            yield event.delta.text
          }
        } catch {
          /* skip malformed */
        }
      }
    }
  }
}

class OpenAIAdapter implements ProviderAdapter {
  async chat(params: {
    model: string
    messages: Array<{ role: string; content: string }>
    tools?: unknown[]
    apiKey?: string
    temperature?: number
    maxTokens?: number
  }) {
    const apiKey = params.apiKey ?? process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('No OpenAI API key available')
    const body: Record<string, unknown> = {
      model: params.model,
      messages: params.messages.map((m) => ({
        role: m.role === 'agent' ? 'assistant' : m.role,
        content: m.content,
      })),
    }
    if (params.temperature != null) body.temperature = params.temperature
    if (params.maxTokens != null) body.max_tokens = params.maxTokens
    if (params.tools && (params.tools as unknown[]).length > 0) {
      body.tools = (
        params.tools as Array<{
          name: string
          description?: string
          input_schema?: Record<string, unknown>
        }>
      ).map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }))
    }
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI API error ${res.status}: ${err}`)
    }
    const data = (await res.json()) as {
      choices: Array<{
        message: {
          content: string | null
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
        }
      }>
      usage: { prompt_tokens: number; completion_tokens: number }
    }
    const toolCall = data.choices[0]?.message?.tool_calls?.[0]
    if (toolCall) {
      return {
        content: data.choices[0]?.message?.content ?? '',
        tokensIn: data.usage.prompt_tokens,
        tokensOut: data.usage.completion_tokens,
        toolUse: {
          id: toolCall.id,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments) as Record<string, unknown>,
        },
      }
    }
    return {
      content: data.choices[0]?.message?.content ?? '',
      tokensIn: data.usage.prompt_tokens,
      tokensOut: data.usage.completion_tokens,
    }
  }

  async *chatStream(params: {
    model: string
    messages: Array<{ role: string; content: string }>
    apiKey?: string
  }): AsyncGenerator<string, void, unknown> {
    const apiKey = params.apiKey ?? process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('No OpenAI API key available')
    const body = {
      model: params.model,
      stream: true,
      messages: params.messages.map((m) => ({
        role: m.role === 'agent' ? 'assistant' : m.role,
        content: m.content,
      })),
    }
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`)
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const json = line.slice(6)
        if (json === '[DONE]') return
        try {
          const event = JSON.parse(json) as { choices: Array<{ delta?: { content?: string } }> }
          if (event.choices?.[0]?.delta?.content) {
            yield event.choices[0].delta.content
          }
        } catch {
          /* skip malformed */
        }
      }
    }
  }
}

class GoogleAdapter implements ProviderAdapter {
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai'

  async chat(params: {
    model: string
    messages: Array<{ role: string; content: string }>
    tools?: unknown[]
    apiKey?: string
    temperature?: number
    maxTokens?: number
  }) {
    const apiKey = params.apiKey ?? process.env.GOOGLE_API_KEY
    if (!apiKey) throw new Error('No Google API key available')
    const body: Record<string, unknown> = {
      model: params.model,
      messages: params.messages.map((m) => ({
        role: m.role === 'agent' ? 'assistant' : m.role,
        content: m.content,
      })),
    }
    if (params.temperature != null) body.temperature = params.temperature
    if (params.maxTokens != null) body.max_tokens = params.maxTokens
    if (params.tools && (params.tools as unknown[]).length > 0) {
      body.tools = (
        params.tools as Array<{
          name: string
          description?: string
          input_schema?: Record<string, unknown>
        }>
      ).map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }))
    }
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Google API error ${res.status}: ${err}`)
    }
    const data = (await res.json()) as {
      choices: Array<{
        message: {
          content: string | null
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
        }
      }>
      usage: { prompt_tokens: number; completion_tokens: number }
    }
    const toolCall = data.choices[0]?.message?.tool_calls?.[0]
    if (toolCall) {
      return {
        content: data.choices[0]?.message?.content ?? '',
        tokensIn: data.usage?.prompt_tokens ?? 0,
        tokensOut: data.usage?.completion_tokens ?? 0,
        toolUse: {
          id: toolCall.id,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments) as Record<string, unknown>,
        },
      }
    }
    return {
      content: data.choices[0]?.message?.content ?? '',
      tokensIn: data.usage?.prompt_tokens ?? 0,
      tokensOut: data.usage?.completion_tokens ?? 0,
    }
  }

  async *chatStream(params: {
    model: string
    messages: Array<{ role: string; content: string }>
    apiKey?: string
  }): AsyncGenerator<string, void, unknown> {
    const apiKey = params.apiKey ?? process.env.GOOGLE_API_KEY
    if (!apiKey) throw new Error('No Google API key available')
    const body = {
      model: params.model,
      stream: true,
      messages: params.messages.map((m) => ({
        role: m.role === 'agent' ? 'assistant' : m.role,
        content: m.content,
      })),
    }
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Google API error ${res.status}: ${await res.text()}`)
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const json = line.slice(6)
        if (json === '[DONE]') return
        try {
          const event = JSON.parse(json) as { choices: Array<{ delta?: { content?: string } }> }
          if (event.choices?.[0]?.delta?.content) {
            yield event.choices[0].delta.content
          }
        } catch {
          /* skip malformed */
        }
      }
    }
  }
}

class OllamaAdapter implements ProviderAdapter {
  /** Resolved Ollama Cloud URL (set by GatewayRouter before use) */
  resolvedUrl: string | null = null

  private getBaseUrl(): string {
    const url = this.resolvedUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'
    // Strip trailing slashes and any trailing /api to prevent double /api/api paths
    return url.replace(/\/+$/, '').replace(/\/api$/, '')
  }

  private buildHeaders(apiKey?: string): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) {
      // Strip any existing "Bearer " prefix to avoid "Bearer Bearer ..." duplication
      const cleanKey = apiKey.replace(/^Bearer\s+/i, '').trim()
      headers['Authorization'] = `Bearer ${cleanKey}`
    }
    return headers
  }

  /**
   * Pull a model from the Ollama registry (local or cloud).
   * POST /api/pull with { model, stream: false }
   */
  async pullModel(model: string, apiKey?: string): Promise<{ status: string; error?: string }> {
    const baseUrl = this.getBaseUrl()
    const url = `${baseUrl}/api/pull`
    const keyPreview = apiKey
      ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)} (len=${apiKey.length})`
      : 'none'
    console.warn(`[Ollama] pull → ${url} (model=${model}, key=${keyPreview})`)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(apiKey),
        body: JSON.stringify({ model: model.replace('ollama/', ''), stream: false }),
      })
      if (!res.ok) {
        const err = await res.text()
        return {
          status: 'error',
          error: `Ollama pull failed (${res.status}): ${err} [url=${url}, key=${keyPreview}]`,
        }
      }
      const data = (await res.json()) as { status?: string; error?: string }
      return { status: data.status ?? 'success', error: data.error }
    } catch (err) {
      return {
        status: 'error',
        error: err instanceof Error ? err.message : 'Pull request failed',
      }
    }
  }

  /**
   * List models available on the Ollama instance (GET /api/tags).
   */
  async listModels(
    apiKey?: string,
  ): Promise<Array<{ name: string; size: number; modifiedAt: string }>> {
    const baseUrl = this.getBaseUrl()
    try {
      const res = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET',
        headers: this.buildHeaders(apiKey),
      })
      if (!res.ok) return []
      const data = (await res.json()) as {
        models?: Array<{ name: string; size: number; modified_at: string }>
      }
      return (data.models ?? []).map((m) => ({
        name: m.name,
        size: m.size,
        modifiedAt: m.modified_at,
      }))
    } catch {
      return []
    }
  }

  async chat(params: {
    model: string
    messages: Array<{ role: string; content: string }>
    tools?: unknown[]
    format?: unknown
    apiKey?: string
    temperature?: number
    maxTokens?: number
  }) {
    const baseUrl = this.getBaseUrl()
    const body: Record<string, unknown> = {
      model: params.model.replace('ollama/', ''),
      messages: params.messages.map((m) => {
        const role = m.role === 'agent' ? 'assistant' : m.role
        const msg: Record<string, unknown> = { role, content: m.content }
        // Ollama API requires tool_name for role:"tool" messages (tool result)
        if (role === 'tool' && (m as Record<string, unknown>).tool_name) {
          msg.tool_name = (m as Record<string, unknown>).tool_name
        }
        return msg
      }),
      stream: false,
    }
    if (params.temperature != null) body.temperature = params.temperature
    if (params.maxTokens != null) body.num_predict = params.maxTokens

    // Tool calling support — Ollama uses OpenAI-compatible format
    if (params.tools && params.tools.length > 0) {
      body.tools = (
        params.tools as Array<{ name: string; description?: string; input_schema: unknown }>
      ).map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description ?? '',
          parameters: t.input_schema,
        },
      }))
    }

    // Structured output — pass JSON schema via format parameter
    if (params.format) body.format = params.format

    console.warn(
      `[OllamaAdapter] POST ${baseUrl}/api/chat model=${params.model} tools=${body.tools ? (body.tools as unknown[]).length : 0}`,
    )

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: this.buildHeaders(params.apiKey),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Ollama API error ${res.status}: ${err}`)
    }
    const data = (await res.json()) as {
      message: {
        content: string
        tool_calls?: Array<{
          function: { name: string; arguments: Record<string, unknown> }
        }>
      }
      prompt_eval_count?: number
      eval_count?: number
    }

    console.warn(
      `[OllamaAdapter] Response: tool_calls=${data.message.tool_calls?.length ?? 0} content_len=${data.message.content?.length ?? 0} content_preview=${data.message.content?.slice(0, 100)}`,
    )

    // Parse tool call response if present
    let toolUse: { id: string; name: string; input: Record<string, unknown> } | undefined
    if (data.message.tool_calls?.[0]) {
      const tc = data.message.tool_calls[0]
      toolUse = {
        id: `ollama-${Date.now()}`,
        name: tc.function.name,
        input: tc.function.arguments,
      }
    }

    // Fallback: if model returned text with tool-like syntax instead of using
    // the tool_calls API (common with cloud-routed models via OpenClaw),
    // try to parse tool invocations from the text content
    if (!toolUse && params.tools && params.tools.length > 0 && data.message.content) {
      const content = data.message.content
      const toolNames = (params.tools as Array<{ name: string }>).map((t) => t.name)

      // Match patterns like: file_system({"action":"list","path":"..."})
      // or <tool_code> file_system.action(path="...") </tool_code>
      // or {"name":"file_system","arguments":{"action":"list"}}
      for (const toolName of toolNames) {
        // Pattern 1: tool_name({"key":"value"})
        const fnCallMatch = content.match(new RegExp(`${toolName}\\s*\\(\\s*(\\{[^}]+\\})\\s*\\)`))
        if (fnCallMatch) {
          try {
            toolUse = {
              id: `ollama-text-${Date.now()}`,
              name: toolName,
              input: JSON.parse(fnCallMatch[1]),
            }
            break
          } catch {
            /* not valid JSON */
          }
        }

        // Pattern 2: action="list", path="..." after tool name mention
        if (content.includes(toolName)) {
          const jsonMatch = content.match(
            /\{[^{}]*"action"\s*:\s*"[^"]+"\s*,\s*"path"\s*:\s*"[^"]+"\s*[^{}]*\}/,
          )
          if (jsonMatch) {
            try {
              toolUse = {
                id: `ollama-text-${Date.now()}`,
                name: toolName,
                input: JSON.parse(jsonMatch[0]),
              }
              break
            } catch {
              /* not valid JSON */
            }
          }
        }
      }
    }

    return {
      content: data.message.content,
      tokensIn: data.prompt_eval_count ?? 0,
      tokensOut: data.eval_count ?? 0,
      toolUse,
    }
  }

  async *chatStream(params: {
    model: string
    messages: Array<{ role: string; content: string }>
    tools?: unknown[]
    apiKey?: string
  }): AsyncGenerator<string, void, unknown> {
    const baseUrl = this.getBaseUrl()
    const body: Record<string, unknown> = {
      model: params.model.replace('ollama/', ''),
      messages: params.messages.map((m) => ({
        role: m.role === 'agent' ? 'assistant' : m.role,
        content: m.content,
      })),
      stream: true,
    }

    // Tool calling support in streaming mode
    if (params.tools && params.tools.length > 0) {
      body.tools = (
        params.tools as Array<{ name: string; description?: string; input_schema: unknown }>
      ).map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description ?? '',
          parameters: t.input_schema,
        },
      }))
    }
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: this.buildHeaders(params.apiKey),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Ollama API error ${res.status}: ${err}`)
    }
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const chunk = JSON.parse(line) as { message?: { content?: string }; done?: boolean }
          if (chunk.message?.content) yield chunk.message.content
          if (chunk.done) return
        } catch {
          /* skip malformed lines */
        }
      }
    }
  }
}

// === Gateway Router ===

export class GatewayRouter {
  readonly circuitBreaker: CircuitBreakerRegistry
  readonly costTracker: CostTracker
  readonly rateLimiter: RateLimiter
  readonly cache: SemanticCache
  readonly keyVault: KeyVault
  private adapters = new Map<ProviderName, ProviderAdapter>()
  private config: GatewayConfig
  private tracer?: Tracer

  constructor(_db: Database, config?: Partial<GatewayConfig>, tracer?: Tracer) {
    this.config = { ...DEFAULT_GATEWAY_CONFIG, ...config }
    this.circuitBreaker = new CircuitBreakerRegistry()
    this.costTracker = new CostTracker(_db)
    this.rateLimiter = new RateLimiter()
    this.cache = new SemanticCache(_db)
    this.keyVault = new KeyVault(_db)
    this.tracer = tracer
    this.initAdapters()
  }

  /** Register built-in provider adapters so the gateway works out of the box. */
  private initAdapters(): void {
    this.adapters.set('anthropic', new AnthropicAdapter())
    this.adapters.set('openai', new OpenAIAdapter())
    this.adapters.set('google', new GoogleAdapter())
    this.adapters.set('ollama', new OllamaAdapter())

    // Wire OpenClaw adapter if daemon URL is configured
    this.initOpenClawAdapter().catch((err) =>
      console.warn('[Gateway] operation failed:', err.message),
    )
  }

  /** Lazily connect the OpenClaw adapter (non-blocking, startup continues). */
  private async initOpenClawAdapter(): Promise<void> {
    try {
      const { env } = await import('../../../env')
      if (!env.OPENCLAW_WS) return

      const { initOpenClaw, getOpenClawProviders } =
        await import('../../adapters/openclaw/bootstrap')
      await initOpenClaw()
      const ocProviders = getOpenClawProviders()
      if (ocProviders) {
        this.adapters.set('openclaw', ocProviders)
        console.warn('[Gateway] OpenClaw adapter registered')
      }
    } catch (err) {
      console.warn('[Gateway] OpenClaw adapter not available:', err)
    }
  }

  /** Attach a tracer after construction (e.g. when wiring DI) */
  setTracer(tracer: Tracer): void {
    this.tracer = tracer
  }

  /** Register a provider adapter (OpenClaw, direct Anthropic, etc.) */
  registerAdapter(provider: ProviderName, adapter: ProviderAdapter): void {
    this.adapters.set(provider, adapter)
  }

  /** Get the Ollama adapter for direct operations (pull, list models). */
  getOllamaAdapter(): OllamaAdapter | null {
    const adapter = this.adapters.get('ollama')
    return adapter instanceof OllamaAdapter ? adapter : null
  }

  /**
   * Resolve the best available model for a required capability type.
   * Checks which providers have API keys configured and picks the best model.
   */
  async resolveModelForCapability(
    capability: string,
  ): Promise<{ model: string; provider: string } | null> {
    // Capability → preferred model chain (best first)
    const CAPABILITY_CHAINS: Record<string, string[]> = {
      reasoning: [
        'claude-opus-4-6',
        'gpt-4o',
        'gemini-2.5-pro',
        'claude-sonnet-4-6',
        'deepseek-v3.2:cloud',
      ],
      agentic: ['claude-sonnet-4-6', 'gpt-4o', 'gemini-2.5-pro', 'qwen3.5:cloud'],
      coder: ['claude-sonnet-4-6', 'gpt-4.1', 'gemini-2.5-pro', 'qwen3.5:cloud'],
      vision: ['claude-sonnet-4-6', 'gpt-4o', 'gemini-2.5-pro', 'llama-3.2-11b-vision:cloud'],
      flash: ['claude-haiku-4-5', 'gpt-4o-mini', 'gemini-2.5-flash', 'qwen3.5:cloud'],
      embedding: ['text-embedding-3-small', 'text-embedding-3-large'],
      guard: ['claude-haiku-4-5', 'gpt-4o-mini', 'llama-guard-3:cloud'],
      judge: ['claude-opus-4-6', 'gpt-4o', 'deepseek-v3.2:cloud'],
      router: ['claude-haiku-4-5', 'gpt-4o-mini', 'gemini-2.5-flash', 'qwen3.5:cloud'],
      multimodal: ['claude-sonnet-4-6', 'gpt-4o', 'gemini-2.5-pro', 'llama-3.2-11b-vision:cloud'],
    }

    const chain = CAPABILITY_CHAINS[capability] ?? CAPABILITY_CHAINS['agentic']!

    for (const model of chain) {
      const resolved = resolveProvider(model)
      const hasKey = await this.keyVault.getKey(resolved.provider)
      const hasEnvKey =
        resolved.provider === 'anthropic'
          ? !!process.env.ANTHROPIC_API_KEY
          : resolved.provider === 'openai'
            ? !!process.env.OPENAI_API_KEY
            : resolved.provider === 'google'
              ? !!process.env.GOOGLE_API_KEY
              : resolved.provider === 'ollama'
                ? !!(process.env.OLLAMA_API_KEY || (await this.keyVault.getKey('ollama')))
                : false

      if ((hasKey || hasEnvKey) && this.circuitBreaker.canRequest(resolved.provider)) {
        return { model, provider: resolved.provider }
      }
    }

    // Fallback: check if any Ollama model is available
    const ollamaKey = process.env.OLLAMA_API_KEY ?? (await this.keyVault.getKey('ollama'))
    if (ollamaKey) {
      return { model: 'qwen3.5:cloud', provider: 'ollama' }
    }

    return null
  }

  /**
   * Main entry point: route an LLM chat request through the gateway.
   */
  async chat(input: LlmChatInput, parentSpan?: Span): Promise<LlmChatOutput> {
    const startTime = Date.now()
    const model = input.model ?? this.config.defaultModel
    const messages = input.messages

    const rootSpan = this.tracer?.start('gateway.chat', {
      service: 'gateway',
      agentId: input.agentId,
      ticketId: input.ticketId,
      parent: parentSpan
        ? { traceId: parentSpan.traceId, parentSpanId: parentSpan.spanId }
        : undefined,
    })
    rootSpan?.setAttribute('llm.model', model)
    rootSpan?.setAttribute('llm.messages', messages.length)

    try {
      // 1. Check rate limits
      const rateCheck = this.rateLimiter.tryConsume({
        agentId: input.agentId,
        estimatedTokens: this.estimateTokens(messages),
      })
      if (!rateCheck.allowed) {
        throw new GatewayError(
          'RATE_LIMITED',
          `Rate limited. Retry after ${rateCheck.retryAfterMs}ms`,
          { retryAfterMs: rateCheck.retryAfterMs },
        )
      }

      // 2. Check budget
      if (input.agentId) {
        const budget = await this.costTracker.checkBudget(input.agentId)
        if (!budget.allowed) {
          throw new GatewayError(
            'BUDGET_EXCEEDED',
            `Agent budget exceeded. Remaining: $${budget.remainingUsd.toFixed(2)}`,
          )
        }
      }

      // 3. Check semantic cache (skip for streaming / tool-use)
      const cacheable =
        this.config.cacheEnabled &&
        !shouldSkipCache({ stream: input.stream, tools: input.tools, messages })
      let cacheEmbedding: number[] | undefined
      if (cacheable) {
        const cacheSpan = this.tracer?.start('gateway.cache.lookup', {
          service: 'gateway',
          parent: rootSpan
            ? { traceId: rootSpan.traceId, parentSpanId: rootSpan.spanId }
            : undefined,
        })
        // Compute embedding for semantic similarity search
        try {
          const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
          if (lastUserMsg) {
            const embedResult = await this.embed(lastUserMsg.content)
            cacheEmbedding = embedResult.embedding
          }
        } catch {
          // Embedding failure shouldn't block cache lookup — fall back to exact-match only
        }
        const cached = await this.cache.lookup(model, messages, cacheEmbedding)
        cacheSpan?.setAttribute('cache.hit', !!cached)
        await cacheSpan?.end()

        if (cached) {
          const latencyMs = Date.now() - startTime
          await this.costTracker.record({
            provider: 'cache',
            model: cached.model,
            agentId: input.agentId,
            ticketId: input.ticketId,
            tokensIn: cached.tokensIn,
            tokensOut: cached.tokensOut,
            latencyMs,
            cached: true,
          })

          rootSpan?.setAttribute('cache.hit', true)
          rootSpan?.setStatus('ok')

          return {
            content: cached.response,
            model: cached.model,
            provider: 'cache',
            tokensIn: cached.tokensIn,
            tokensOut: cached.tokensOut,
            latencyMs,
            costUsd: 0,
            cached: true,
          }
        }
      }

      // 4. Resolve provider + attempt with circuit breaking and fallbacks
      const resolved = resolveProvider(model)
      const providers = this.buildProviderChain(resolved.provider, model)

      let lastError: Error | null = null

      for (const { provider, targetModel } of providers) {
        // Check circuit breaker
        if (!this.circuitBreaker.canRequest(provider)) {
          rootSpan?.setAttribute(`circuit.${provider}`, 'OPEN')
          continue
        }

        const adapter = this.adapters.get(provider)
        if (!adapter) continue

        const providerSpan = this.tracer?.start(`gateway.provider.${provider}`, {
          service: 'gateway',
          agentId: input.agentId,
          ticketId: input.ticketId,
          parent: rootSpan
            ? { traceId: rootSpan.traceId, parentSpanId: rootSpan.spanId }
            : undefined,
        })
        providerSpan?.setAttribute('llm.provider', provider)
        providerSpan?.setAttribute('llm.model', targetModel)

        try {
          // Env vars take priority over vault for Ollama
          const apiKey =
            provider === 'ollama'
              ? (process.env.OLLAMA_API_KEY ?? (await this.keyVault.getKey(provider)))
              : await this.keyVault.getKey(provider)

          if (provider === 'ollama') {
            const ollamaAdapter = adapter as OllamaAdapter
            const storedUrl = await this.keyVault.getKey('ollama_url')
            ollamaAdapter.resolvedUrl = process.env.OLLAMA_BASE_URL ?? storedUrl ?? null
          }

          const result = await adapter.chat({
            model: targetModel,
            messages,
            tools: input.tools,
            apiKey: apiKey ?? undefined,
            temperature: input.temperature,
            maxTokens: input.maxTokens,
          })

          this.circuitBreaker.recordSuccess(provider)
          const latencyMs = Date.now() - startTime
          const costResult = await this.costTracker.record({
            provider,
            model: targetModel,
            agentId: input.agentId,
            ticketId: input.ticketId,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
            latencyMs,
            cached: false,
          })

          providerSpan?.setAttribute('llm.tokens_in', result.tokensIn)
          providerSpan?.setAttribute('llm.tokens_out', result.tokensOut)
          providerSpan?.setAttribute('llm.cost_usd', costResult.costUsd)
          providerSpan?.setAttribute('llm.latency_ms', latencyMs)
          providerSpan?.setStatus('ok')
          await providerSpan?.end()

          rootSpan?.setAttribute('llm.provider', provider)
          rootSpan?.setAttribute('llm.cost_usd', costResult.costUsd)
          rootSpan?.setStatus('ok')

          // Store in cache with embedding for semantic lookup (async, don't block response)
          if (cacheable) {
            this.cache
              .store(
                targetModel,
                messages,
                result.content,
                result.tokensIn,
                result.tokensOut,
                cacheEmbedding,
              )
              .catch((err) => console.warn('[Gateway] cache store failed:', err.message))
          }

          return {
            content: result.content,
            model: targetModel,
            provider,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
            latencyMs,
            costUsd: costResult.costUsd,
            cached: false,
            toolUse: result.toolUse,
          }
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err))
          this.circuitBreaker.recordFailure(provider)

          providerSpan?.recordError(lastError)
          await providerSpan?.end()

          await this.costTracker.record({
            provider,
            model: targetModel,
            agentId: input.agentId,
            ticketId: input.ticketId,
            tokensIn: 0,
            tokensOut: 0,
            latencyMs: Date.now() - startTime,
            cached: false,
            error: lastError.message,
          })
        }
      }

      throw new GatewayError(
        'ALL_PROVIDERS_FAILED',
        `All providers failed for model ${model}. Last error: ${lastError?.message}`,
      )
    } catch (err) {
      rootSpan?.recordError(err)
      throw err
    } finally {
      await rootSpan?.end()
    }
  }

  /**
   * Stream an LLM chat response. Yields text chunks as they arrive.
   * Falls back to non-streaming chat() if the adapter doesn't support streaming.
   */
  async *chatStream(input: LlmChatInput): AsyncGenerator<string, void, unknown> {
    const model = input.model ?? this.config.defaultModel
    const resolved = resolveProvider(model)
    const providers = this.buildProviderChain(resolved.provider, model)

    let lastError: Error | null = null

    for (const { provider, targetModel } of providers) {
      if (!this.circuitBreaker.canRequest(provider)) continue

      const adapter = this.adapters.get(provider)
      if (!adapter) continue

      try {
        const apiKey =
          provider === 'ollama'
            ? (process.env.OLLAMA_API_KEY ?? (await this.keyVault.getKey(provider)))
            : await this.keyVault.getKey(provider)

        if (provider === 'ollama') {
          const ollamaAdapter = adapter as OllamaAdapter
          const storedUrl = await this.keyVault.getKey('ollama_url')
          ollamaAdapter.resolvedUrl = process.env.OLLAMA_BASE_URL ?? storedUrl ?? null
        }

        if (adapter.chatStream) {
          yield* adapter.chatStream({
            model: targetModel,
            messages: input.messages,
            apiKey: apiKey ?? undefined,
            temperature: input.temperature,
            maxTokens: input.maxTokens,
          })
          this.circuitBreaker.recordSuccess(provider)
          return
        }

        // Fallback: non-streaming
        const result = await adapter.chat({
          model: targetModel,
          messages: input.messages,
          apiKey: apiKey ?? undefined,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
        })
        this.circuitBreaker.recordSuccess(provider)
        yield result.content
        return
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        this.circuitBreaker.recordFailure(provider)
      }
    }

    throw new GatewayError(
      'ALL_PROVIDERS_FAILED',
      `All providers failed for streaming model ${model}. Last error: ${lastError?.message}`,
    )
  }

  /**
   * Embed text — routes to embedding provider with fallback.
   */
  async embed(
    text: string,
    model?: string,
  ): Promise<{ embedding: number[]; model: string; dimensions: number }> {
    const embedModel = model ?? 'text-embedding-3-small'
    const providers: ProviderName[] = ['openai', 'anthropic', 'google']

    for (const provider of providers) {
      if (!this.circuitBreaker.canRequest(provider)) continue

      const adapter = this.adapters.get(provider)
      if (!adapter?.embed) continue

      try {
        const apiKey = await this.keyVault.getKey(provider)
        const result = await adapter.embed({ text, model: embedModel, apiKey: apiKey ?? undefined })
        this.circuitBreaker.recordSuccess(provider)
        return { ...result, model: embedModel }
      } catch (_err) {
        this.circuitBreaker.recordFailure(provider)
      }
    }

    throw new GatewayError('ALL_PROVIDERS_FAILED', 'No embedding provider available')
  }

  /** Build ordered list of providers to try (primary + fallbacks) */
  private buildProviderChain(
    primary: ProviderName,
    originalModel: string,
  ): Array<{ provider: ProviderName; targetModel: string }> {
    const chain: Array<{ provider: ProviderName; targetModel: string }> = [
      { provider: primary, targetModel: originalModel },
    ]

    const fallbacks = DEFAULT_FALLBACKS[primary] ?? []
    for (const fallbackProvider of fallbacks) {
      chain.push({
        provider: fallbackProvider,
        targetModel: getEquivalentModel(originalModel, fallbackProvider),
      })
    }

    return chain
  }

  /** Rough token estimate: ~4 chars per token */
  private estimateTokens(messages: Array<{ role: string; content: string }>): number {
    let chars = 0
    for (const m of messages) {
      chars += m.content.length + m.role.length + 4
    }
    return Math.ceil(chars / 4)
  }

  /** Health check: return circuit breaker states for all providers */
  getHealth(): Record<string, { state: string; failures: number }> {
    const health: Record<string, { state: string; failures: number }> = {}
    for (const provider of [
      'anthropic',
      'openai',
      'google',
      'ollama',
      'openclaw',
    ] as ProviderName[]) {
      const state = this.circuitBreaker.getState(provider)
      health[provider] = { state: state.state, failures: state.failures }
    }
    return health
  }
}

// === Error Types ===

export type GatewayErrorCode =
  | 'RATE_LIMITED'
  | 'BUDGET_EXCEEDED'
  | 'ALL_PROVIDERS_FAILED'
  | 'CIRCUIT_OPEN'

export class GatewayError extends Error {
  constructor(
    public code: GatewayErrorCode,
    message: string,
    public metadata?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'GatewayError'
  }
}
