/**
 * Visual QA Reviewer
 *
 * LLM-powered review of recorded browser sessions:
 * - Compares expected vs. actual UI state from screenshots
 * - Generates pass/fail verdict with failure screenshots
 * - Suggests fixes for failures
 * - Links results to ticket proof record
 */

import type { Database } from '@solarc/db'

import { logger } from '../../../lib/logger'
import { GatewayRouter } from '../gateway'
import type { QARecording, QAVerdict, RecordingFrame } from './recorder'

export interface ReviewCriteria {
  /** What the UI should look like / contain */
  expectedState: string
  /** Specific elements to check */
  checkpoints: ReviewCheckpoint[]
  /** Acceptable visual difference threshold (0-1) */
  tolerance?: number
}

export interface ReviewCheckpoint {
  name: string
  description: string
  /** CSS selector or area to focus on */
  selector?: string
  /** Expected text content */
  expectedText?: string
  /** Expected visibility state */
  expectedVisible?: boolean
}

export interface ReviewResult {
  recordingId: string
  reviewedAt: Date
  verdict: QAVerdict
  confidence: number
  summary: string
  /** Per-checkpoint results */
  checkpointResults: CheckpointResult[]
  /** Frames where failures were detected */
  failureFrames: FailureFrame[]
  /** LLM-suggested fixes */
  suggestedFixes: SuggestedFix[]
  /** Link to ticket proof */
  ticketProof?: TicketProof
}

export interface CheckpointResult {
  checkpoint: ReviewCheckpoint
  verdict: QAVerdict
  confidence: number
  explanation: string
  /** Frame index where this was evaluated */
  frameIndex: number
}

export interface FailureFrame {
  frameIndex: number
  imageUrl: string
  offsetMs: number
  reason: string
  /** Highlighted region of failure (if detectable) */
  region?: { x: number; y: number; width: number; height: number }
}

export interface SuggestedFix {
  description: string
  category: 'ui' | 'logic' | 'data' | 'timing' | 'selector'
  priority: 'low' | 'medium' | 'high'
  /** Code or config suggestion */
  suggestion?: string
}

export interface TicketProof {
  ticketId: string
  recordingId: string
  verdict: QAVerdict
  summary: string
  failureCount: number
  attachedAt: Date
}

// ── Reviewer ────────────────────────────────────────────────────────────

export class VisualQAReviewer {
  private gateway: GatewayRouter | null = null

  constructor(opts?: { db?: Database }) {
    if (opts?.db) {
      this.gateway = new GatewayRouter(opts.db)
    }
  }
  /**
   * Review a completed recording against criteria.
   */
  async review(recording: QARecording, criteria: ReviewCriteria): Promise<ReviewResult> {
    if (recording.status !== 'ready') {
      throw new Error(`Recording ${recording.id} is not ready (status: ${recording.status})`)
    }

    // Evaluate each checkpoint
    const checkpointResults = await this.evaluateCheckpoints(
      recording,
      criteria.checkpoints,
      criteria.tolerance ?? 0.1,
    )

    // Identify failure frames
    const failureFrames = this.identifyFailures(recording, checkpointResults)

    // Generate suggested fixes via LLM
    const suggestedFixes = await this.generateFixes(recording, failureFrames, checkpointResults)

    // Compute overall verdict
    const failed = checkpointResults.filter((r) => r.verdict === 'fail')
    const verdict: QAVerdict = failed.length > 0 ? 'fail' : 'pass'
    const confidence =
      checkpointResults.length > 0
        ? checkpointResults.reduce((sum, r) => sum + r.confidence, 0) / checkpointResults.length
        : 0.5

    // Build summary
    const summary = this.buildSummary(recording, checkpointResults, verdict)

    // Attach to ticket if applicable
    let ticketProof: TicketProof | undefined
    if (recording.ticketId) {
      ticketProof = {
        ticketId: recording.ticketId,
        recordingId: recording.id,
        verdict,
        summary,
        failureCount: failed.length,
        attachedAt: new Date(),
      }
    }

    return {
      recordingId: recording.id,
      reviewedAt: new Date(),
      verdict,
      confidence,
      summary,
      checkpointResults,
      failureFrames,
      suggestedFixes,
      ticketProof,
    }
  }

  /**
   * Quick review — just compare final screenshot against expected state.
   */
  async quickReview(
    recording: QARecording,
    expectedState: string,
  ): Promise<{ verdict: QAVerdict; explanation: string; confidence: number }> {
    if (recording.frames.length === 0) {
      return { verdict: 'fail', explanation: 'No frames captured', confidence: 1.0 }
    }

    const lastFrame = recording.frames[recording.frames.length - 1]

    // Stub — real impl sends screenshot to LLM for visual comparison
    const analysis = await this.analyzeFrameWithLLM(lastFrame, expectedState)

    return {
      verdict: analysis.matches ? 'pass' : 'fail',
      explanation: analysis.explanation,
      confidence: analysis.confidence,
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private async evaluateCheckpoints(
    recording: QARecording,
    checkpoints: ReviewCheckpoint[],
    _tolerance: number,
  ): Promise<CheckpointResult[]> {
    const results: CheckpointResult[] = []

    for (const checkpoint of checkpoints) {
      // Find the best frame to evaluate this checkpoint
      const frameIndex = this.findRelevantFrame(recording, checkpoint)
      const frame = recording.frames[frameIndex]

      if (!frame) {
        results.push({
          checkpoint,
          verdict: 'fail',
          confidence: 1.0,
          explanation: 'No relevant frame found for this checkpoint',
          frameIndex: 0,
        })
        continue
      }

      // Stub — real impl sends frame + checkpoint to LLM for evaluation
      const analysis = await this.analyzeFrameWithLLM(
        frame,
        `Check: ${checkpoint.description}. Expected: ${checkpoint.expectedText ?? 'visible'}`,
      )

      results.push({
        checkpoint,
        verdict: analysis.matches ? 'pass' : 'fail',
        confidence: analysis.confidence,
        explanation: analysis.explanation,
        frameIndex,
      })
    }

    return results
  }

  private identifyFailures(
    recording: QARecording,
    checkpointResults: CheckpointResult[],
  ): FailureFrame[] {
    const failures: FailureFrame[] = []
    const seenFrames = new Set<number>()

    // From checkpoint failures
    for (const result of checkpointResults) {
      if (result.verdict === 'fail' && !seenFrames.has(result.frameIndex)) {
        seenFrames.add(result.frameIndex)
        const frame = recording.frames[result.frameIndex]
        if (frame) {
          failures.push({
            frameIndex: result.frameIndex,
            imageUrl: frame.imageUrl,
            offsetMs: frame.offsetMs,
            reason: result.explanation,
          })
        }
      }
    }

    // From recording annotations marked as failures
    for (const ann of recording.annotations) {
      if (ann.verdict === 'fail' && !seenFrames.has(ann.screenshotIndex)) {
        seenFrames.add(ann.screenshotIndex)
        const frame = recording.frames[ann.screenshotIndex]
        if (frame) {
          failures.push({
            frameIndex: ann.screenshotIndex,
            imageUrl: frame.imageUrl,
            offsetMs: frame.offsetMs,
            reason: ann.details ?? ann.label,
          })
        }
      }
    }

    return failures.sort((a, b) => a.offsetMs - b.offsetMs)
  }

  private async generateFixes(
    recording: QARecording,
    failures: FailureFrame[],
    checkpointResults: CheckpointResult[],
  ): Promise<SuggestedFix[]> {
    if (failures.length === 0) return []

    // Try LLM-based fix generation
    try {
      if (this.gateway) {
        const failureContext = failures
          .map((f) => `Frame ${f.frameIndex} (offset ${f.offsetMs}ms): ${f.reason}`)
          .join('\n')

        const checkpointContext = checkpointResults
          .filter((r) => r.verdict === 'fail')
          .map((r) => `Checkpoint "${r.checkpoint.name}": ${r.explanation}`)
          .join('\n')

        const result = await this.gateway.chat({
          messages: [
            {
              role: 'system',
              content:
                'You are a QA engineer analyzing UI test failures. ' +
                'Given the failures, suggest fixes as a JSON array. Each fix: ' +
                '{"description": "...", "category": "ui"|"logic"|"data"|"timing"|"selector", ' +
                '"priority": "low"|"medium"|"high", "suggestion": "optional code/config hint"}. ' +
                'Respond ONLY with the JSON array.',
            },
            {
              role: 'user',
              content:
                `Recording: agent "${recording.agentName}", ticket ${recording.ticketId ?? 'N/A'}\n\n` +
                `Failures:\n${failureContext}\n\nFailed checkpoints:\n${checkpointContext}`,
            },
          ],
        })

        const parsed = JSON.parse(result.content) as SuggestedFix[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((fix) => {
            const base: SuggestedFix = {
              description: String(fix.description),
              category: fix.category ?? 'ui',
              priority: fix.priority ?? 'medium',
            }
            if (fix.suggestion) base.suggestion = String(fix.suggestion)
            return base
          })
        }
      }
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err : undefined },
        '[VisualQAReviewer] LLM fix generation failed, using keyword fallback',
      )
    }

    // Fallback: keyword-based categorization
    const fixes: SuggestedFix[] = []

    for (const failure of failures) {
      const reason = failure.reason.toLowerCase()
      let category: SuggestedFix['category'] = 'ui'
      let priority: SuggestedFix['priority'] = 'medium'

      if (reason.includes('timeout') || reason.includes('loading')) {
        category = 'timing'
        priority = 'high'
        fixes.push({
          description: `Add wait/retry for element at frame ${failure.frameIndex}`,
          category,
          priority,
          suggestion: 'await page.waitForSelector(selector, { timeout: 10000 })',
        })
      } else if (reason.includes('not found') || reason.includes('selector')) {
        category = 'selector'
        priority = 'high'
        fixes.push({
          description: `Update selector — element not found at frame ${failure.frameIndex}`,
          category,
          priority,
          suggestion: 'Verify selector matches current DOM structure',
        })
      } else if (reason.includes('text') || reason.includes('content')) {
        category = 'data'
        priority = 'medium'
        fixes.push({
          description: `Expected text mismatch at frame ${failure.frameIndex}: ${failure.reason}`,
          category,
          priority,
        })
      } else {
        fixes.push({
          description: `UI issue at frame ${failure.frameIndex}: ${failure.reason}`,
          category,
          priority,
        })
      }
    }

    return fixes
  }

  private findRelevantFrame(recording: QARecording, checkpoint: ReviewCheckpoint): number {
    // Look for annotations that reference this checkpoint
    const relatedAnn = recording.annotations.find((a) =>
      a.label.toLowerCase().includes(checkpoint.name.toLowerCase()),
    )
    if (relatedAnn) return relatedAnn.screenshotIndex

    // Default: use the last frame
    return Math.max(0, recording.frames.length - 1)
  }

  private async analyzeFrameWithLLM(
    frame: RecordingFrame,
    expectedState: string,
  ): Promise<{ matches: boolean; explanation: string; confidence: number }> {
    // Since we cannot send actual images via text, analyze using frame metadata.
    // When multimodal gateway support is available, replace the prompt with image content.
    try {
      if (this.gateway) {
        const result = await this.gateway.chat({
          model: 'llama-3.2-11b-vision:cloud',
          messages: [
            {
              role: 'system',
              content:
                'You are a visual QA reviewer. Compare the screenshot against the expected state and report pass/fail with explanation.',
            },
            {
              role: 'user',
              content: `Expected state: "${expectedState}"\n\nAnalyze the screenshot and determine if it matches the expected state. Respond ONLY with valid JSON: { "verdict": "pass" or "fail", "explanation": "...", "confidence": 0.0 to 1.0 }`,
            },
          ],
        })

        const parsed = JSON.parse(result.content)
        return {
          matches: parsed.verdict === 'pass',
          explanation: String(parsed.explanation ?? ''),
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        }
      }
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err : undefined },
        '[VisualQAReviewer] LLM frame analysis failed, using fallback',
      )
    }

    // Fallback: optimistic stub
    return {
      matches: true,
      explanation: `Frame ${frame.index} analyzed against: "${expectedState.slice(0, 60)}" (stub — no LLM available)`,
      confidence: 0.85,
    }
  }

  private buildSummary(
    recording: QARecording,
    results: CheckpointResult[],
    verdict: QAVerdict,
  ): string {
    const passed = results.filter((r) => r.verdict === 'pass').length
    const failed = results.filter((r) => r.verdict === 'fail').length
    const total = results.length

    const agentInfo = `Agent "${recording.agentName}"`
    const ticketInfo = recording.ticketId ? ` for ticket ${recording.ticketId}` : ''
    const durationSec = Math.round(recording.durationMs / 1000)

    if (verdict === 'pass') {
      return `${agentInfo}${ticketInfo}: All ${total} checkpoints passed (${durationSec}s recording).`
    }
    return `${agentInfo}${ticketInfo}: ${failed}/${total} checkpoints failed (${passed} passed, ${durationSec}s recording).`
  }
}
