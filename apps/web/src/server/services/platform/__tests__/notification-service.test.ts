import type { Database } from '@solarc/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockDb } from '../../../../../../../test/helpers/db-mock'

// The notification service uses module-level state, so we re-import per test group
// to get a clean slate.

describe('NotificationService', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.resetModules()
    db = createMockDb()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('notify() creates a notification with correct type, title, message, priority', async () => {
    const { notify } = await import('../notification-service')

    const n = await notify(
      db as unknown as Database,
      'budget_warning',
      'Budget Alert',
      'You are at 80%',
      'warning',
    )

    expect(n.type).toBe('budget_warning')
    expect(n.title).toBe('Budget Alert')
    expect(n.message).toBe('You are at 80%')
    expect(n.priority).toBe('warning')
    expect(n.id).toBeDefined()
    expect(n.read).toBe(false)
  })

  it('notify() respects enabledTypes filter — disabled type skips store', async () => {
    const { notify, getNotifications, updateConfig } = await import('../notification-service')

    // Disable all types
    updateConfig({ enabledTypes: [] })

    const n = await notify(db as unknown as Database, 'budget_warning', 'Alert', 'msg', 'warning')

    // Notification is still returned (created) but not stored in memory
    expect(n).toBeDefined()
    const stored = getNotifications()
    expect(stored).toHaveLength(0)
  })

  it('notify() respects minimumPriority gate', async () => {
    const { notify, getNotifications, updateConfig } = await import('../notification-service')

    updateConfig({ minimumPriority: 'urgent' })

    // 'info' is below 'urgent', so it should not be stored
    await notify(db as unknown as Database, 'budget_warning', 'Low', 'msg', 'info')
    expect(getNotifications()).toHaveLength(0)

    // 'critical' is above 'urgent', should be stored
    await notify(db as unknown as Database, 'budget_warning', 'High', 'msg', 'critical')
    expect(getNotifications()).toHaveLength(1)
  })

  it('notifyBudgetWarning convenience helper', async () => {
    const { notifyBudgetWarning } = await import('../notification-service')

    const n = await notifyBudgetWarning(
      db as unknown as Database,
      '12345678-abcd-efgh-ijkl-000000000000',
      80,
    )

    expect(n.type).toBe('budget_warning')
    expect(n.title).toContain('80%')
    expect(n.priority).toBe('warning')
    expect(n.entityId).toBe('12345678-abcd-efgh-ijkl-000000000000')
  })

  it('notifyBudgetExceeded convenience helper', async () => {
    const { notifyBudgetExceeded } = await import('../notification-service')

    const n = await notifyBudgetExceeded(
      db as unknown as Database,
      '12345678-abcd-efgh-ijkl-000000000000',
    )

    expect(n.type).toBe('budget_exceeded')
    expect(n.title).toContain('Exceeded')
    expect(n.priority).toBe('critical')
    expect(n.actionUrl).toBe('/ceo')
  })

  it('getNotifications() returns recent notifications', async () => {
    const { notify, getNotifications } = await import('../notification-service')

    await notify(db as unknown as Database, 'budget_warning', 'First', 'msg1', 'warning')
    await notify(db as unknown as Database, 'budget_warning', 'Second', 'msg2', 'warning')
    await notify(db as unknown as Database, 'budget_warning', 'Third', 'msg3', 'warning')

    const all = getNotifications()
    expect(all).toHaveLength(3)
    // Most recent first (unshift)
    expect(all[0].title).toBe('Third')
    expect(all[2].title).toBe('First')
  })

  it('getUnreadCount() returns correct count', async () => {
    const { notify, getUnreadCount, markRead } = await import('../notification-service')

    await notify(db as unknown as Database, 'budget_warning', 'A', 'msg', 'warning')
    await notify(db as unknown as Database, 'budget_warning', 'B', 'msg', 'warning')

    expect(getUnreadCount()).toBe(2)

    const { getNotifications } = await import('../notification-service')
    const all = getNotifications()
    markRead(all[0].id)

    expect(getUnreadCount()).toBe(1)
  })
})
