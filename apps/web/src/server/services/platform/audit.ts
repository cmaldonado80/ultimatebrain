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

import { logger } from '../../../lib/logger'

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
    logger.error({ err: err instanceof Error ? err : undefined }, '[Audit] Failed to log event')
  }
}
