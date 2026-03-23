// @solarc/types — Shared TypeScript types (domain layer, zero external deps)

// === Enums ===

export type EntityTier = 'brain' | 'mini_brain' | 'development'
export type EntityStatus = 'active' | 'suspended' | 'degraded' | 'provisioning'
export type TicketStatus = 'backlog' | 'queued' | 'in_progress' | 'review' | 'done' | 'failed' | 'cancelled'
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical'
export type TicketComplexity = 'easy' | 'medium' | 'hard' | 'critical'
export type ExecutionMode = 'quick' | 'autonomous' | 'deep_work'
export type AgentStatus = 'idle' | 'planning' | 'executing' | 'reviewing' | 'error' | 'offline'
export type MemoryTier = 'core' | 'recall' | 'archival'
export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired'
export type GuardrailLayer = 'input' | 'tool' | 'output'
export type EntityAgentRole = 'primary' | 'monitor' | 'healer' | 'specialist'
export type DebateEdgeType = 'support' | 'attack' | 'rebuttal'
export type DebateSessionStatus = 'active' | 'completed' | 'cancelled'
export type CronJobStatus = 'active' | 'paused' | 'failed'
export type ReceiptStatus = 'running' | 'completed' | 'failed' | 'rolled_back'
export type ProjectStatus = 'planning' | 'active' | 'completed' | 'cancelled'

// === Value Objects ===

export interface ModelTier {
  tier: 'opus' | 'sonnet' | 'haiku'
}

export interface TrustScore {
  score: number
  factors: Record<string, number>
  updatedAt: Date
}

export interface CostBudget {
  dailyLimitUsd: number
  monthlyLimitUsd: number
  alertThreshold: number
  enforce: boolean
}
