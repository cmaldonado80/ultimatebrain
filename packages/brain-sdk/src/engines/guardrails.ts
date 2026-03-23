/**
 * Guardrails Engine — safety checks
 */

import type { RetryPolicy } from '../transport/retry'

export interface GuardrailCheckOptions {
  input: string
  agentId?: string
  rules?: string[]
}

export interface GuardrailCheckResult {
  allowed: boolean
  violations: Array<{ rule: string; severity: string; message: string }>
  checkedAt: string
}

export class GuardrailsEngine {
  constructor(
    private fetch: (path: string, body: unknown) => Promise<unknown>,
    private retry: RetryPolicy
  ) {}

  async check(options: GuardrailCheckOptions): Promise<GuardrailCheckResult> {
    return this.retry.execute(async () => {
      return this.fetch('/guardrails/check', options) as Promise<GuardrailCheckResult>
    })
  }
}
