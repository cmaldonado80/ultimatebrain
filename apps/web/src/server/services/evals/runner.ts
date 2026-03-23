/**
 * Eval Runner: executes eval cases through scorers and persists results.
 *
 * Supports running a full dataset, individual cases, and comparing runs.
 */

import type { Database } from '@solarc/db'
import { evalDatasets, evalCases, evalRuns } from '@solarc/db'
import { eq, desc, and } from 'drizzle-orm'
import type { EvalScores } from '@solarc/engine-contracts'
import { ALL_SCORERS, type ScorerInput, type Scorer } from './scorers'

export interface EvalCaseResult {
  caseId: string
  scores: EvalScores
  passed: boolean
  /** Overall aggregate score (0-1) */
  aggregate: number
}

export interface EvalRunResult {
  runId: string
  datasetId: string
  version: string | undefined
  caseResults: EvalCaseResult[]
  averageScores: EvalScores
  overallScore: number
  passRate: number
}

export interface RunOptions {
  /** Minimum aggregate score to consider a case "passed" (default: 0.7) */
  passThreshold?: number
  /** Subset of scorer names to run (default: all) */
  scorerNames?: string[]
  /** Version tag for this run */
  version?: string
  /** Function that produces actual output for an eval case input */
  executor?: (input: unknown) => Promise<{ output: unknown; trace?: ScorerInput['trace'] }>
  /** Pre-computed outputs (keyed by case ID) */
  outputs?: Map<string, { output: unknown; trace?: ScorerInput['trace'] }>
}

const PASS_THRESHOLD = 0.7

export class EvalRunner {
  private scorers: Scorer[]

  constructor(
    private db: Database,
    scorerOverride?: Scorer[],
  ) {
    this.scorers = scorerOverride ?? ALL_SCORERS
  }

  /**
   * Run eval on a single case with a given output.
   */
  scoreCase(
    caseId: string,
    input: unknown,
    expectedOutput: unknown | undefined,
    actualOutput: unknown,
    trace?: ScorerInput['trace'],
    options?: { passThreshold?: number; scorerNames?: string[] },
  ): EvalCaseResult {
    const threshold = options?.passThreshold ?? PASS_THRESHOLD
    const activeScorers = options?.scorerNames
      ? this.scorers.filter((s) => options.scorerNames!.includes(s.name))
      : this.scorers

    const scorerInput: ScorerInput = { input, expectedOutput, actualOutput, trace }
    const scores: Record<string, number> = {}

    for (const scorer of activeScorers) {
      scores[scorer.name] = clamp(scorer.score(scorerInput))
    }

    // Fill defaults for missing scores
    const evalScores: EvalScores = {
      taskCompletion: scores.taskCompletion ?? 1,
      factuality: scores.factuality ?? 1,
      toolUseAccuracy: scores.toolUseAccuracy ?? 1,
      safety: scores.safety ?? 1,
      costEfficiency: scores.costEfficiency ?? 1,
    }

    const aggregate = weightedAverage(evalScores)

    return {
      caseId,
      scores: evalScores,
      passed: aggregate >= threshold,
      aggregate,
    }
  }

  /**
   * Run eval across an entire dataset.
   * Requires either `options.executor` or `options.outputs` to produce actual outputs.
   */
  async runDataset(datasetId: string, options: RunOptions = {}): Promise<EvalRunResult> {
    // Load cases
    const cases = await this.db.query.evalCases.findMany({
      where: eq(evalCases.datasetId, datasetId),
    })

    if (cases.length === 0) {
      throw new Error(`No eval cases found for dataset ${datasetId}`)
    }

    const caseResults: EvalCaseResult[] = []

    for (const evalCase of cases) {
      let actualOutput: unknown
      let trace: ScorerInput['trace'] | undefined

      if (options.outputs?.has(evalCase.id)) {
        const precomputed = options.outputs.get(evalCase.id)!
        actualOutput = precomputed.output
        trace = precomputed.trace
      } else if (options.executor) {
        const result = await options.executor(evalCase.input)
        actualOutput = result.output
        trace = result.trace
      } else {
        // Skip cases without outputs
        continue
      }

      const result = this.scoreCase(
        evalCase.id,
        evalCase.input,
        evalCase.expectedOutput,
        actualOutput,
        trace,
        { passThreshold: options.passThreshold, scorerNames: options.scorerNames },
      )
      caseResults.push(result)
    }

    // Compute averages
    const averageScores = averageEvalScores(caseResults.map((r) => r.scores))
    const overallScore = weightedAverage(averageScores)
    const passRate = caseResults.length > 0
      ? caseResults.filter((r) => r.passed).length / caseResults.length
      : 0

    // Persist run
    const [run] = await this.db.insert(evalRuns).values({
      datasetId,
      version: options.version,
      scores: {
        averageScores,
        overallScore,
        passRate,
        caseCount: caseResults.length,
        caseResults: caseResults.map((r) => ({
          caseId: r.caseId,
          scores: r.scores,
          passed: r.passed,
          aggregate: r.aggregate,
        })),
      },
    }).returning()

    return {
      runId: run!.id,
      datasetId,
      version: options.version,
      caseResults,
      averageScores,
      overallScore,
      passRate,
    }
  }

  /**
   * Compare two runs side-by-side.
   */
  async compareRuns(runIdA: string, runIdB: string): Promise<{
    runA: { id: string; scores: EvalScores; overall: number }
    runB: { id: string; scores: EvalScores; overall: number }
    delta: EvalScores
    improved: boolean
  }> {
    const [runA, runB] = await Promise.all([
      this.db.query.evalRuns.findFirst({ where: eq(evalRuns.id, runIdA) }),
      this.db.query.evalRuns.findFirst({ where: eq(evalRuns.id, runIdB) }),
    ])

    if (!runA || !runB) throw new Error('One or both runs not found')

    const runAScores = runA.scores as Record<string, unknown> | null
    const runBScores = runB.scores as Record<string, unknown> | null
    const scoresA = runAScores?.averageScores as EvalScores | undefined
    const scoresB = runBScores?.averageScores as EvalScores | undefined

    if (!scoresA || !scoresB) throw new Error('Runs missing average scores')

    const delta: EvalScores = {
      taskCompletion: scoresB.taskCompletion - scoresA.taskCompletion,
      factuality: scoresB.factuality - scoresA.factuality,
      toolUseAccuracy: scoresB.toolUseAccuracy - scoresA.toolUseAccuracy,
      safety: scoresB.safety - scoresA.safety,
      costEfficiency: scoresB.costEfficiency - scoresA.costEfficiency,
    }

    const overallA = weightedAverage(scoresA)
    const overallB = weightedAverage(scoresB)

    return {
      runA: { id: runIdA, scores: scoresA, overall: overallA },
      runB: { id: runIdB, scores: scoresB, overall: overallB },
      delta,
      improved: overallB > overallA,
    }
  }

  /**
   * Get the latest N runs for a dataset.
   */
  async getRunHistory(datasetId: string, limit = 10) {
    return this.db.query.evalRuns.findMany({
      where: eq(evalRuns.datasetId, datasetId),
      orderBy: desc(evalRuns.createdAt),
      limit,
    })
  }
}

// === Helpers ===

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n))
}

/** Weighted average of eval scores (all equal weight for now) */
function weightedAverage(scores: EvalScores): number {
  const weights = {
    taskCompletion: 0.30,
    factuality: 0.25,
    toolUseAccuracy: 0.15,
    safety: 0.20,
    costEfficiency: 0.10,
  }

  let sum = 0
  let totalWeight = 0
  for (const [key, weight] of Object.entries(weights)) {
    sum += (scores[key as keyof EvalScores] ?? 0) * weight
    totalWeight += weight
  }
  return totalWeight > 0 ? sum / totalWeight : 0
}

function averageEvalScores(allScores: EvalScores[]): EvalScores {
  if (allScores.length === 0) {
    return { taskCompletion: 0, factuality: 0, toolUseAccuracy: 0, safety: 0, costEfficiency: 0 }
  }

  const sum = { taskCompletion: 0, factuality: 0, toolUseAccuracy: 0, safety: 0, costEfficiency: 0 }
  for (const s of allScores) {
    sum.taskCompletion += s.taskCompletion
    sum.factuality += s.factuality
    sum.toolUseAccuracy += s.toolUseAccuracy
    sum.safety += s.safety
    sum.costEfficiency += s.costEfficiency
  }
  const n = allScores.length
  return {
    taskCompletion: sum.taskCompletion / n,
    factuality: sum.factuality / n,
    toolUseAccuracy: sum.toolUseAccuracy / n,
    safety: sum.safety / n,
    costEfficiency: sum.costEfficiency / n,
  }
}
