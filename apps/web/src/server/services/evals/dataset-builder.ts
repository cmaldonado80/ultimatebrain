/**
 * Dataset Builder — Production-to-Eval Pipeline
 *
 * Converts production traces and tickets into eval datasets:
 * - Manual: "Save as eval case" from any trace in Ops Center
 * - Auto: failed tickets → negative examples, high-rated completions → positive examples
 *
 * Groups cases into named datasets (e.g. "ticket-execution", "chat-quality", "tool-use")
 */

import type { Database } from '@solarc/db'
import { evalDatasets, evalCases, traces } from '@solarc/db'
import { eq, and } from 'drizzle-orm'

export interface TraceSnapshot {
  traceId: string
  operation: string
  input: unknown
  output: unknown
  agentId?: string
  ticketId?: string
  durationMs?: number
  attributes?: Record<string, unknown>
}

export interface EvalCaseInput {
  datasetId: string
  input: Record<string, unknown>
  expectedOutput?: Record<string, unknown>
  traceId?: string
  tags?: string[]
}

export interface DatasetSummary {
  id: string
  name: string
  description: string | null
  caseCount: number
  createdAt: Date
}

export type DatasetPreset =
  | 'ticket-execution'
  | 'chat-quality'
  | 'tool-use'
  | 'guardrails'
  | 'memory-recall'
  | string

export class DatasetBuilder {
  constructor(private db: Database) {}

  // ── Dataset Management ────────────────────────────────────────────────────

  /** Create a new named dataset */
  async createDataset(name: DatasetPreset, description?: string): Promise<string> {
    const [dataset] = await this.db
      .insert(evalDatasets)
      .values({ name, description: description ?? null })
      .returning({ id: evalDatasets.id })
    return dataset.id
  }

  /** Get or create a dataset by name */
  async getOrCreateDataset(name: DatasetPreset, description?: string): Promise<string> {
    const existing = await this.db.query.evalDatasets.findFirst({
      where: eq(evalDatasets.name, name),
    })
    if (existing) return existing.id
    return this.createDataset(name, description)
  }

  /** List all datasets with case counts */
  async listDatasets(): Promise<DatasetSummary[]> {
    const datasets = await this.db.query.evalDatasets.findMany({
      orderBy: (d, { desc }) => [desc(d.createdAt)],
    })

    const summaries: DatasetSummary[] = []
    for (const dataset of datasets) {
      const cases = await this.db.query.evalCases.findMany({
        where: eq(evalCases.datasetId, dataset.id),
        columns: { id: true },
      })
      summaries.push({
        id: dataset.id,
        name: dataset.name,
        description: dataset.description,
        caseCount: cases.length,
        createdAt: dataset.createdAt,
      })
    }

    return summaries
  }

  // ── Manual Case Creation ─────────────────────────────────────────────────

  /**
   * Save a trace as an eval case ("Save as eval case" button).
   * Auto-extracts input/output from trace attributes.
   */
  async saveFromTrace(traceId: string, datasetName: DatasetPreset): Promise<string> {
    const trace = await this.db.query.traces.findFirst({
      where: eq(traces.spanId, traceId),
    })
    if (!trace) throw new Error(`Trace ${traceId} not found`)

    const attrs = (trace.attributes ?? {}) as Record<string, unknown>

    const input: Record<string, unknown> = {
      operation: trace.operation,
      prompt: attrs['llm.prompt'] ?? attrs['input'] ?? null,
      context: attrs['context'] ?? null,
      agentId: trace.agentId,
      ticketId: trace.ticketId,
    }

    const expectedOutput: Record<string, unknown> = {
      response: attrs['llm.response'] ?? attrs['output'] ?? null,
      toolCalls: attrs['tool_calls'] ?? null,
      durationMs: trace.durationMs,
      status: trace.status,
    }

    const datasetId = await this.getOrCreateDataset(datasetName)

    const [evalCase] = await this.db
      .insert(evalCases)
      .values({
        datasetId,
        input,
        expectedOutput,
        traceId,
      })
      .returning({ id: evalCases.id })

    return evalCase.id
  }

  /** Manually add an eval case to a dataset */
  async addCase(input: EvalCaseInput): Promise<string> {
    const [evalCase] = await this.db
      .insert(evalCases)
      .values({
        datasetId: input.datasetId,
        input: input.input,
        expectedOutput: input.expectedOutput ?? null,
        traceId: input.traceId ?? null,
      })
      .returning({ id: evalCases.id })

    return evalCase.id
  }

  // ── Auto-Generation ───────────────────────────────────────────────────────

  /**
   * Auto-generate eval cases from failed tickets (negative examples).
   * Pulls traces linked to failed tickets and adds them to the target dataset.
   */
  async autoGenerateFromFailedTickets(
    datasetName: DatasetPreset = 'ticket-execution',
    limit = 50
  ): Promise<number> {
    const failedTraces = await this.db.query.traces.findMany({
      where: eq(traces.status, 'error'),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit,
    })

    const datasetId = await this.getOrCreateDataset(
      datasetName,
      'Auto-generated from failed ticket traces'
    )

    let added = 0
    for (const trace of failedTraces) {
      // Skip if already in dataset
      const existing = await this.db.query.evalCases.findFirst({
        where: and(
          eq(evalCases.datasetId, datasetId),
          eq(evalCases.traceId, trace.spanId)
        ),
      })
      if (existing) continue

      const attrs = (trace.attributes ?? {}) as Record<string, unknown>

      await this.db.insert(evalCases).values({
        datasetId,
        input: {
          operation: trace.operation,
          prompt: attrs['llm.prompt'] ?? attrs['input'] ?? null,
          agentId: trace.agentId,
          ticketId: trace.ticketId,
        },
        expectedOutput: {
          response: null, // negative example — no expected output
          shouldFail: false, // we want the agent to succeed now
          originalError: attrs['error'] ?? trace.status,
        },
        traceId: trace.spanId,
      })
      added++
    }

    return added
  }

  /**
   * Auto-generate eval cases from successful/high-quality traces (positive examples).
   * Uses traces with status=ok and short latency as positive examples.
   */
  async autoGenerateFromSuccessfulTraces(
    datasetName: DatasetPreset = 'chat-quality',
    limit = 50
  ): Promise<number> {
    const goodTraces = await this.db.query.traces.findMany({
      where: eq(traces.status, 'ok'),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit,
    })

    const datasetId = await this.getOrCreateDataset(
      datasetName,
      'Auto-generated from successful traces'
    )

    let added = 0
    for (const trace of goodTraces) {
      const existing = await this.db.query.evalCases.findFirst({
        where: and(
          eq(evalCases.datasetId, datasetId),
          eq(evalCases.traceId, trace.spanId)
        ),
      })
      if (existing) continue

      const attrs = (trace.attributes ?? {}) as Record<string, unknown>

      await this.db.insert(evalCases).values({
        datasetId,
        input: {
          operation: trace.operation,
          prompt: attrs['llm.prompt'] ?? attrs['input'] ?? null,
          agentId: trace.agentId,
          ticketId: trace.ticketId,
        },
        expectedOutput: {
          response: attrs['llm.response'] ?? attrs['output'] ?? null,
          toolCalls: attrs['tool_calls'] ?? null,
          maxDurationMs: (trace.durationMs ?? 0) * 1.5, // allow 50% regression
        },
        traceId: trace.spanId,
      })
      added++
    }

    return added
  }

  /** Get all cases for a dataset */
  async getCases(datasetId: string): Promise<typeof evalCases.$inferSelect[]> {
    return this.db.query.evalCases.findMany({
      where: eq(evalCases.datasetId, datasetId),
      orderBy: (c, { asc }) => [asc(c.createdAt)],
    })
  }

  /** Delete a dataset and all its cases */
  async deleteDataset(datasetId: string): Promise<void> {
    await this.db.delete(evalCases).where(eq(evalCases.datasetId, datasetId))
    await this.db.delete(evalDatasets).where(eq(evalDatasets.id, datasetId))
  }
}
