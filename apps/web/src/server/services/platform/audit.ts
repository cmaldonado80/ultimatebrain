/**
 * Audit Event Logger — tracks governance-relevant actions.
 *
 * Fire-and-forget by design. Audit failures should not block operations.
 *
 * Usage:
 *   await auditEvent(db, userId, 'create_mini_brain', 'brain_entity', entityId, { template })
 */

import type { Database } from '@solarc/db'
import { auditEvents } from '@solarc/db'

export async function auditEvent(
  db: Database,
  userId: string | null,
  action: string,
  resourceType: string,
  resourceId: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      userId,
      action,
      resourceType,
      resourceId,
      metadata: metadata ?? null,
    })
  } catch (err) {
    // Audit failures must not block operations
    console.error('[Audit] Failed to log event:', err instanceof Error ? err.message : err)
  }
}
