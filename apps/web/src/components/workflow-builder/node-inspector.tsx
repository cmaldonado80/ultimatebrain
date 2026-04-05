'use client'

import { X } from 'lucide-react'
import { useCallback } from 'react'

import { BLOCK_COLORS, type BlockConfig, type BlockType } from './types'

interface NodeInspectorProps {
  nodeId: string
  blockType: BlockType
  label: string
  config: BlockConfig
  onUpdate: (nodeId: string, label: string, config: BlockConfig) => void
  onDelete: (nodeId: string) => void
  onClose: () => void
}

export function NodeInspector({
  nodeId,
  blockType,
  label,
  config,
  onUpdate,
  onDelete,
  onClose,
}: NodeInspectorProps) {
  const colors = BLOCK_COLORS[blockType]

  const updateConfig = useCallback(
    (key: keyof BlockConfig, value: unknown) => {
      onUpdate(nodeId, label, { ...config, [key]: value })
    },
    [nodeId, label, config, onUpdate],
  )

  const updateLabel = useCallback(
    (newLabel: string) => {
      onUpdate(nodeId, newLabel, config)
    },
    [nodeId, config, onUpdate],
  )

  return (
    <div className="w-72 flex-shrink-0 border-l border-border bg-bg-surface flex flex-col overflow-hidden hidden lg:flex">
      {/* Header */}
      <div
        className={`px-4 py-3 border-b border-border flex items-center justify-between ${colors.bg}`}
      >
        <span className={`text-xs font-orbitron uppercase tracking-wider ${colors.text}`}>
          {blockType} Block
        </span>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Label */}
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
            Label
          </label>
          <input
            className="cyber-input cyber-input-sm w-full"
            value={label}
            onChange={(e) => updateLabel(e.target.value)}
          />
        </div>

        {/* Type-specific config */}
        {blockType === 'trigger' && (
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
              Trigger Type
            </label>
            <select
              className="cyber-select cyber-select-sm w-full"
              value={config.triggerType ?? 'manual'}
              onChange={(e) => updateConfig('triggerType', e.target.value)}
            >
              <option value="manual">Manual</option>
              <option value="cron">Cron Schedule</option>
              <option value="webhook">Webhook</option>
              <option value="event">Event</option>
            </select>
            {config.triggerType === 'cron' && (
              <input
                className="cyber-input cyber-input-sm w-full mt-2"
                placeholder="*/5 * * * *"
                value={config.cronExpression ?? ''}
                onChange={(e) => updateConfig('cronExpression', e.target.value)}
              />
            )}
          </div>
        )}

        {blockType === 'agent' && (
          <>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                Mode
              </label>
              <select
                className="cyber-select cyber-select-sm w-full"
                value={config.mode ?? 'autonomous'}
                onChange={(e) => updateConfig('mode', e.target.value)}
              >
                <option value="autonomous">Single Agent</option>
                <option value="crew">Crew (Multi-Agent)</option>
                <option value="swarm">Swarm (Dynamic)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                Task
              </label>
              <textarea
                className="cyber-input cyber-input-sm w-full min-h-[60px] resize-y"
                placeholder="Describe the task for the agent..."
                value={config.task ?? ''}
                onChange={(e) => updateConfig('task', e.target.value)}
              />
            </div>
          </>
        )}

        {blockType === 'tool' && (
          <>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                Tool Name
              </label>
              <input
                className="cyber-input cyber-input-sm w-full"
                placeholder="e.g. web_search, db_query, create_ticket"
                value={config.toolName ?? ''}
                onChange={(e) => updateConfig('toolName', e.target.value)}
              />
            </div>
          </>
        )}

        {blockType === 'condition' && (
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
              Expression
            </label>
            <input
              className="cyber-input cyber-input-sm w-full font-mono"
              placeholder="data.success === true"
              value={config.expression ?? ''}
              onChange={(e) => updateConfig('expression', e.target.value)}
            />
            <div className="text-[9px] text-slate-600 mt-1">
              JS expression against context.data. True → pass handle, False → fail handle.
            </div>
          </div>
        )}

        {blockType === 'llm' && (
          <>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                Model (optional)
              </label>
              <input
                className="cyber-input cyber-input-sm w-full"
                placeholder="Leave blank for default"
                value={config.model ?? ''}
                onChange={(e) => updateConfig('model', e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                System Prompt
              </label>
              <textarea
                className="cyber-input cyber-input-sm w-full min-h-[40px] resize-y"
                placeholder="Optional system instructions..."
                value={config.systemPrompt ?? ''}
                onChange={(e) => updateConfig('systemPrompt', e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                User Prompt
              </label>
              <textarea
                className="cyber-input cyber-input-sm w-full min-h-[60px] resize-y"
                placeholder="Use {{data.varName}} for context variables"
                value={config.userPrompt ?? ''}
                onChange={(e) => updateConfig('userPrompt', e.target.value)}
              />
            </div>
          </>
        )}

        {blockType === 'memory' && (
          <>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                Operation
              </label>
              <select
                className="cyber-select cyber-select-sm w-full"
                value={config.memoryOp ?? 'search'}
                onChange={(e) => updateConfig('memoryOp', e.target.value)}
              >
                <option value="search">Search</option>
                <option value="store">Store</option>
              </select>
            </div>
            {config.memoryOp === 'search' && (
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                  Query
                </label>
                <input
                  className="cyber-input cyber-input-sm w-full"
                  placeholder="Search query or {{data.query}}"
                  value={config.memoryQuery ?? ''}
                  onChange={(e) => updateConfig('memoryQuery', e.target.value)}
                />
              </div>
            )}
            {config.memoryOp === 'store' && (
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                  Content
                </label>
                <textarea
                  className="cyber-input cyber-input-sm w-full min-h-[60px] resize-y"
                  placeholder="Content to store or {{data.result}}"
                  value={config.memoryContent ?? ''}
                  onChange={(e) => updateConfig('memoryContent', e.target.value)}
                />
              </div>
            )}
          </>
        )}

        {blockType === 'output' && (
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
              Output Type
            </label>
            <select
              className="cyber-select cyber-select-sm w-full"
              value={config.outputType ?? 'log'}
              onChange={(e) => updateConfig('outputType', e.target.value)}
            >
              <option value="log">Log Result</option>
              <option value="notify">Send Notification</option>
              <option value="store">Store to Memory</option>
              <option value="webhook">Fire Webhook</option>
            </select>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <button onClick={() => onDelete(nodeId)} className="cyber-btn-danger cyber-btn-xs w-full">
          Delete Block
        </button>
      </div>
    </div>
  )
}
