/**
 * Strategy Executor — decomposes a goal into tickets using AI,
 * then creates and optionally executes them.
 */

import type { Database } from '@solarc/db'
import { strategyRuns, tickets } from '@solarc/db'
import { eq } from 'drizzle-orm'
import type { GatewayRouter } from '../gateway'

interface DecomposedTicket {
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
}

/**
 * Execute a strategy run: decompose the plan into tickets via LLM,
 * create the tickets, and link them to the strategy.
 */
export async function executeStrategy(
  db: Database,
  gateway: GatewayRouter,
  runId: string,
): Promise<{ ticketIds: string[]; error?: string }> {
  // 1. Load the strategy run
  const run = await db.query.strategyRuns.findFirst({ where: eq(strategyRuns.id, runId) })
  if (!run) return { ticketIds: [], error: 'Strategy run not found' }
  if (!run.plan) return { ticketIds: [], error: 'Strategy has no plan' }

  // 2. Decompose goal into tickets via LLM
  let decomposed: DecomposedTicket[]
  try {
    const result = await gateway.chat({
      messages: [
        {
          role: 'system',
          content:
            'You are a project decomposition expert. Given a goal/plan, break it into specific actionable tickets. ' +
            'Return ONLY a JSON array of objects with {title, description, priority} where priority is low/medium/high/critical. ' +
            'Keep tickets focused — each should be completable by a single agent. 3-8 tickets is ideal.',
        },
        { role: 'user', content: `Decompose this goal into tickets:\n\n${run.plan}` },
      ],
    })

    // Parse the JSON from the response
    const jsonMatch = result.content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return { ticketIds: [], error: 'LLM did not return valid JSON array' }
    }
    decomposed = JSON.parse(jsonMatch[0]) as DecomposedTicket[]
  } catch (err) {
    return {
      ticketIds: [],
      error: `Decomposition failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }

  // 3. Create tickets
  const ticketIds: string[] = []
  for (const t of decomposed) {
    const [ticket] = await db
      .insert(tickets)
      .values({
        title: t.title,
        description: t.description,
        priority: t.priority,
        workspaceId: run.workspaceId,
      })
      .returning()
    if (ticket) ticketIds.push(ticket.id)
  }

  // 4. Update strategy run with ticket IDs
  await db
    .update(strategyRuns)
    .set({
      status: 'running',
      tickets: ticketIds,
      startedAt: new Date(),
    })
    .where(eq(strategyRuns.id, runId))

  return { ticketIds }
}
