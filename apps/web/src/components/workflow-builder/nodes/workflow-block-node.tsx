'use client'

import { Handle, type NodeProps, Position } from '@xyflow/react'
import { Bot, Brain, Database, Flag, GitBranch, Wrench, Zap } from 'lucide-react'

import { BLOCK_COLORS, type BlockConfig, type BlockType } from '../types'

interface WorkflowBlockData {
  blockType: BlockType
  label: string
  config: BlockConfig
  isSelected?: boolean
  [key: string]: unknown
}

const ICONS: Record<BlockType, React.FC<{ size?: number; className?: string }>> = {
  trigger: Zap,
  agent: Bot,
  tool: Wrench,
  condition: GitBranch,
  llm: Brain,
  memory: Database,
  output: Flag,
}

export function WorkflowBlockNode({ data, selected }: NodeProps) {
  const d = data as WorkflowBlockData
  const blockType = d.blockType as BlockType
  const colors = BLOCK_COLORS[blockType] ?? BLOCK_COLORS.agent
  const Icon = ICONS[blockType] ?? Bot

  const subtitle = getSubtitle(blockType, d.config)

  return (
    <div
      className={`
        ${colors.bg} ${colors.border} border rounded-xl px-4 py-3
        min-w-[180px] max-w-[240px] backdrop-blur-md
        transition-all duration-150
        ${selected ? 'ring-2 ring-neon-blue/50 shadow-[0_0_20px_rgba(0,212,255,0.15)]' : ''}
      `}
    >
      {/* Input handle (not for triggers) */}
      {blockType !== 'trigger' && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-slate-500 !border-2 !border-bg-deep hover:!bg-neon-blue transition-colors"
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className={colors.text} />
        <span className={`text-xs font-semibold uppercase tracking-wider ${colors.text}`}>
          {blockType}
        </span>
      </div>

      {/* Label */}
      <div className="text-sm text-white font-medium truncate">{d.label}</div>

      {/* Subtitle (config summary) */}
      {subtitle && <div className="text-[10px] text-slate-500 mt-1 truncate">{subtitle}</div>}

      {/* Output handle(s) */}
      {blockType === 'condition' ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="pass"
            className="!w-3 !h-3 !bg-neon-green !border-2 !border-bg-deep"
            style={{ left: '30%' }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="fail"
            className="!w-3 !h-3 !bg-neon-red !border-2 !border-bg-deep"
            style={{ left: '70%' }}
          />
          <div className="flex justify-between text-[8px] text-slate-600 mt-2 px-1">
            <span>pass</span>
            <span>fail</span>
          </div>
        </>
      ) : blockType !== 'output' ? (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-slate-500 !border-2 !border-bg-deep hover:!bg-neon-blue transition-colors"
        />
      ) : null}
    </div>
  )
}

function getSubtitle(type: BlockType, config: BlockConfig): string | null {
  switch (type) {
    case 'trigger':
      return config.triggerType ?? null
    case 'agent':
      return config.agentName ?? config.mode ?? null
    case 'tool':
      return config.toolName ?? null
    case 'condition':
      return config.expression ? `if ${config.expression.slice(0, 30)}` : null
    case 'llm':
      return config.model ?? 'default model'
    case 'memory':
      return config.memoryOp ?? null
    case 'output':
      return config.outputType ?? null
    default:
      return null
  }
}
