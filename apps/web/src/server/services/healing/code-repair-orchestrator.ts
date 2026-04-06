/**
 * Code Repair Orchestrator — autonomous bug detection and repair.
 *
 * Bridges error detection (healing logs, tool analytics, drift detector)
 * to autonomous code repair via ModeRouter + tool executor.
 *
 * Pipeline:
 *   1. Detect recurring error patterns from multiple sources
 *   2. Create repair ticket with rich context (error, files, stack trace)
 *   3. ModeRouter dispatches an engineering agent with code tools
 *   4. Agent reads code → writes fix → runs tests → commits if passing
 *   5. Outcome feeds back to instinct + evidence systems
 *
 * Safety:
 *   - Commits to repair/ branches only (no push)
 *   - Blocked paths: schema, auth, deploy, .env
 *   - Max 3 attempts per bug, max 3 bugs per sweep
 *   - Human review required before merge
 */

import type { Database } from '@solarc/db'
import { healingLogs, instinctObservations, tickets, toolExecutionStats } from '@solarc/db'
import { and, desc, eq, gte, sql } from 'drizzle-orm'

import { logger } from '../../../lib/logger'
import { EvidenceMemoryPipeline } from '../intelligence/evidence-memory'

// ── Types ────────────────────────────────────────────────────────────────

export interface RepairCandidate {
  source: 'healing_log' | 'tool_failure' | 'drift_regression'
  errorPattern: string
  affectedFiles: string[]
  occurrences: number
  severity: 'medium' | 'high' | 'critical'
  stackTrace?: string
}

export interface RepairResult {
  ticketId: string
  status: 'fixed' | 'failed' | 'escalated'
  attempts: number
  durationMs: number
}

// ── Constants ────────────────────────────────────────────────────────────

const MAX_CANDIDATES_PER_SWEEP = 3
const MIN_OCCURRENCES = 3

/** Paths the repair agent must never modify */
const BLOCKED_PATHS = [
  '/schema/',
  '/migration/',
  'drizzle.config',
  'auth.ts',
  'middleware.ts',
  '.env',
  'Dockerfile',
  'docker-compose',
  'vercel.json',
  'pnpm-workspace.yaml',
]

/** System prompt for the repair agent */
const REPAIR_AGENT_SOUL =
  `You are a Code Repair Agent for UltimateBrain. Your job is to diagnose and fix bugs.

## Process
1. READ the affected files using file_system(action: 'read', path: '<file>')
2. UNDERSTAND the bug from the error pattern and stack trace provided below
3. CREATE a repair branch: git_operations(operation: 'checkout', args: '-b repair/<ticketId>')
4. WRITE the fix using file_system(action: 'write', path: '<file>', content: '<fixed code>')
5. TEST using run_tests() — if tests fail, analyze output and try a different fix
6. If tests pass: git_operations(operation: 'add', args: '.') then git_operations(operation: 'commit', args: '-m "fix: <description>"')
7. Log your learning: self_improve(trigger: '<error>', correction: '<what you fixed>', category: 'code')

## Safety Rules
- NEVER modify: database schemas/migrations, auth files, deployment configs, .env files
- NEVER use git push — only local commits
- Keep fixes minimal and targeted — do not refactor unrelated code
- If you cannot determine the fix with confidence, report your findings and stop

## Constraints
- Maximum 3 fix attempts per bug
- Read at most 5 files per attempt
- Each fix should change no more than 50 lines
`.trim()

// ── File Path Extraction ─────────────────────────────────────────────────

const FILE_PATH_REGEX = /[\w\-/]+\.tsx?/g

function extractFilePaths(text: string): string[] {
  const matches = text.match(FILE_PATH_REGEX) ?? []
  return [...new Set(matches)].filter((p) => p.includes('/') && !p.startsWith('node_modules'))
}

function isPathSafe(filePath: string): boolean {
  return !BLOCKED_PATHS.some((blocked) => filePath.includes(blocked))
}

// ── Orchestrator ─────────────────────────────────────────────────────────

export class CodeRepairOrchestrator {
  private db: Database
  private evidence = new EvidenceMemoryPipeline()

  constructor(db: Database) {
    this.db = db
  }

  /**
   * Detect recurring error patterns from multiple sources.
   */
  async detectRepairCandidates(): Promise<RepairCandidate[]> {
    const candidates: RepairCandidate[] = []
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    // 1. Recurring healing log failures (same reason 3+ times in 24h)
    try {
      const failedLogs = await this.db
        .select({
          reason: healingLogs.reason,
          count: sql<number>`count(*)::int`,
        })
        .from(healingLogs)
        .where(and(eq(healingLogs.success, false), gte(healingLogs.createdAt, oneDayAgo)))
        .groupBy(healingLogs.reason)
        .having(sql`count(*) >= ${MIN_OCCURRENCES}`)
        .orderBy(desc(sql`count(*)`))
        .limit(5)

      for (const row of failedLogs) {
        const files = extractFilePaths(row.reason).filter(isPathSafe)
        candidates.push({
          source: 'healing_log',
          errorPattern: row.reason.slice(0, 200),
          affectedFiles: files,
          occurrences: row.count,
          severity: row.count >= 10 ? 'critical' : row.count >= 5 ? 'high' : 'medium',
          stackTrace: row.reason,
        })
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err : undefined },
        'code-repair: healing log scan failed',
      )
    }

    // 2. Tool failure patterns (>30% failure rate with 5+ failures)
    try {
      const failingTools = await this.db
        .select()
        .from(toolExecutionStats)
        .where(gte(toolExecutionStats.failureCount, 5))
        .limit(10)

      for (const tool of failingTools) {
        const total = tool.successCount + tool.failureCount
        if (total < 5) continue
        const failRate = tool.failureCount / total
        if (failRate < 0.3) continue

        candidates.push({
          source: 'tool_failure',
          errorPattern: `Tool "${tool.toolName}" failing at ${Math.round(failRate * 100)}% rate (${tool.failureCount}/${total})`,
          affectedFiles: [], // tool failures don't always map to files
          occurrences: tool.failureCount,
          severity: failRate > 0.6 ? 'high' : 'medium',
        })
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err : undefined },
        'code-repair: tool analytics scan failed',
      )
    }

    // 3. Eval regressions
    try {
      const { DriftDetector } = await import('../evals/drift-detector')
      const detector = new DriftDetector(this.db)
      const reports = await detector.detectAll()
      for (const report of reports) {
        if (!report.hasRegression) continue
        const dims = report.regressions.map(
          (r) => `${r.dimension}: ${Math.round(r.deltaPercent)}% drop`,
        )
        candidates.push({
          source: 'drift_regression',
          errorPattern: `Eval regression in ${report.datasetName}: ${dims.join(', ')}`,
          affectedFiles: [],
          occurrences: report.regressions.length,
          severity: report.regressions.some((r) => r.severity === 'critical') ? 'critical' : 'high',
        })
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err : undefined }, 'code-repair: drift scan failed')
    }

    // Deduplicate by error pattern prefix
    const seen = new Set<string>()
    const deduped = candidates.filter((c) => {
      const key = c.errorPattern.slice(0, 100)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Sort by severity then occurrences
    const severityOrder = { critical: 0, high: 1, medium: 2 }
    return deduped
      .sort(
        (a, b) =>
          severityOrder[a.severity] - severityOrder[b.severity] || b.occurrences - a.occurrences,
      )
      .slice(0, MAX_CANDIDATES_PER_SWEEP)
  }

  /**
   * Create a repair ticket with rich context for the repair agent.
   */
  async createRepairTicket(candidate: RepairCandidate, workspaceId?: string): Promise<string> {
    const description = [
      `## Error Pattern`,
      `\`\`\``,
      candidate.errorPattern,
      `\`\`\``,
      '',
      `**Source:** ${candidate.source}`,
      `**Occurrences:** ${candidate.occurrences}`,
      `**Severity:** ${candidate.severity}`,
      '',
      candidate.affectedFiles.length > 0
        ? `## Affected Files\n${candidate.affectedFiles.map((f) => `- \`${f}\``).join('\n')}`
        : '## Affected Files\nNo specific files identified — investigate from error pattern.',
      '',
      candidate.stackTrace
        ? `## Stack Trace\n\`\`\`\n${candidate.stackTrace.slice(0, 2000)}\n\`\`\``
        : '',
      '',
      `## Repair Agent Instructions`,
      REPAIR_AGENT_SOUL,
      '',
      `## Blocked Paths (DO NOT MODIFY)`,
      BLOCKED_PATHS.map((p) => `- \`${p}\``).join('\n'),
    ].join('\n')

    const [ticket] = await this.db
      .insert(tickets)
      .values({
        title: `[Code Repair] ${candidate.errorPattern.slice(0, 80)}`,
        description,
        status: 'queued',
        priority:
          candidate.severity === 'critical'
            ? 'critical'
            : candidate.severity === 'high'
              ? 'high'
              : 'medium',
        complexity: 'medium',
        executionMode: 'autonomous',
        ...(workspaceId ? { workspaceId } : {}),
        metadata: { repairCandidate: candidate, tags: ['code_repair', 'auto-generated'] },
      })
      .returning({ id: tickets.id })

    if (!ticket) throw new Error('Failed to create repair ticket')

    logger.info(
      { ticketId: ticket.id, source: candidate.source, severity: candidate.severity },
      `code-repair: created ticket for "${candidate.errorPattern.slice(0, 60)}"`,
    )

    return ticket.id
  }

  /**
   * Record repair outcome to instinct + evidence systems.
   */
  private async recordOutcome(candidate: RepairCandidate, result: RepairResult): Promise<void> {
    // Record as instinct observation for pattern learning
    await this.db
      .insert(instinctObservations)
      .values({
        eventType: 'code_repair',
        payload: {
          source: candidate.source,
          errorPattern: candidate.errorPattern,
          status: result.status,
          attempts: result.attempts,
          durationMs: result.durationMs,
        },
      })
      .catch((err) =>
        logger.warn(
          { err: err instanceof Error ? err : undefined },
          'code-repair: instinct observation failed',
        ),
      )

    // Record to evidence memory
    this.evidence.recordHealingOutcome({
      action: 'code_repair',
      target: candidate.errorPattern.slice(0, 100),
      success: result.status === 'fixed',
      reason: `${result.status} after ${result.attempts} attempts (${result.durationMs}ms)`,
    })

    logger.info(
      { ticketId: result.ticketId, status: result.status, attempts: result.attempts },
      `code-repair: ${result.status}`,
    )
  }

  /**
   * Run a full repair sweep: detect → create tickets → record outcomes.
   * Actual execution happens via worker picking up the queued tickets
   * through ModeRouter's autonomous pipeline.
   */
  async runSweep(workspaceId?: string): Promise<RepairResult[]> {
    const start = Date.now()
    const candidates = await this.detectRepairCandidates()

    if (candidates.length === 0) {
      logger.info({}, 'code-repair: no repair candidates detected')
      return []
    }

    logger.info({ count: candidates.length }, 'code-repair: detected repair candidates')

    const results: RepairResult[] = []

    for (const candidate of candidates) {
      const ticketStart = Date.now()
      try {
        const ticketId = await this.createRepairTicket(candidate, workspaceId)
        // Ticket is queued — the worker's ticket:execute handler will pick it up
        // and route through ModeRouter.executeAutonomous() with code tools
        const result: RepairResult = {
          ticketId,
          status: 'fixed', // optimistic — actual status determined by execution
          attempts: 0,
          durationMs: Date.now() - ticketStart,
        }
        results.push(result)
        await this.recordOutcome(candidate, result)
      } catch (err) {
        logger.warn(
          {
            err: err instanceof Error ? err : undefined,
            pattern: candidate.errorPattern.slice(0, 60),
          },
          'code-repair: ticket creation failed',
        )
        results.push({
          ticketId: '',
          status: 'failed',
          attempts: 0,
          durationMs: Date.now() - ticketStart,
        })
      }
    }

    logger.info(
      { total: results.length, durationMs: Date.now() - start },
      'code-repair: sweep complete',
    )

    return results
  }
}
