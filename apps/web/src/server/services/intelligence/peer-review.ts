/**
 * Agent Peer Review — Agents evaluate each other's outputs before aggregation.
 *
 * Inspired by Mixture-of-Models N-way self-evaluating deliberation.
 * After MoA or panel_debate produces multiple perspectives, peer review
 * has each perspective score the others. Only high-scoring outputs
 * feed into the final aggregation.
 */

import type { GatewayRouter } from '../gateway'

// ── Types ─────────────────────────────────────────────────────────────

export interface PerspectiveOutput {
  name: string
  content: string
}

export interface PeerScore {
  reviewer: string
  reviewed: string
  score: number // 0-1
  reasoning: string
}

export interface PeerReviewResult {
  scores: PeerScore[]
  /** Outputs that passed peer review (score >= threshold) */
  approved: PerspectiveOutput[]
  /** Outputs that failed peer review */
  rejected: PerspectiveOutput[]
  /** Average score per perspective */
  averageScores: Record<string, number>
}

// ── Constants ────────────────────────────────────────────────────────

const PEER_REVIEW_PROMPT = `You are evaluating another AI's response to a question. Score it on a scale of 0.0 to 1.0 based on:
- Accuracy (are claims correct and well-reasoned?)
- Completeness (does it address all aspects?)
- Specificity (does it provide concrete details, not vague generalities?)
- Soundness (is the reasoning logically valid?)

## Question
{question}

## Response to Evaluate (by {author})
{response}

Respond with ONLY valid JSON:
{"score": 0.X, "reasoning": "brief explanation of score"}`

const DEFAULT_THRESHOLD = 0.6

// ── Peer Review Engine ──────────────────────────────────────────────

/**
 * Run N-way peer review where each perspective scores the others.
 * Returns only perspectives that meet the quality threshold.
 *
 * @param question - The original question/problem
 * @param perspectives - Array of named perspective outputs
 * @param gw - Gateway router for LLM calls
 * @param threshold - Minimum average score to pass review (default: 0.6)
 */
export async function runPeerReview(
  question: string,
  perspectives: PerspectiveOutput[],
  gw: GatewayRouter,
  threshold: number = DEFAULT_THRESHOLD,
): Promise<PeerReviewResult> {
  if (perspectives.length < 2) {
    // Not enough perspectives to peer review — pass all
    return {
      scores: [],
      approved: perspectives,
      rejected: [],
      averageScores: Object.fromEntries(perspectives.map((p) => [p.name, 1.0])),
    }
  }

  // Each perspective reviews every other perspective
  const reviewTasks: Array<{
    reviewer: string
    reviewed: string
    reviewedContent: string
  }> = []

  for (const reviewer of perspectives) {
    for (const reviewed of perspectives) {
      if (reviewer.name === reviewed.name) continue
      reviewTasks.push({
        reviewer: reviewer.name,
        reviewed: reviewed.name,
        reviewedContent: reviewed.content,
      })
    }
  }

  // Run all reviews in parallel
  const scores: PeerScore[] = []

  const reviewResults = await Promise.allSettled(
    reviewTasks.map(async (task) => {
      const prompt = PEER_REVIEW_PROMPT.replace('{question}', question)
        .replace('{author}', task.reviewed)
        .replace('{response}', task.reviewedContent.slice(0, 3000))

      const response = await gw.chat({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        maxTokens: 256,
      })

      const cleaned = response.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()

      let parsed: { score?: number; reasoning?: string }
      try {
        parsed = JSON.parse(cleaned)
      } catch {
        // LLM returned non-JSON — assign neutral score
        parsed = { score: 0.5, reasoning: 'Could not parse review response' }
      }

      return {
        reviewer: task.reviewer,
        reviewed: task.reviewed,
        score: Math.min(1, Math.max(0, Number(parsed.score) || 0.5)),
        reasoning: String(parsed.reasoning ?? ''),
      }
    }),
  )

  for (const result of reviewResults) {
    if (result.status === 'fulfilled') {
      scores.push(result.value)
    }
  }

  // Calculate average score per perspective
  const averageScores: Record<string, number> = {}
  for (const perspective of perspectives) {
    const peerScores = scores.filter((s) => s.reviewed === perspective.name)
    if (peerScores.length === 0) {
      averageScores[perspective.name] = 1.0 // No reviews — pass by default
    } else {
      averageScores[perspective.name] =
        peerScores.reduce((sum, s) => sum + s.score, 0) / peerScores.length
    }
  }

  // Split into approved and rejected
  const approved = perspectives.filter((p) => (averageScores[p.name] ?? 0) >= threshold)
  const rejected = perspectives.filter((p) => (averageScores[p.name] ?? 0) < threshold)

  // If all rejected, keep the highest-scoring one to avoid empty results
  if (approved.length === 0 && perspectives.length > 0) {
    const best = perspectives.reduce((a, b) =>
      (averageScores[a.name] ?? 0) > (averageScores[b.name] ?? 0) ? a : b,
    )
    approved.push(best)
    const rejIdx = rejected.findIndex((r) => r.name === best.name)
    if (rejIdx >= 0) rejected.splice(rejIdx, 1)
  }

  return { scores, approved, rejected, averageScores }
}
