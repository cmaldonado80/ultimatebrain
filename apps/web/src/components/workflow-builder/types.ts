/**
 * Workflow Block Type Definitions
 *
 * Each block type maps to an execution primitive:
 * - trigger: entry point (manual, cron, webhook, event)
 * - agent: run an agent or crew on a task
 * - tool: execute a specific tool
 * - condition: if/else branching
 * - llm: direct LLM call via gateway
 * - memory: search or store in tiered memory
 * - output: terminal block (log, notify, store result)
 */

export type BlockType = 'trigger' | 'agent' | 'tool' | 'condition' | 'llm' | 'memory' | 'output'

export interface BlockConfig {
  // Trigger
  triggerType?: 'manual' | 'cron' | 'webhook' | 'event'
  cronExpression?: string
  // Agent
  agentId?: string
  agentName?: string
  task?: string
  mode?: 'autonomous' | 'crew' | 'swarm'
  crewAgentIds?: string[]
  // Tool
  toolName?: string
  toolArgs?: Record<string, unknown>
  // Condition
  expression?: string // JS expression evaluated against context.data
  // LLM
  model?: string
  systemPrompt?: string
  userPrompt?: string // can reference {{data.varName}} from context
  // Memory
  memoryOp?: 'search' | 'store'
  memoryQuery?: string
  memoryTier?: 'core' | 'recall' | 'archival'
  memoryContent?: string
  // Output
  outputType?: 'log' | 'notify' | 'store' | 'webhook'
  outputTarget?: string
}

export interface WorkflowBlock {
  id: string
  type: BlockType
  label: string
  config: BlockConfig
  position: { x: number; y: number }
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string // 'pass' | 'fail' for condition nodes
  label?: string
}

export interface WorkflowDefinition {
  id?: string
  name: string
  description?: string
  blocks: WorkflowBlock[]
  edges: WorkflowEdge[]
  version: number
}

// ── Block metadata for the palette ──────────────────────────────────────

export interface BlockMeta {
  type: BlockType
  label: string
  description: string
  color: string // neon color token
  icon: string // emoji or lucide icon name
  defaultConfig: BlockConfig
}

export const BLOCK_CATALOG: BlockMeta[] = [
  {
    type: 'trigger',
    label: 'Trigger',
    description: 'Entry point — manual, cron, webhook, or event',
    color: 'neon-green',
    icon: 'Zap',
    defaultConfig: { triggerType: 'manual' },
  },
  {
    type: 'agent',
    label: 'Agent',
    description: 'Run an agent, crew, or swarm on a task',
    color: 'neon-blue',
    icon: 'Bot',
    defaultConfig: { mode: 'autonomous', task: '' },
  },
  {
    type: 'tool',
    label: 'Tool',
    description: 'Execute one of 81 available tools',
    color: 'neon-teal',
    icon: 'Wrench',
    defaultConfig: { toolName: '', toolArgs: {} },
  },
  {
    type: 'condition',
    label: 'Condition',
    description: 'If/else branch based on context data',
    color: 'neon-yellow',
    icon: 'GitBranch',
    defaultConfig: { expression: 'data.success === true' },
  },
  {
    type: 'llm',
    label: 'LLM Call',
    description: 'Direct LLM call via gateway router',
    color: 'neon-purple',
    icon: 'Brain',
    defaultConfig: { userPrompt: '' },
  },
  {
    type: 'memory',
    label: 'Memory',
    description: 'Search or store in tiered memory',
    color: 'neon-blue',
    icon: 'Database',
    defaultConfig: { memoryOp: 'search', memoryQuery: '' },
  },
  {
    type: 'output',
    label: 'Output',
    description: 'Terminal — log result, notify, or fire webhook',
    color: 'neon-red',
    icon: 'Flag',
    defaultConfig: { outputType: 'log' },
  },
]

// ── Color map for node styling ──────────────────────────────────────────

export const BLOCK_COLORS: Record<BlockType, { bg: string; border: string; text: string }> = {
  trigger: { bg: 'bg-neon-green/10', border: 'border-neon-green/30', text: 'text-neon-green' },
  agent: { bg: 'bg-neon-blue/10', border: 'border-neon-blue/30', text: 'text-neon-blue' },
  tool: { bg: 'bg-neon-teal/10', border: 'border-neon-teal/30', text: 'text-neon-teal' },
  condition: { bg: 'bg-neon-yellow/10', border: 'border-neon-yellow/30', text: 'text-neon-yellow' },
  llm: { bg: 'bg-neon-purple/10', border: 'border-neon-purple/30', text: 'text-neon-purple' },
  memory: { bg: 'bg-neon-blue/10', border: 'border-neon-blue/30', text: 'text-neon-blue' },
  output: { bg: 'bg-neon-red/10', border: 'border-neon-red/30', text: 'text-neon-red' },
}
