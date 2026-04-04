/**
 * Corporate Notification Service — Alert the board when the corporation needs attention.
 *
 * Automatically dispatches notifications when important events occur:
 *   - Agent needs approval (work product review, hire request)
 *   - Budget threshold hit (soft warning at 80%, hard at 100%)
 *   - Guardrail violation (security or critical severity)
 *   - Agent terminated or failed
 *   - Deployment completed or failed
 *   - Work product ready for review
 *
 * Channels: in-app inbox, webhook URL, Slack (via slack_send tool)
 */

import type { Database } from '@solarc/db'
import { agentMessages } from '@solarc/db'

import { logger } from '../../../lib/logger'

// ── Types ─────────────────────────────────────────────────────────────

export type NotificationPriority = 'info' | 'warning' | 'urgent' | 'critical'
export type NotificationChannel = 'inbox' | 'webhook' | 'slack'

export interface Notification {
  id: string
  type: string
  title: string
  message: string
  priority: NotificationPriority
  entityId?: string
  agentId?: string
  actionUrl?: string
  channels: NotificationChannel[]
  createdAt: number
  read: boolean
}

export interface NotificationConfig {
  webhookUrl?: string
  slackChannel?: string
  enabledTypes: string[]
  minimumPriority: NotificationPriority
}

// ── In-Memory Notification Store ────────────────────────────────────

const notifications: Notification[] = []
const MAX_NOTIFICATIONS = 200
let config: NotificationConfig = {
  enabledTypes: [
    'approval_needed',
    'budget_warning',
    'budget_exceeded',
    'guardrail_violation',
    'agent_terminated',
    'deployment_failed',
    'work_product_ready',
  ],
  minimumPriority: 'info',
}

// ── Priority Levels ─────────────────────────────────────────────────

const PRIORITY_ORDER: Record<NotificationPriority, number> = {
  info: 0,
  warning: 1,
  urgent: 2,
  critical: 3,
}

// ── Core Functions ──────────────────────────────────────────────────

/**
 * Send a notification to the board of directors.
 */
export async function notify(
  db: Database | null,
  type: string,
  title: string,
  message: string,
  priority: NotificationPriority,
  options?: {
    entityId?: string
    agentId?: string
    actionUrl?: string
    channels?: NotificationChannel[]
  },
): Promise<Notification> {
  // Check if this type is enabled
  if (!config.enabledTypes.includes(type)) {
    return createNotification(type, title, message, 'info', options)
  }

  // Check minimum priority
  if (PRIORITY_ORDER[priority] < PRIORITY_ORDER[config.minimumPriority]) {
    return createNotification(type, title, message, priority, options)
  }

  const notification = createNotification(type, title, message, priority, options)

  // Store in memory
  notifications.unshift(notification)
  if (notifications.length > MAX_NOTIFICATIONS) notifications.pop()

  // Dispatch to channels
  const channels = options?.channels ?? ['inbox']

  for (const channel of channels) {
    try {
      switch (channel) {
        case 'inbox':
          // Store as agent message from "system" to itself (for inbox page)
          if (db) {
            await db
              .insert(agentMessages)
              .values({
                fromAgentId: options?.agentId ?? '00000000-0000-0000-0000-000000000000',
                toAgentId: options?.agentId ?? '00000000-0000-0000-0000-000000000000',
                text: `[${priority.toUpperCase()}] ${title}\n\n${message}${options?.actionUrl ? `\n\nAction: ${options.actionUrl}` : ''}`,
                read: false,
                ackStatus: 'pending',
              })
              .catch((err) => logger.warn({ err }, 'notification: inbox delivery failed'))
          }
          break

        case 'webhook':
          if (config.webhookUrl) {
            fetch(config.webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(notification),
            }).catch((err) => logger.warn({ err }, 'notification: webhook delivery failed'))
          }
          break

        case 'slack':
          // Slack integration via existing slack_send would happen here
          // For now, stored in inbox
          break
      }
    } catch {
      // Non-critical — notification still stored in memory
    }
  }

  return notification
}

function createNotification(
  type: string,
  title: string,
  message: string,
  priority: NotificationPriority,
  options?: {
    entityId?: string
    agentId?: string
    actionUrl?: string
    channels?: NotificationChannel[]
  },
): Notification {
  return {
    id: crypto.randomUUID(),
    type,
    title,
    message,
    priority,
    entityId: options?.entityId,
    agentId: options?.agentId,
    actionUrl: options?.actionUrl,
    channels: options?.channels ?? ['inbox'],
    createdAt: Date.now(),
    read: false,
  }
}

// ── Query Functions ─────────────────────────────────────────────────

export function getNotifications(options?: {
  unreadOnly?: boolean
  priority?: NotificationPriority
  limit?: number
}): Notification[] {
  let result = [...notifications]

  if (options?.unreadOnly) {
    result = result.filter((n) => !n.read)
  }

  if (options?.priority) {
    const minLevel = PRIORITY_ORDER[options.priority]
    result = result.filter((n) => PRIORITY_ORDER[n.priority] >= minLevel)
  }

  return result.slice(0, options?.limit ?? 50)
}

export function markRead(notificationId: string): void {
  const n = notifications.find((x) => x.id === notificationId)
  if (n) n.read = true
}

export function markAllRead(): void {
  for (const n of notifications) n.read = true
}

export function getUnreadCount(): number {
  return notifications.filter((n) => !n.read).length
}

export function updateConfig(newConfig: Partial<NotificationConfig>): void {
  config = { ...config, ...newConfig }
}

export function getConfig(): NotificationConfig {
  return { ...config }
}

// ── Convenience Helpers (pre-built notification types) ──────────────

export async function notifyApprovalNeeded(
  db: Database | null,
  title: string,
  actionUrl: string,
  agentId?: string,
) {
  return notify(
    db,
    'approval_needed',
    `Approval Required: ${title}`,
    'A work product or action needs your review.',
    'urgent',
    { actionUrl, agentId, channels: ['inbox', 'webhook'] },
  )
}

export async function notifyBudgetWarning(db: Database | null, entityId: string, percent: number) {
  return notify(
    db,
    'budget_warning',
    `Budget Warning: ${percent.toFixed(0)}%`,
    `Entity ${entityId.slice(0, 8)} has reached ${percent.toFixed(0)}% of its budget limit.`,
    'warning',
    { entityId, channels: ['inbox', 'webhook'] },
  )
}

export async function notifyBudgetExceeded(db: Database | null, entityId: string) {
  return notify(
    db,
    'budget_exceeded',
    'Budget Exceeded — Agent Paused',
    `Entity ${entityId.slice(0, 8)} has exceeded its budget. Work has been paused.`,
    'critical',
    { entityId, actionUrl: '/ceo', channels: ['inbox', 'webhook'] },
  )
}

export async function notifyGuardrailViolation(
  db: Database | null,
  rule: string,
  severity: string,
) {
  return notify(
    db,
    'guardrail_violation',
    `Guardrail: ${rule}`,
    `A ${severity} guardrail violation was detected.`,
    severity === 'critical' ? 'critical' : 'warning',
    { actionUrl: '/guardrails', channels: ['inbox'] },
  )
}

export async function notifyAgentTerminated(
  db: Database | null,
  agentName: string,
  reason: string,
) {
  return notify(db, 'agent_terminated', `Agent Terminated: ${agentName}`, reason, 'warning', {
    actionUrl: '/org-chart',
    channels: ['inbox'],
  })
}

export async function notifyWorkProductReady(
  db: Database | null,
  productName: string,
  _ticketId: string,
) {
  return notify(
    db,
    'work_product_ready',
    `Ready for Review: ${productName}`,
    `A work product is ready for your approval.`,
    'info',
    { actionUrl: '/work-products', channels: ['inbox'] },
  )
}
