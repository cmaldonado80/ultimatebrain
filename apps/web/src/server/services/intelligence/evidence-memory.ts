/**
 * Evidence-Driven Memory Pipeline
 *
 * Automatically writes to memory from validated system outcomes.
 * Memory should be updated from meaningful events, not raw chat:
 *   - Healing outcomes (resolved incidents, recovery successes)
 *   - Verification results (passed/failed must_haves)
 *   - Ticket completions (what was done, what worked)
 *   - Instinct promotions (patterns that reached high confidence)
 *
 * This closes the feedback loop: system acts → outcomes validated →
 * knowledge persists → future decisions are better informed.
 */

// ── Types ────────────────────────────────────────────────────────────────

export type EvidenceSource =
  | 'healing'
  | 'verification'
  | 'ticket'
  | 'instinct'
  | 'incident'
  | 'operator'

export type MemoryTierExtended = 'critical' | 'core' | 'recall' | 'archival'

export interface EvidenceRecord {
  source: EvidenceSource
  key: string
  content: string
  tier: MemoryTierExtended
  confidence: number
  agentId?: string
  workspaceId?: string
  timestamp: number
}

export interface MemoryInfluence {
  used: boolean
  influenceLevel: 'none' | 'low' | 'medium' | 'high'
  memoryCount: number
  memoryTiers: string[]
  truthSnapshotsUsed: string[]
  explanation: string
}

// ── Pipeline ─────────────────────────────────────────────────────────────

const MAX_EVIDENCE_LOG = 200

export class EvidenceMemoryPipeline {
  private evidenceLog: EvidenceRecord[] = []
  private writeQueue: EvidenceRecord[] = []

  /**
   * Record a healing outcome as memory.
   */
  recordHealingOutcome(outcome: {
    action: string
    target: string
    success: boolean
    reason: string
  }): EvidenceRecord {
    const record: EvidenceRecord = {
      source: 'healing',
      key: `healing:${outcome.action}:${outcome.target}`,
      content: `Healing action "${outcome.action}" on ${outcome.target}: ${outcome.success ? 'SUCCESS' : 'FAILED'}. ${outcome.reason}`,
      tier: outcome.success ? 'recall' : 'core', // failures are more important to remember
      confidence: outcome.success ? 0.7 : 0.9,
      timestamp: Date.now(),
    }
    this.enqueue(record)
    return record
  }

  /**
   * Record a work verification result as memory.
   */
  recordVerification(result: {
    passed: boolean
    score: number
    summary: string
    agentId?: string
  }): EvidenceRecord {
    const record: EvidenceRecord = {
      source: 'verification',
      key: `verify:${Date.now()}`,
      content: `Work verification ${result.passed ? 'PASSED' : 'FAILED'} (score: ${result.score.toFixed(2)}). ${result.summary}`,
      tier: result.passed ? 'recall' : 'core',
      confidence: result.score,
      agentId: result.agentId,
      timestamp: Date.now(),
    }
    this.enqueue(record)
    return record
  }

  /**
   * Record a ticket completion as memory.
   */
  recordTicketCompletion(ticket: {
    title: string
    summary: string
    agentId?: string
    workspaceId?: string
  }): EvidenceRecord {
    const record: EvidenceRecord = {
      source: 'ticket',
      key: `ticket:${ticket.title.slice(0, 50)}`,
      content: `Completed: ${ticket.title}. ${ticket.summary}`,
      tier: 'recall',
      confidence: 0.8,
      agentId: ticket.agentId,
      workspaceId: ticket.workspaceId,
      timestamp: Date.now(),
    }
    this.enqueue(record)
    return record
  }

  /**
   * Record a promoted instinct as core memory.
   */
  recordInstinctPromotion(instinct: {
    trigger: string
    action: string
    confidence: number
  }): EvidenceRecord {
    const record: EvidenceRecord = {
      source: 'instinct',
      key: `instinct:${instinct.trigger.slice(0, 50)}`,
      content: `Learned pattern: When "${instinct.trigger}" → "${instinct.action}" (confidence: ${instinct.confidence.toFixed(2)})`,
      tier: 'core',
      confidence: instinct.confidence,
      timestamp: Date.now(),
    }
    this.enqueue(record)
    return record
  }

  /**
   * Record a critical rule (anti-hallucination, system-safe constraint).
   */
  recordCriticalRule(rule: { key: string; content: string; reason: string }): EvidenceRecord {
    const record: EvidenceRecord = {
      source: 'operator',
      key: `critical:${rule.key}`,
      content: rule.content,
      tier: 'critical',
      confidence: 1.0,
      timestamp: Date.now(),
    }
    this.enqueue(record)
    return record
  }

  /**
   * Flush queued evidence to the memory store.
   */
  async flush(memoryStore?: {
    store: (input: {
      key: string
      content: string
      tier: string
      sourceAgentId?: string
      workspaceId?: string
      confidence?: number
    }) => Promise<unknown>
  }): Promise<number> {
    if (!memoryStore || this.writeQueue.length === 0) return 0

    let written = 0
    for (const record of this.writeQueue) {
      try {
        await memoryStore.store({
          key: record.key,
          content: record.content,
          tier: record.tier, // critical tier now supported in DB schema + memory service
          sourceAgentId: record.agentId,
          workspaceId: record.workspaceId,
          confidence: record.confidence,
        })
        written++
      } catch {
        // Non-critical — skip failed writes
      }
    }

    this.writeQueue = []
    return written
  }

  /**
   * Get all queued evidence (for inspection/debugging).
   */
  getQueue(): EvidenceRecord[] {
    return [...this.writeQueue]
  }

  /**
   * Get recent evidence log.
   */
  getLog(limit = 50): EvidenceRecord[] {
    return this.evidenceLog.slice(-limit)
  }

  /**
   * Build a memory influence object for a grounded context response.
   */
  static buildInfluence(
    memoriesUsed: Array<{ tier: string }>,
    snapshotsUsed: string[],
  ): MemoryInfluence {
    const count = memoriesUsed.length
    const tiers = [...new Set(memoriesUsed.map((m) => m.tier))]

    let influenceLevel: MemoryInfluence['influenceLevel'] = 'none'
    if (count > 5 || tiers.includes('critical')) influenceLevel = 'high'
    else if (count > 2 || tiers.includes('core')) influenceLevel = 'medium'
    else if (count > 0) influenceLevel = 'low'

    return {
      used: count > 0 || snapshotsUsed.length > 0,
      influenceLevel,
      memoryCount: count,
      memoryTiers: tiers,
      truthSnapshotsUsed: snapshotsUsed,
      explanation:
        count > 0
          ? `Answer informed by ${count} memories (${tiers.join(', ')}) and ${snapshotsUsed.length} runtime snapshots`
          : snapshotsUsed.length > 0
            ? `Answer based on ${snapshotsUsed.length} runtime snapshots (no memory used)`
            : 'Answer generated without memory or runtime truth',
    }
  }

  private enqueue(record: EvidenceRecord) {
    this.writeQueue.push(record)
    this.evidenceLog.push(record)
    while (this.evidenceLog.length > MAX_EVIDENCE_LOG) this.evidenceLog.shift()
  }
}
