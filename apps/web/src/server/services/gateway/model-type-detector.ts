/**
 * Model Type Detector
 *
 * Auto-detects a model's primary type and secondary capabilities based on:
 * 1. Known model database — hardcoded map of well-known models
 * 2. Name heuristics — pattern matching on model name
 * 3. Provider defaults — reasonable defaults per provider
 */

export type ModelType =
  | 'vision'
  | 'reasoning'
  | 'agentic'
  | 'coder'
  | 'embedding'
  | 'flash'
  | 'guard'
  | 'judge'
  | 'router'
  | 'multimodal'

export interface ModelTypeInfo {
  type: ModelType
  secondaryTypes: ModelType[]
  displayName: string
  provider: string
  contextWindow?: number
  maxOutputTokens?: number
  supportsVision: boolean
  supportsTools: boolean
  supportsStreaming: boolean
  inputCostPerMToken?: number
  outputCostPerMToken?: number
  speedTier: 'fast' | 'medium' | 'slow'
  confidence: number
}

interface KnownModel {
  type: ModelType
  secondary?: ModelType[]
  displayName: string
  provider: string
  contextWindow?: number
  maxOutputTokens?: number
  vision?: boolean
  tools?: boolean
  streaming?: boolean
  inputCost?: number
  outputCost?: number
  speed?: 'fast' | 'medium' | 'slow'
}

// ── Known Model Database ─────────────────────────────────────────────────

const KNOWN_MODELS: Record<string, KnownModel> = {
  // Anthropic
  'claude-opus-4-6': {
    type: 'reasoning',
    secondary: ['agentic', 'coder', 'vision'],
    displayName: 'Claude Opus 4.6',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 32000,
    vision: true,
    tools: true,
    streaming: true,
    inputCost: 15,
    outputCost: 75,
    speed: 'slow',
  },
  'claude-sonnet-4-6': {
    type: 'agentic',
    secondary: ['coder', 'vision'],
    displayName: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 16000,
    vision: true,
    tools: true,
    streaming: true,
    inputCost: 3,
    outputCost: 15,
    speed: 'medium',
  },
  'claude-haiku-4-5': {
    type: 'flash',
    secondary: ['router'],
    displayName: 'Claude Haiku 4.5',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    vision: true,
    tools: true,
    streaming: true,
    inputCost: 0.8,
    outputCost: 4,
    speed: 'fast',
  },
  // Also match versioned names
  'claude-opus-4-20250514': {
    type: 'reasoning',
    secondary: ['agentic', 'coder', 'vision'],
    displayName: 'Claude Opus 4',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 32000,
    vision: true,
    tools: true,
    streaming: true,
    inputCost: 15,
    outputCost: 75,
    speed: 'slow',
  },
  'claude-sonnet-4-20250514': {
    type: 'agentic',
    secondary: ['coder', 'vision'],
    displayName: 'Claude Sonnet 4',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 16000,
    vision: true,
    tools: true,
    streaming: true,
    inputCost: 3,
    outputCost: 15,
    speed: 'medium',
  },

  // OpenAI
  'gpt-4o': {
    type: 'agentic',
    secondary: ['vision', 'coder'],
    displayName: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    vision: true,
    tools: true,
    streaming: true,
    inputCost: 2.5,
    outputCost: 10,
    speed: 'medium',
  },
  'gpt-4o-mini': {
    type: 'flash',
    secondary: ['router'],
    displayName: 'GPT-4o Mini',
    provider: 'openai',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    vision: true,
    tools: true,
    streaming: true,
    inputCost: 0.15,
    outputCost: 0.6,
    speed: 'fast',
  },
  'gpt-4.1': {
    type: 'coder',
    secondary: ['agentic'],
    displayName: 'GPT-4.1',
    provider: 'openai',
    contextWindow: 1000000,
    maxOutputTokens: 32768,
    vision: true,
    tools: true,
    streaming: true,
    inputCost: 2,
    outputCost: 8,
    speed: 'medium',
  },
  'gpt-4.1-mini': {
    type: 'coder',
    secondary: ['flash'],
    displayName: 'GPT-4.1 Mini',
    provider: 'openai',
    contextWindow: 1000000,
    maxOutputTokens: 32768,
    vision: true,
    tools: true,
    streaming: true,
    inputCost: 0.4,
    outputCost: 1.6,
    speed: 'fast',
  },
  'gpt-4.1-nano': {
    type: 'router',
    secondary: ['flash'],
    displayName: 'GPT-4.1 Nano',
    provider: 'openai',
    contextWindow: 1000000,
    maxOutputTokens: 32768,
    vision: true,
    tools: true,
    streaming: true,
    inputCost: 0.1,
    outputCost: 0.4,
    speed: 'fast',
  },
  o3: {
    type: 'reasoning',
    secondary: ['coder'],
    displayName: 'o3',
    provider: 'openai',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    tools: true,
    streaming: true,
    inputCost: 10,
    outputCost: 40,
    speed: 'slow',
  },
  'o3-mini': {
    type: 'reasoning',
    secondary: ['router'],
    displayName: 'o3 Mini',
    provider: 'openai',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    tools: true,
    streaming: true,
    inputCost: 1.1,
    outputCost: 4.4,
    speed: 'medium',
  },
  'o4-mini': {
    type: 'reasoning',
    secondary: ['coder', 'agentic'],
    displayName: 'o4 Mini',
    provider: 'openai',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    vision: true,
    tools: true,
    streaming: true,
    inputCost: 1.1,
    outputCost: 4.4,
    speed: 'medium',
  },
  'text-embedding-3-large': {
    type: 'embedding',
    displayName: 'Text Embedding 3 Large',
    provider: 'openai',
    inputCost: 0.13,
    speed: 'fast',
  },
  'text-embedding-3-small': {
    type: 'embedding',
    displayName: 'Text Embedding 3 Small',
    provider: 'openai',
    inputCost: 0.02,
    speed: 'fast',
  },

  // Google
  'gemini-2.5-pro': {
    type: 'reasoning',
    secondary: ['multimodal', 'coder'],
    displayName: 'Gemini 2.5 Pro',
    provider: 'google',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    vision: true,
    tools: true,
    streaming: true,
    inputCost: 1.25,
    outputCost: 10,
    speed: 'medium',
  },
  'gemini-2.5-flash': {
    type: 'flash',
    secondary: ['multimodal'],
    displayName: 'Gemini 2.5 Flash',
    provider: 'google',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    vision: true,
    tools: true,
    streaming: true,
    inputCost: 0.15,
    outputCost: 0.6,
    speed: 'fast',
  },
  'gemini-2.0-flash': {
    type: 'flash',
    secondary: ['vision'],
    displayName: 'Gemini 2.0 Flash',
    provider: 'google',
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    vision: true,
    tools: true,
    streaming: true,
    inputCost: 0.1,
    outputCost: 0.4,
    speed: 'fast',
  },

  // Meta / Ollama (Local)
  'llama-3.3-70b': {
    type: 'agentic',
    secondary: ['coder'],
    displayName: 'Llama 3.3 70B',
    provider: 'ollama',
    contextWindow: 128000,
    tools: true,
    streaming: true,
    speed: 'medium',
  },
  'llama-3.2-11b-vision': {
    type: 'vision',
    secondary: ['multimodal'],
    displayName: 'Llama 3.2 11B Vision',
    provider: 'ollama',
    contextWindow: 128000,
    vision: true,
    streaming: true,
    speed: 'fast',
  },
  'llama-guard-3': {
    type: 'guard',
    displayName: 'Llama Guard 3',
    provider: 'ollama',
    streaming: true,
    speed: 'fast',
  },

  // Ollama Cloud Models
  'qwen3.5': {
    type: 'agentic',
    secondary: ['coder', 'reasoning'],
    displayName: 'Qwen 3.5',
    provider: 'ollama',
    contextWindow: 128000,
    tools: true,
    streaming: true,
    speed: 'medium',
  },
  'deepseek-v3.2': {
    type: 'reasoning',
    secondary: ['agentic', 'coder'],
    displayName: 'DeepSeek V3.2',
    provider: 'ollama',
    contextWindow: 128000,
    tools: true,
    streaming: true,
    speed: 'medium',
  },
  'deepseek-v3.1': {
    type: 'reasoning',
    secondary: ['agentic'],
    displayName: 'DeepSeek V3.1',
    provider: 'ollama',
    contextWindow: 128000,
    tools: true,
    streaming: true,
    speed: 'medium',
  },
  'deepseek-r1': {
    type: 'reasoning',
    secondary: ['coder'],
    displayName: 'DeepSeek R1',
    provider: 'ollama',
    contextWindow: 128000,
    tools: true,
    streaming: true,
    speed: 'slow',
  },
  'kimi-k2.5': {
    type: 'agentic',
    secondary: ['vision', 'multimodal'],
    displayName: 'Kimi K2.5',
    provider: 'ollama',
    contextWindow: 128000,
    vision: true,
    tools: true,
    streaming: true,
    speed: 'medium',
  },
  'minimax-m2': {
    type: 'coder',
    secondary: ['agentic'],
    displayName: 'MiniMax M2',
    provider: 'ollama',
    contextWindow: 128000,
    tools: true,
    streaming: true,
    speed: 'medium',
  },
  'minimax-m2.5': {
    type: 'coder',
    secondary: ['agentic'],
    displayName: 'MiniMax M2.5',
    provider: 'ollama',
    contextWindow: 128000,
    tools: true,
    streaming: true,
    speed: 'medium',
  },
  'glm-5': {
    type: 'reasoning',
    secondary: ['agentic'],
    displayName: 'GLM-5',
    provider: 'ollama',
    contextWindow: 128000,
    tools: true,
    streaming: true,
    speed: 'medium',
  },
  'glm-4.7': {
    type: 'agentic',
    secondary: ['coder'],
    displayName: 'GLM-4.7',
    provider: 'ollama',
    contextWindow: 128000,
    tools: true,
    streaming: true,
    speed: 'medium',
  },
  'gpt-oss': {
    type: 'agentic',
    secondary: ['reasoning', 'coder'],
    displayName: 'GPT-OSS',
    provider: 'ollama',
    contextWindow: 128000,
    tools: true,
    streaming: true,
    speed: 'medium',
  },

  // Embeddings (Ollama)
  'nomic-embed-text': {
    type: 'embedding',
    displayName: 'Nomic Embed Text',
    provider: 'ollama',
    speed: 'fast',
  },
  'mxbai-embed-large': {
    type: 'embedding',
    displayName: 'MxBai Embed Large',
    provider: 'ollama',
    speed: 'fast',
  },

  // Coders (Ollama Local)
  'qwen2.5-coder': {
    type: 'coder',
    displayName: 'Qwen 2.5 Coder',
    provider: 'ollama',
    contextWindow: 32000,
    tools: true,
    streaming: true,
    speed: 'medium',
  },
  'deepseek-coder-v2': {
    type: 'coder',
    displayName: 'DeepSeek Coder V2',
    provider: 'ollama',
    contextWindow: 128000,
    tools: true,
    streaming: true,
    speed: 'medium',
  },
  codestral: {
    type: 'coder',
    displayName: 'Codestral',
    provider: 'ollama',
    contextWindow: 32000,
    tools: true,
    streaming: true,
    speed: 'medium',
  },
}

// ── Name-Based Heuristics ─────────────────────────────────────────────────

const NAME_PATTERNS: Array<{ pattern: RegExp; type: ModelType }> = [
  { pattern: /embed/i, type: 'embedding' },
  { pattern: /guard/i, type: 'guard' },
  { pattern: /vision|vl\b/i, type: 'vision' },
  { pattern: /code|coder|codestral|starcoder|deepseek-coder/i, type: 'coder' },
  { pattern: /flash|mini|nano|small|tiny|fast/i, type: 'flash' },
  { pattern: /\bo[1-4]\b|reasoning|think/i, type: 'reasoning' },
  { pattern: /judge|eval|scorer/i, type: 'judge' },
  { pattern: /route|classify|router/i, type: 'router' },
  { pattern: /whisper|audio|speech|tts|multimodal/i, type: 'multimodal' },
]

// ── Detector ─────────────────────────────────────────────────────────────

export class ModelTypeDetector {
  /**
   * Detect a model's type and capabilities.
   * Returns high confidence for known models, lower for heuristic matches.
   */
  detect(modelId: string): ModelTypeInfo {
    // Normalize: strip ollama/ prefix and :tag suffix for lookup
    const normalized = modelId.replace(/^ollama\//, '').replace(/:\w+$/, '')

    // 1. Exact match in known database
    const known = KNOWN_MODELS[normalized] ?? KNOWN_MODELS[modelId]
    if (known) {
      return {
        type: known.type,
        secondaryTypes: known.secondary ?? [],
        displayName: known.displayName,
        provider: known.provider,
        contextWindow: known.contextWindow,
        maxOutputTokens: known.maxOutputTokens,
        supportsVision: known.vision ?? false,
        supportsTools: known.tools ?? false,
        supportsStreaming: known.streaming ?? false,
        inputCostPerMToken: known.inputCost,
        outputCostPerMToken: known.outputCost,
        speedTier: known.speed ?? 'medium',
        confidence: 1.0,
      }
    }

    // 2. Fuzzy match — check if any known model name is a prefix
    for (const [knownId, knownInfo] of Object.entries(KNOWN_MODELS)) {
      if (normalized.startsWith(knownId) || knownId.startsWith(normalized)) {
        return {
          type: knownInfo.type,
          secondaryTypes: knownInfo.secondary ?? [],
          displayName: knownInfo.displayName + ' (variant)',
          provider: knownInfo.provider,
          contextWindow: knownInfo.contextWindow,
          maxOutputTokens: knownInfo.maxOutputTokens,
          supportsVision: knownInfo.vision ?? false,
          supportsTools: knownInfo.tools ?? false,
          supportsStreaming: knownInfo.streaming ?? false,
          inputCostPerMToken: knownInfo.inputCost,
          outputCostPerMToken: knownInfo.outputCost,
          speedTier: knownInfo.speed ?? 'medium',
          confidence: 0.8,
        }
      }
    }

    // 3. Name heuristics
    const detectedType = this.detectFromName(normalized)
    const provider = this.guessProvider(modelId)

    return {
      type: detectedType,
      secondaryTypes: [],
      displayName: modelId,
      provider,
      supportsVision: false,
      supportsTools: detectedType === 'agentic' || detectedType === 'coder',
      supportsStreaming: detectedType !== 'embedding',
      speedTier: detectedType === 'flash' || detectedType === 'router' ? 'fast' : 'medium',
      confidence: 0.5,
    }
  }

  /**
   * Detect model type from name patterns alone.
   */
  detectFromName(name: string): ModelType {
    for (const { pattern, type } of NAME_PATTERNS) {
      if (pattern.test(name)) return type
    }
    return 'agentic' // Default for unknown models
  }

  /**
   * Guess provider from model ID patterns.
   */
  private guessProvider(modelId: string): string {
    if (modelId.includes('claude')) return 'anthropic'
    if (
      modelId.includes('gpt') ||
      modelId.includes('o3') ||
      modelId.includes('o4') ||
      modelId.startsWith('text-embedding')
    )
      return 'openai'
    if (modelId.includes('gemini')) return 'google'
    if (modelId.includes(':') || modelId.includes('ollama/')) return 'ollama'
    return 'openclaw'
  }

  /**
   * Get all known models from the database.
   */
  getKnownModels(): Array<{ modelId: string } & KnownModel> {
    return Object.entries(KNOWN_MODELS).map(([modelId, info]) => ({ modelId, ...info }))
  }
}
