'use client'

/**
 * Notifications — Board of directors alert center.
 */

import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

const PRIORITY_COLORS: Record<string, 'green' | 'yellow' | 'red' | 'blue' | 'slate'> = {
  info: 'blue',
  warning: 'yellow',
  urgent: 'red',
  critical: 'red',
}

export default function NotificationsPage() {
  const utils = trpc.useUtils()
  const notifQuery = trpc.platform.notifications.useQuery({ limit: 50 })
  const unreadQuery = trpc.platform.notificationUnreadCount.useQuery()
  const markReadMut = trpc.platform.notificationMarkRead.useMutation({
    onSuccess: () => {
      utils.platform.notifications.invalidate()
      utils.platform.notificationUnreadCount.invalidate()
    },
  })
  const markAllMut = trpc.platform.notificationMarkAllRead.useMutation({
    onSuccess: () => {
      utils.platform.notifications.invalidate()
      utils.platform.notificationUnreadCount.invalidate()
    },
  })

  if (notifQuery.isLoading) return <LoadingState message="Loading Notifications..." />

  const notifications = (notifQuery.data ?? []) as Array<{
    id: string
    type: string
    title: string
    message: string
    priority: string
    actionUrl?: string
    createdAt: number
    read: boolean
  }>

  const unread = (unreadQuery.data as { count: number } | undefined)?.count ?? 0

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Notifications"
        subtitle={`Board alerts — ${unread} unread`}
        actions={
          unread > 0 ? (
            <button
              onClick={() => markAllMut.mutate()}
              className="cyber-btn-secondary cyber-btn-sm"
            >
              Mark All Read
            </button>
          ) : undefined
        }
      />

      <SectionCard title={`All Notifications (${notifications.length})`}>
        {notifications.length === 0 ? (
          <div className="text-xs text-slate-600 py-6 text-center">
            No notifications. The corporation is running smoothly.
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`bg-bg-deep rounded px-4 py-3 ${!n.read ? 'border-l-2 border-neon-teal' : ''}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <StatusBadge label={n.priority} color={PRIORITY_COLORS[n.priority] ?? 'slate'} />
                  <span className="text-[10px] text-slate-500">{n.type.replace(/_/g, ' ')}</span>
                  <span className="text-[9px] text-slate-600 ml-auto">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                  {!n.read && (
                    <button
                      onClick={() => markReadMut.mutate({ id: n.id })}
                      className="text-[9px] text-slate-500 hover:text-neon-teal"
                    >
                      Mark read
                    </button>
                  )}
                </div>
                <div className="text-[12px] text-slate-200 font-medium">{n.title}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{n.message}</div>
                {n.actionUrl && (
                  <a
                    href={n.actionUrl}
                    className="text-[9px] text-neon-teal hover:underline mt-1 inline-block no-underline"
                  >
                    View details →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
