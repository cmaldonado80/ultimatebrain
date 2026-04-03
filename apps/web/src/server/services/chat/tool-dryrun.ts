/**
 * Dry-Run Mode for Destructive Tools
 *
 * Stolen from Larksuite CLI's --dry-run pattern.
 * Instead of executing, returns a preview of what would happen.
 * The agent must then explicitly confirm to proceed.
 *
 * Works with the tool tier system:
 * - Safe tools: never dry-run
 * - Privileged destructive tools: dry-run when agent capability is 'reduced' or 'minimal'
 * - Raw/admin tools: always dry-run (require explicit approval)
 */

import { type ToolDryRun, toolDryRun } from './tool-envelope'
import { classifyTool } from './tool-tiers'

// ── Types ────────────────────────────────────────────────────────────────

export interface DryRunContext {
  agentCapabilityLevel: 'full' | 'reduced' | 'minimal' | 'suspended'
  forcePreview: boolean // agent explicitly requested preview
}

// ── Dry-Run Decision ─────────────────────────────────────────────────────

/**
 * Determine if a tool call should be dry-run instead of executed.
 */
export function shouldDryRun(toolName: string, ctx: DryRunContext): boolean {
  if (ctx.forcePreview) return true

  const classification = classifyTool(toolName)

  // Safe tools never dry-run
  if (classification.tier === 'safe') return false

  // Non-dry-runnable tools can't preview
  if (!classification.dryRunnable) return false

  // Raw/admin: always dry-run
  if (classification.tier === 'raw') return true

  // Privileged + destructive + degraded agent: dry-run
  if (
    classification.destructive &&
    (ctx.agentCapabilityLevel === 'reduced' || ctx.agentCapabilityLevel === 'minimal')
  ) {
    return true
  }

  return false
}

/**
 * Generate a dry-run preview for a tool call.
 */
export function generateDryRun(toolName: string, toolInput: Record<string, unknown>): ToolDryRun {
  const classification = classifyTool(toolName)
  const preview = describeTool(toolName, toolInput)

  return toolDryRun(
    {
      tool: toolName,
      tier: classification.tier,
      destructive: classification.destructive,
      input: sanitizeInput(toolInput),
    },
    preview,
  )
}

// ── Tool Description ─────────────────────────────────────────────────────

function describeTool(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'file_write':
      return `Would WRITE to file: ${input.path ?? 'unknown'} (${estimateSize(input.content)} bytes)`

    case 'db_query': {
      const sql = (input.sql as string) ?? (input.query as string) ?? ''
      const isWrite = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/i.test(sql)
      return isWrite
        ? `Would EXECUTE destructive SQL: ${sql.slice(0, 100)}...`
        : `Would QUERY (read-only): ${sql.slice(0, 100)}...`
    }

    case 'git_operations':
      return `Would execute git operation: ${input.command ?? input.operation ?? 'unknown'}`

    case 'docker_manage':
      return `Would manage Docker: ${input.action ?? input.command ?? 'unknown'}`

    case 'shell_exec':
      return `Would EXECUTE shell command: ${(input.command as string)?.slice(0, 100) ?? 'unknown'}`

    case 'create_ticket':
      return `Would CREATE ticket: "${input.title ?? 'untitled'}" in workspace ${input.workspaceId ?? 'default'}`

    case 'create_project':
      return `Would CREATE project: "${input.name ?? 'untitled'}"`

    case 'memory_store':
      return `Would STORE memory: "${(input.content as string)?.slice(0, 80) ?? '...'}"`

    case 'workflow_execute':
      return `Would EXECUTE workflow: ${input.workflowId ?? 'unknown'}`

    case 'notion_create_page':
      return `Would CREATE Notion page: "${input.title ?? 'untitled'}"`

    case 'notion_update_page':
      return `Would UPDATE Notion page: ${input.pageId ?? 'unknown'}`

    case 'slack_send_message':
      return `Would SEND Slack message to ${input.channel ?? 'unknown'}: "${(input.text as string)?.slice(0, 80) ?? '...'}"`

    case 'run_tests':
      return `Would RUN tests: ${input.command ?? input.pattern ?? 'all'}`

    default:
      return `Would execute ${toolName} with ${Object.keys(input).length} parameters`
  }
}

function sanitizeInput(input: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' && value.length > 200) {
      sanitized[key] = value.slice(0, 200) + '...[truncated]'
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

function estimateSize(content: unknown): number {
  if (typeof content === 'string') return content.length
  if (content === null || content === undefined) return 0
  return JSON.stringify(content).length
}
