/**
 * Auto-Evolution Runner — Periodic self-improvement for agents.
 *
 * Scans all active agents, analyzes their performance, and triggers
 * evolution for underperformers. Designed to run as a cron job.
 *
 * Also handles periodic memory consolidation (batch, not per-chat).
 */

import type { Database } from '@solarc/db'
import { agents } from '@solarc/db'
import { eq } from 'drizzle-orm'

import { GatewayRouter } from '../gateway'
import { consolidateMemories } from '../memory/memory-intelligence'
import { analyzeAgentPerformance } from './analyzer'
import { evolveAgent } from './evolution-service'

// ── Types ─────────────────────────────────────────────────────────────

export interface AutoEvolutionConfig {
  /** Minimum runs before considering evolution (default: 10) */
  minRuns: number
  /** Score threshold — evolve agents below this (default: 0.6) */
  scoreThreshold: number
  /** Days of history to analyze (default: 7) */
  windowDays: number
  /** Max agents to evolve per run (default: 5) */
  maxAgentsPerRun: number
}

export interface AutoEvolutionResult {
  agentsScanned: number
  agentsAnalyzed: number
  agentsEvolved: string[]
  agentsSkipped: string[]
  errors: string[]
  consolidationResult?: {
    observationsCreated: number
    observationsUpdated: number
    factsProcessed: number
  }
}

const DEFAULT_CONFIG: AutoEvolutionConfig = {
  minRuns: 10,
  scoreThreshold: 0.6,
  windowDays: 7,
  maxAgentsPerRun: 5,
}

// ── Auto-Evolution Runner ─────────────────────────────────────────────

/**
 * Scan all active agents, analyze performance, and evolve underperformers.
 * Call this from a cron job (e.g., weekly at 3 AM).
 */
export async function runAutoEvolution(
  db: Database,
  config: Partial<AutoEvolutionConfig> = {},
): Promise<AutoEvolutionResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const result: AutoEvolutionResult = {
    agentsScanned: 0,
    agentsAnalyzed: 0,
    agentsEvolved: [],
    agentsSkipped: [],
    errors: [],
  }

  // Get all non-idle agents
  const activeAgents = await db.query.agents.findMany({
    where: eq(agents.status, 'idle'), // 'idle' means available, not inactive
    limit: 50,
  })

  result.agentsScanned = activeAgents.length
  let evolvedCount = 0

  for (const agent of activeAgents) {
    if (evolvedCount >= cfg.maxAgentsPerRun) break

    try {
      const analysis = await analyzeAgentPerformance(db, agent.id, cfg.windowDays)
      if (!analysis) continue

      result.agentsAnalyzed++

      // Skip if insufficient data
      if (analysis.recommendation === 'insufficient_data') {
        result.agentsSkipped.push(
          `${agent.name}: insufficient data (${analysis.observedRuns} runs)`,
        )
        continue
      }

      // Skip if performing well
      if (analysis.recommendation === 'stable') {
        result.agentsSkipped.push(
          `${agent.name}: stable (score: ${analysis.avgScore.toFixed(2)}, success: ${(analysis.successRate * 100).toFixed(0)}%)`,
        )
        continue
      }

      // Evolve underperformers
      if (analysis.recommendation === 'evolve') {
        const evoResult = await evolveAgent(db, agent.id, { windowDays: cfg.windowDays })
        if (evoResult.status === 'accepted') {
          result.agentsEvolved.push(`${agent.name}: evolved (${evoResult.summary})`)
          evolvedCount++
        } else {
          result.agentsSkipped.push(
            `${agent.name}: evolution ${evoResult.status} (${evoResult.reason})`,
          )
        }
      }
    } catch (err) {
      result.errors.push(`${agent.name}: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }

  // Run memory consolidation as part of the cron cycle
  try {
    const gw = new GatewayRouter(db)
    const consResult = await consolidateMemories(db, gw, { limit: 100 })
    result.consolidationResult = {
      observationsCreated: consResult.observationsCreated,
      observationsUpdated: consResult.observationsUpdated,
      factsProcessed: consResult.factsProcessed,
    }
  } catch (err) {
    result.errors.push(`consolidation: ${err instanceof Error ? err.message : 'failed'}`)
  }

  return result
}
