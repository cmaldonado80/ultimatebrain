import { z } from 'zod'

// === LLM Engine Contract ===

export const LlmChatInput = z.object({
  model: z.string().optional(),
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
  tools: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    inputSchema: z.record(z.unknown()).optional(),
  })).optional(),
  stream: z.boolean().optional(),
  agentId: z.string().uuid().optional(),
  ticketId: z.string().uuid().optional(),
})
export type LlmChatInput = z.infer<typeof LlmChatInput>

export const LlmChatOutput = z.object({
  content: z.string(),
  model: z.string(),
  provider: z.string(),
  tokensIn: z.number(),
  tokensOut: z.number(),
  latencyMs: z.number(),
  costUsd: z.number(),
  cached: z.boolean(),
})
export type LlmChatOutput = z.infer<typeof LlmChatOutput>

export const LlmEmbedInput = z.object({
  text: z.string(),
  model: z.string().optional(),
})
export type LlmEmbedInput = z.infer<typeof LlmEmbedInput>

export const LlmEmbedOutput = z.object({
  embedding: z.array(z.number()),
  model: z.string(),
  dimensions: z.number(),
})
export type LlmEmbedOutput = z.infer<typeof LlmEmbedOutput>

// === Memory Engine Contract ===

export const MemoryStoreInput = z.object({
  key: z.string(),
  content: z.string(),
  tier: z.enum(['core', 'recall', 'archival']).optional().default('recall'),
  appId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
})
export type MemoryStoreInput = z.infer<typeof MemoryStoreInput>

export const MemorySearchInput = z.object({
  query: z.string(),
  tier: z.enum(['core', 'recall', 'archival']).optional(),
  appId: z.string().uuid().optional(),
  limit: z.number().optional().default(10),
})
export type MemorySearchInput = z.infer<typeof MemorySearchInput>

export const MemorySearchResult = z.object({
  id: z.string(),
  key: z.string(),
  content: z.string(),
  tier: z.enum(['core', 'recall', 'archival']),
  score: z.number(),
  createdAt: z.date(),
})
export type MemorySearchResult = z.infer<typeof MemorySearchResult>

// === Orchestration Engine Contract ===

export const CreateTicketInput = z.object({
  title: z.string(),
  description: z.string().optional(),
  agent: z.string().optional(),
  mode: z.enum(['quick', 'autonomous', 'deep_work']).optional(),
})
export type CreateTicketInput = z.infer<typeof CreateTicketInput>

export const ApprovalRequestInput = z.object({
  action: z.string(),
  risk: z.enum(['low', 'medium', 'high', 'critical']),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type ApprovalRequestInput = z.infer<typeof ApprovalRequestInput>

// === Eval Engine Contract ===

export const EvalCaseInput = z.object({
  input: z.record(z.string(), z.unknown()),
  expectedOutput: z.record(z.string(), z.unknown()).optional(),
  traceId: z.string().optional(),
  dataset: z.string().optional(),
})
export type EvalCaseInput = z.infer<typeof EvalCaseInput>

export const EvalScores = z.object({
  taskCompletion: z.number().min(0).max(1),
  factuality: z.number().min(0).max(1),
  toolUseAccuracy: z.number().min(0).max(1),
  safety: z.number().min(0).max(1),
  costEfficiency: z.number().min(0).max(1),
})
export type EvalScores = z.infer<typeof EvalScores>

// === Guardrail Engine Contract ===

export const GuardrailCheckInput = z.object({
  content: z.string(),
  agentId: z.string().uuid().optional(),
  policies: z.array(z.string()).optional(),
})
export type GuardrailCheckInput = z.infer<typeof GuardrailCheckInput>

export const GuardrailCheckOutput = z.object({
  passed: z.boolean(),
  violations: z.array(z.object({
    rule: z.string(),
    detail: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
  })),
  modifiedContent: z.string().optional(),
})
export type GuardrailCheckOutput = z.infer<typeof GuardrailCheckOutput>

// === A2A Engine Contract ===

export const AgentCardSchema = z.object({
  name: z.string(),
  description: z.string(),
  endpoint: z.string(),
  skills: z.array(z.string()),
  auth: z.object({
    type: z.enum(['bearer', 'api_key', 'none']),
    tokenUrl: z.string().optional(),
  }),
})
export type AgentCard = z.infer<typeof AgentCardSchema>

export const A2ADelegateInput = z.object({
  agentId: z.string(),
  task: z.string(),
  context: z.record(z.string(), z.unknown()).optional(),
  callbackUrl: z.string().optional(),
})
export type A2ADelegateInput = z.infer<typeof A2ADelegateInput>

// === Healing Engine Contract ===

export const HealthCheckOutput = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  checks: z.array(z.object({
    name: z.string(),
    status: z.enum(['pass', 'warn', 'fail']),
    message: z.string().optional(),
    latencyMs: z.number().optional(),
  })),
  timestamp: z.date(),
})
export type HealthCheckOutput = z.infer<typeof HealthCheckOutput>

// === Model Strategy ===

export const ModelTierSchema = z.enum(['opus', 'sonnet', 'haiku'])
export type ModelTier = z.infer<typeof ModelTierSchema>

export const MODEL_STRATEGY: Record<string, ModelTier> = {
  // Opus — heavy thinking (~5% of calls)
  'architecture-review': 'opus',
  'security-scan-deep': 'opus',
  'multi-file-refactor': 'opus',
  'eval-judge': 'opus',
  'instinct-evolve': 'opus',
  'debug-complex': 'opus',
  'debate-arbitrate': 'opus',
  // Sonnet — daily driver (~85% of calls)
  'ticket-execute': 'sonnet',
  'code-generate': 'sonnet',
  'chat-respond': 'sonnet',
  'agent-yield': 'sonnet',
  'flow-step': 'sonnet',
  'memory-search': 'sonnet',
  'deep-work-plan': 'sonnet',
  // Haiku — fast + cheap (~10% of calls)
  'instinct-observe': 'haiku',
  'route-classify': 'haiku',
  'context-score': 'haiku',
  'guardrail-input': 'haiku',
  'rag-grade': 'haiku',
  'query-rewrite': 'haiku',
  'session-compact': 'haiku',
  'health-check': 'haiku',
}

export function resolveModel(tier: ModelTier): string {
  switch (tier) {
    case 'opus': return 'claude-opus-4-6'
    case 'sonnet': return 'claude-sonnet-4-6'
    case 'haiku': return 'claude-haiku-4-5'
    default: return 'claude-sonnet-4-6'
  }
}
