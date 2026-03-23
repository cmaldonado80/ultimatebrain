#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * CI Eval Runner
 *
 * Runs the full eval suite against the configured database and exits
 * non-zero if any dataset shows a regression above threshold.
 *
 * Usage:
 *   pnpm tsx scripts/run-evals.ts
 *   pnpm tsx scripts/run-evals.ts --dataset ticket-execution
 *   pnpm tsx scripts/run-evals.ts --threshold 0.03
 *
 * GitHub Actions usage:
 *   - on: push / pull_request paths: ['apps/web/src/server/services/**', 'apps/worker/src/**']
 *   - runs: pnpm tsx scripts/run-evals.ts
 *   - fails PR if exit code != 0
 */

import type { Database } from '@solarc/db'
import { DriftDetector } from '../apps/web/src/server/services/evals/drift-detector'
import { DatasetBuilder } from '../apps/web/src/server/services/evals/dataset-builder'

// ── CLI Args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

function getArg(flag: string): string | null {
  const idx = args.indexOf(flag)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null
}

const DATASET_FILTER = getArg('--dataset')
const THRESHOLD = parseFloat(getArg('--threshold') ?? '0.05')
const VERBOSE = args.includes('--verbose') || args.includes('-v')

// ── DB Setup ──────────────────────────────────────────────────────────────

async function getDb() {
  // Dynamic import so we don't break if DB isn't available in test envs
  const { drizzle } = await import('drizzle-orm/postgres-js')
  const { default: postgres } = await import('postgres')
  const { schema } = await import('../packages/db/src')

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  const client = postgres(connectionString, { max: 1 })
  return drizzle(client, { schema })
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('🧪 UltimateBrain Eval Runner')
  console.log(`   Threshold: >${(THRESHOLD * 100).toFixed(0)}% regression triggers failure`)
  if (DATASET_FILTER) console.log(`   Filter: ${DATASET_FILTER}`)
  console.log()

  let db: Database
  try {
    db = await getDb() as Database
  } catch (err) {
    console.error('❌ Failed to connect to database:', err)
    process.exit(1)
  }

  const detector = new DriftDetector(db, THRESHOLD)
  const builder = new DatasetBuilder(db)

  // List datasets
  const datasets = await builder.listDatasets()
  const filtered = DATASET_FILTER
    ? datasets.filter((d) => d.name === DATASET_FILTER)
    : datasets

  if (filtered.length === 0) {
    console.warn('⚠️  No datasets found. Run some evals first.')
    process.exit(0)
  }

  console.log(`📊 Found ${filtered.length} dataset(s):\n`)
  for (const d of filtered) {
    console.log(`  • ${d.name} (${d.caseCount} cases)`)
  }
  console.log()

  // Detect regressions
  let totalRegressions = 0
  let hasCritical = false

  for (const dataset of filtered) {
    const report = await detector.detectForDataset(dataset.id)
    if (!report) {
      console.log(`  ${dataset.name}: no runs found, skipping`)
      continue
    }

    if (!report.hasRegression) {
      console.log(`  ✅ ${dataset.name}: no regressions`)
      if (VERBOSE) {
        for (const [dim, score] of Object.entries(report.currentScores)) {
          console.log(`     ${dim}: ${((score as number) * 100).toFixed(1)}%`)
        }
      }
      continue
    }

    console.log(`  ⚠️  ${dataset.name}: ${report.regressions.length} regression(s)`)
    for (const reg of report.regressions) {
      const arrow = reg.deltaPercent < 0 ? '↓' : '↑'
      const severity = reg.severity === 'critical' ? '🔴' : '🟡'
      console.log(
        `     ${severity} ${reg.dimension}: ${(reg.previousScore * 100).toFixed(1)}% → ${(reg.currentScore * 100).toFixed(1)}% (${arrow}${Math.abs(reg.deltaPercent).toFixed(1)}%)`
      )
      if (reg.severity === 'critical') hasCritical = true
    }

    totalRegressions += report.regressions.length
  }

  console.log()

  if (totalRegressions === 0) {
    console.log('✅ All evals passed. No regressions detected.')
    process.exit(0)
  } else {
    console.error(
      `❌ ${totalRegressions} regression(s) detected across ${filtered.length} dataset(s).`
    )
    if (hasCritical) {
      console.error('   Critical regressions present — failing build.')
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
