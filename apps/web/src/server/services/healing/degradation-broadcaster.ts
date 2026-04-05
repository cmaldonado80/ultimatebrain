/**
 * Degradation Broadcaster — propagates agent degradation signals across subsystems.
 *
 * When the cortex degrades or upgrades an agent, this broadcaster:
 * 1. Creates instinct observations (so the instinct pipeline can learn recovery patterns)
 * 2. Emits events on the orchestration EventBus (so other services can react)
 * 3. Logs structured degradation data for observability
 *
 * This transforms the cortex from a passive monitor into an active controller.
 */

import type { Database } from '@solarc/db'
import { instinctObservations } from '@solarc/db'

import { logger } from '../../../lib/logger'
import type { DegradationEvent } from './agent-degradation'

/**
 * Broadcast a degradation event across subsystems.
 * Called by AgentDegradationManager after each level transition.
 */
export async function broadcastDegradation(event: DegradationEvent, db: Database): Promise<void> {
  const isDowngrade = isLevelWorse(event.to, event.from)

  // 1. Record as instinct observation — enables the instinct pipeline
  //    to learn recovery patterns (e.g., "when degraded → use simpler approach")
  try {
    await db.insert(instinctObservations).values({
      eventType: 'agent_degradation',
      payload: {
        agentId: event.agentId,
        agentName: event.agentName,
        from: event.from,
        to: event.to,
        reason: event.reason,
        direction: isDowngrade ? 'downgrade' : 'upgrade',
      },
    })
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err : undefined },
      `degradation-broadcast: failed to record instinct observation for ${event.agentId}`,
    )
  }

  // 2. Log structured event for observability
  if (isDowngrade) {
    logger.warn(
      {
        agentId: event.agentId,
        from: event.from,
        to: event.to,
        reason: event.reason,
      },
      `agent degraded: ${event.agentName} ${event.from} → ${event.to}`,
    )
  } else {
    logger.info(
      {
        agentId: event.agentId,
        from: event.from,
        to: event.to,
        reason: event.reason,
      },
      `agent recovered: ${event.agentName} ${event.from} → ${event.to}`,
    )
  }
}

const LEVEL_ORDER = ['full', 'reduced', 'minimal', 'suspended']

function isLevelWorse(to: string, from: string): boolean {
  return LEVEL_ORDER.indexOf(to) > LEVEL_ORDER.indexOf(from)
}
