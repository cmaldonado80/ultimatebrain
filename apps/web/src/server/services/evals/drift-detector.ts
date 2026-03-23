/**
 * Drift Detector — Automated Eval Regression Detection
 *
 * Runs the full eval suite on a schedule (daily cron).
 * Compares scores against the previous run — alerts on >5% regression.
 * Alert channels: Ops Center notification + OpenClaw (Telegram/Slack).
 */

import type { Database } from '@solarc/db'
import { evalDatasets, evalRuns } from '@solarc/db'
import { eq } from 'drizzle-orm'
import type { EvalScores } from '@solarc/engine-contracts'
import { WebhookService } from '../integrations/integrations-service'

export interface DriftReport {
  datasetId: string
  datasetName: string
  currentRunId: string
  previousRunId: string | null
  currentScores: EvalScores
  previousScores: EvalScores | null
  regressions: RegressionDetail[]
  hasRegression: boolean
  regressionThreshold: number
  checkedAt: Date
}

export interface RegressionDetail {
  dimension: keyof EvalScores
  previousScore: number
  currentScore: number
  delta: number
  deltaPercent: number
  severity: 'warning' | 'critical'
}

export interface DriftAlert {
  datasetId: string
  datasetName: string
  regressions: RegressionDetail[]
  message: string
  severity: 'warning' | 'critical'
  timestamp: Date
}

/** Regression threshold: alert if score drops by more than this fraction */
const DEFAULT_REGRESSION_THRESHOLD = 0.05

export class DriftDetector {
  constructor(
    private db: Database,
    private regressionThreshold = DEFAULT_REGRESSION_THRESHOLD
  ) {}

  /**
   * Check all datasets for score regression vs. their previous run.
   * Intended to be called by a daily cron job.
   */
  async detectAll(): Promise<DriftReport[]> {
    const datasets = await this.db.query.evalDatasets.findMany({ limit: 100 })
    const reports: DriftReport[] = []

    for (const dataset of datasets) {
      const report = await this.detectForDataset(dataset.id)
      if (report) reports.push(report)
    }

    return reports
  }

  /**
   * Check a specific dataset for regression.
   */
  async detectForDataset(datasetId: string): Promise<DriftReport | null> {
    const dataset = await this.db.query.evalDatasets.findFirst({
      where: eq(evalDatasets.id, datasetId),
    })
    if (!dataset) return null

    // Get the two most recent runs for this dataset
    const recentRuns = await this.db.query.evalRuns.findMany({
      where: eq(evalRuns.datasetId, datasetId),
      orderBy: (r, { desc }) => [desc(r.createdAt)],
      limit: 2,
    })

    if (recentRuns.length === 0) return null

    const currentRun = recentRuns[0]
    const previousRun = recentRuns[1] ?? null

    const currentScores = (currentRun.scores ?? {}) as EvalScores
    const previousScores = previousRun ? ((previousRun.scores ?? {}) as EvalScores) : null

    const regressions = this.computeRegressions(currentScores, previousScores)

    return {
      datasetId,
      datasetName: dataset.name,
      currentRunId: currentRun.id,
      previousRunId: previousRun?.id ?? null,
      currentScores,
      previousScores,
      regressions,
      hasRegression: regressions.length > 0,
      regressionThreshold: this.regressionThreshold,
      checkedAt: new Date(),
    }
  }

  /**
   * Generate alert objects for reports with regressions.
   */
  async buildAlerts(reports: DriftReport[]): Promise<DriftAlert[]> {
    return reports
      .filter((r) => r.hasRegression)
      .map((r) => {
        const maxSeverity = r.regressions.some((reg) => reg.severity === 'critical')
          ? 'critical'
          : 'warning'

        const lines = r.regressions.map(
          (reg) =>
            `  • ${reg.dimension}: ${(reg.previousScore * 100).toFixed(1)}% → ${(reg.currentScore * 100).toFixed(1)}% (${reg.deltaPercent > 0 ? '+' : ''}${reg.deltaPercent.toFixed(1)}%)`
        )

        const message = [
          `⚠️ Eval regression detected in dataset "${r.datasetName}":`,
          ...lines,
          `Threshold: >${(this.regressionThreshold * 100).toFixed(0)}% drop`,
        ].join('\n')

        return {
          datasetId: r.datasetId,
          datasetName: r.datasetName,
          regressions: r.regressions,
          message,
          severity: maxSeverity,
          timestamp: r.checkedAt,
        }
      })
  }

  /**
   * Dispatch alerts to configured channels.
   * Real impl calls OpenClaw channel adapter for Telegram/Slack.
   */
  async dispatchAlerts(alerts: DriftAlert[]): Promise<void> {
    const webhookService = new WebhookService(this.db)
    for (const alert of alerts) {
      // Ops Center notification (stored as trace attribute for now)
      console.warn(`[DriftDetector] ${alert.severity.toUpperCase()}: ${alert.message}`)

      try {
        await webhookService.dispatch({ type: 'drift_alert', payload: alert })
      } catch (err) {
        console.warn(`[DriftDetector] Failed to dispatch webhook for "${alert.datasetName}":`, err)
      }
    }
  }

  /**
   * Full pipeline: detect → build alerts → dispatch.
   * Call this from the daily cron job.
   */
  async runDailyCheck(): Promise<{ reports: DriftReport[]; alerts: DriftAlert[] }> {
    const reports = await this.detectAll()
    const alerts = await this.buildAlerts(reports)
    await this.dispatchAlerts(alerts)
    return { reports, alerts }
  }

  /**
   * Get regression history for a dataset (last N runs).
   */
  async getHistory(
    datasetId: string,
    limit = 30
  ): Promise<{ runId: string; version: string | null; scores: EvalScores; createdAt: Date }[]> {
    const runs = await this.db.query.evalRuns.findMany({
      where: eq(evalRuns.datasetId, datasetId),
      orderBy: (r, { asc }) => [asc(r.createdAt)],
      limit,
    })

    return runs.map((r) => ({
      runId: r.id,
      version: r.version,
      scores: (r.scores ?? {}) as EvalScores,
      createdAt: r.createdAt,
    }))
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private computeRegressions(
    current: EvalScores,
    previous: EvalScores | null
  ): RegressionDetail[] {
    if (!previous) return []

    const regressions: RegressionDetail[] = []
    const dimensions: (keyof EvalScores)[] = [
      'taskCompletion',
      'factuality',
      'toolUseAccuracy',
      'safety',
      'costEfficiency',
    ]

    for (const dim of dimensions) {
      const prev = previous[dim] ?? 0
      const curr = current[dim] ?? 0

      if (prev === 0) continue

      const delta = curr - prev
      const deltaPercent = (delta / prev) * 100

      // Regression = score dropped by more than threshold (percentage-based)
      if (delta < 0 && Math.abs(deltaPercent) > this.regressionThreshold * 100) {
        regressions.push({
          dimension: dim,
          previousScore: prev,
          currentScore: curr,
          delta,
          deltaPercent,
          severity: Math.abs(deltaPercent) > this.regressionThreshold * 2 * 100 ? 'critical' : 'warning',
        })
      }
    }

    return regressions
  }
}
