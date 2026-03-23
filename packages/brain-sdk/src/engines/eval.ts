/**
 * Eval Engine — run evaluations against agents
 */

import type { RetryPolicy } from '../transport/retry'

export interface EvalRunOptions {
  agentId: string
  suiteId?: string
  criteria?: string[]
}

export interface EvalRunResult {
  runId: string
  agentId: string
  score: number
  results: Array<{ criterion: string; score: number; explanation: string }>
  completedAt: string
}

export class EvalEngine {
  constructor(
    private fetch: (path: string, body: unknown) => Promise<unknown>,
    private retry: RetryPolicy
  ) {}

  async run(options: EvalRunOptions): Promise<EvalRunResult> {
    return this.retry.execute(async () => {
      return this.fetch('/eval/run', options) as Promise<EvalRunResult>
    })
  }

  async getResult(runId: string): Promise<EvalRunResult> {
    return this.retry.execute(async () => {
      return this.fetch('/eval/results', { runId }) as Promise<EvalRunResult>
    })
  }
}
