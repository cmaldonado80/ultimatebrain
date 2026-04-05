'use client'

import { Bot, Brain, Database, Flag, GitBranch, Wrench, Zap } from 'lucide-react'
import type { DragEvent } from 'react'

import { BLOCK_CATALOG, BLOCK_COLORS, type BlockType } from './types'

const ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  Zap,
  Bot,
  Wrench,
  GitBranch,
  Brain,
  Database,
  Flag,
}

export function BlockPalette() {
  const onDragStart = (e: DragEvent<HTMLDivElement>, blockType: BlockType) => {
    e.dataTransfer.setData('application/workflow-block', blockType)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-56 flex-shrink-0 border-r border-border bg-bg-surface p-3 overflow-y-auto hidden lg:block">
      <h3 className="text-xs font-orbitron text-slate-400 uppercase tracking-wider mb-3">Blocks</h3>
      <div className="flex flex-col gap-1.5">
        {BLOCK_CATALOG.map((block) => {
          const colors = BLOCK_COLORS[block.type]
          const Icon = ICONS[block.icon] ?? Bot

          return (
            <div
              key={block.type}
              draggable
              onDragStart={(e) => onDragStart(e, block.type)}
              className={`
                ${colors.bg} ${colors.border} border rounded-lg px-3 py-2
                cursor-grab active:cursor-grabbing
                hover:brightness-125 transition-all duration-150
              `}
            >
              <div className="flex items-center gap-2">
                <Icon size={13} className={colors.text} />
                <span className={`text-xs font-medium ${colors.text}`}>{block.label}</span>
              </div>
              <div className="text-[9px] text-slate-600 mt-0.5 leading-tight">
                {block.description}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-border-dim">
        <div className="text-[9px] text-slate-600 leading-relaxed">
          Drag blocks onto the canvas to build your workflow. Connect outputs to inputs to define
          execution order.
        </div>
      </div>
    </div>
  )
}
