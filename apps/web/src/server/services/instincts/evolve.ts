/**
 * ECC Instinct System — Evolver
 *
 * When a cluster of related instincts reaches sufficient maturity, the Evolver
 * synthesizes them into formal Skills or Commands. This is the final stage of
 * the instinct lifecycle — a behavioral pattern "graduates" from heuristic
 * guidance into a reusable, documented capability.
 *
 * Evolution paths:
 *   Cluster of related instincts → SKILL.md   (multi-step, tool-using behavior)
 *   Cluster of related instincts → Command     (single-action, invokable by name)
 *
 * Examples of clusters that evolve:
 *
 *   Cluster A — "type safety" domain:
 *     - "when build error contains 'type mismatch' → run tsc --noEmit"
 *     - "when committing TypeScript → check for implicit any"
 *     - "when CI fails on types → add missing type annotations first"
 *   → Evolves to SKILL: "typescript-type-safety-check"
 *
 *   Cluster B — "output format" domain:
 *     - "when user corrects output format → use structured JSON"
 *     - "when API response → include status, data, error fields"
 *     - "when streaming output → emit newline-delimited JSON"
 *   → Evolves to SKILL: "structured-json-output"
 *
 *   Cluster C — "hospitality booking" domain:
 *     - "when booking fails → retry with adjacent dates"
 *   → Evolves to Command: "retry-booking-with-adjacent-dates"
 *
 * The LLM generation in evolveToSkill / evolveToCommand is STUBBED.
 * Wire up an actual LLM call (e.g. Anthropic Messages API) before production use.
 */

import { randomUUID } from 'crypto'
import type { Instinct, EvolutionResult } from './types'
import type { GatewayRouter } from '../gateway'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum cluster size to trigger evolution. */
const MIN_CLUSTER_SIZE = 3

/**
 * Similarity threshold for grouping instincts into a cluster.
 * Two instincts are "related" if their token overlap exceeds this ratio.
 */
const SIMILARITY_THRESHOLD = 0.35

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

export interface InstinctCluster {
  /** Shared domain across the cluster. */
  domain: string
  /** Representative label for the cluster (derived from common tokens). */
  label: string
  instincts: Instinct[]
}

// ---------------------------------------------------------------------------
// InstinctEvolver
// ---------------------------------------------------------------------------

export class InstinctEvolver {
  private gateway: GatewayRouter | null = null

  setGateway(gw: GatewayRouter): void {
    this.gateway = gw
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Group instincts into clusters of 3+ related members.
   *
   * Two instincts are considered related if:
   *   - They share the same domain (or one is 'universal')
   *   - Their trigger+action token overlap exceeds SIMILARITY_THRESHOLD
   *
   * Returns only clusters meeting MIN_CLUSTER_SIZE.
   *
   * Example:
   *   findRelatedClusters([
   *     { domain: 'universal', trigger: 'type mismatch error', action: 'run tsc' },
   *     { domain: 'universal', trigger: 'TypeScript compile error', action: 'check types' },
   *     { domain: 'universal', trigger: 'implicit any warning', action: 'add type annotation' },
   *     { domain: 'astrology', trigger: 'user asks timing', action: 'include planetary hours' },
   *   ])
   *   → [{ label: 'typescript-type-safety', instincts: [first 3] }]
   *     (astrology instinct does not cluster with the others)
   */
  findRelatedClusters(instincts: Instinct[]): InstinctCluster[] {
    // Only consider instincts that have not already evolved
    const eligible = instincts.filter((i) => !i.evolvedInto)

    // Union-Find / greedy single-link clustering
    const visited = new Set<string>()
    const clusters: InstinctCluster[] = []

    for (const seed of eligible) {
      if (visited.has(seed.id)) continue

      const cluster: Instinct[] = [seed]
      visited.add(seed.id)

      for (const candidate of eligible) {
        if (visited.has(candidate.id)) continue
        if (!this.domainsCompatible(seed.domain, candidate.domain)) continue
        if (this.similarity(seed, candidate) >= SIMILARITY_THRESHOLD) {
          cluster.push(candidate)
          visited.add(candidate.id)
        }
      }

      if (cluster.length >= MIN_CLUSTER_SIZE) {
        clusters.push({
          domain: this.resolveClusterDomain(cluster),
          label: this.deriveClusterLabel(cluster),
          instincts: cluster,
        })
      }
    }

    return clusters
  }

  /**
   * Evolve a cluster of instincts into a SKILL.md document.
   *
   * STUB — the LLM call is not implemented. In production, pass the cluster
   * to a structured-output LLM request that produces valid SKILL.md format.
   *
   * Example SKILL.md output for a "typescript-type-safety" cluster:
   *
   *   # Skill: typescript-type-safety-check
   *   version: 1.0.0
   *   domain: universal
   *   ## Trigger
   *   TypeScript compile errors, type mismatches, implicit any warnings
   *   ## Steps
   *   1. Run `tsc --noEmit` to surface all type errors
   *   2. Address implicit `any` by adding explicit type annotations
   *   3. Re-run build to confirm no type errors remain
   *   ## Confidence Origin
   *   Evolved from 3 instincts with combined evidence count: 163
   */
  async evolveToSkill(cluster: InstinctCluster): Promise<EvolutionResult> {
    const skillId = `skill-${cluster.label}-${randomUUID().slice(0, 8)}`
    const totalEvidence = cluster.instincts.reduce((sum, i) => sum + i.evidenceCount, 0)
    const avgConfidence =
      cluster.instincts.reduce((sum, i) => sum + i.confidence, 0) / cluster.instincts.length

    let skillMdContent: string
    if (this.gateway) {
      try {
        const triggers = cluster.instincts.map((i) => `- ${i.trigger}`).join('\n')
        const actions = cluster.instincts.map((i) => `- ${i.action}`).join('\n')
        const result = await this.gateway.chat({
          messages: [
            {
              role: 'system',
              content: 'You are a skill document generator. Given a cluster of instinct triggers and actions, produce a valid SKILL.md document with sections: Skill name, version, domain, Trigger Conditions, Steps, and Notes.',
            },
            {
              role: 'user',
              content: `Generate a SKILL.md for skill "${cluster.label}" (id: ${skillId}) in domain "${cluster.domain}".\n\nTrigger conditions:\n${triggers}\n\nActions:\n${actions}\n\nTotal evidence: ${totalEvidence}, avg confidence: ${avgConfidence.toFixed(2)}.`,
            },
          ],
        })
        skillMdContent = result.content
      } catch (err) {
        console.warn(`[Evolve] LLM skill generation failed for "${cluster.label}", using stub:`, err)
        skillMdContent = this.generateSkillMdStub(cluster, skillId, totalEvidence, avgConfidence)
      }
    } else {
      skillMdContent = this.generateSkillMdStub(cluster, skillId, totalEvidence, avgConfidence)
    }

    return {
      instinctIds: cluster.instincts.map((i) => i.id),
      artifactType: 'skill',
      artifactId: skillId,
      content: skillMdContent,
    }
  }

  /**
   * Evolve a cluster into a Command definition (single-invocation action).
   *
   * Commands are for simpler, atomic behaviors — a single trigger mapped to
   * a single callable action with defined parameters.
   *
   * STUB — command schema generation would also call an LLM in production.
   *
   * Example command for a "retry-booking" cluster:
   *   {
   *     name: "retry-booking-with-adjacent-dates",
   *     description: "When a hospitality booking fails, retry with ±1 day range",
   *     trigger: "booking_failure",
   *     handler: "retryBookingWithAdjacentDates",
   *     parameters: { originalDate: "string", rangedays: "number" }
   *   }
   */
  async evolveToCommand(cluster: InstinctCluster): Promise<EvolutionResult> {
    const commandId = `cmd-${cluster.label}-${randomUUID().slice(0, 8)}`

    let content: string
    if (this.gateway) {
      try {
        const triggers = cluster.instincts.map((i) => `- ${i.trigger}`).join('\n')
        const actions = cluster.instincts.map((i) => `- ${i.action}`).join('\n')
        const result = await this.gateway.chat({
          messages: [
            {
              role: 'system',
              content: 'You are a command schema generator. Given a cluster of instinct triggers and actions, produce a JSON command definition with fields: id, name, description, domain, trigger, actions, parameters.',
            },
            {
              role: 'user',
              content: `Generate a command definition for command "${cluster.label}" (id: ${commandId}) in domain "${cluster.domain}".\n\nTrigger conditions:\n${triggers}\n\nActions:\n${actions}`,
            },
          ],
        })
        content = result.content
      } catch (err) {
        console.warn(`[Evolve] LLM command generation failed for "${cluster.label}", using stub:`, err)
        content = JSON.stringify(this.generateCommandStub(cluster, commandId), null, 2)
      }
    } else {
      content = JSON.stringify(this.generateCommandStub(cluster, commandId), null, 2)
    }

    return {
      instinctIds: cluster.instincts.map((i) => i.id),
      artifactType: 'command',
      artifactId: commandId,
      content,
    }
  }

  /**
   * Mark a set of instincts as evolved, linking them to the generated artifact.
   *
   * After this call, the instincts are excluded from future injections and
   * cluster detection — the Skill or Command replaces them.
   *
   * Example:
   *   markAsEvolved(['inst-abc', 'inst-def'], 'skill-typescript-type-safety-a1b2c3d4')
   *   → each instinct gets evolvedInto = 'skill-typescript-type-safety-a1b2c3d4'
   */
  markAsEvolved(instincts: Instinct[], artifactId: string): Instinct[] {
    const now = new Date()
    return instincts.map((inst) => ({
      ...inst,
      evolvedInto: artifactId,
      updatedAt: now,
    }))
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Check whether two domain tags are compatible for clustering.
   * 'universal' is compatible with any domain.
   */
  private domainsCompatible(domainA: string, domainB: string): boolean {
    if (domainA === 'universal' || domainB === 'universal') return true
    return domainA === domainB
  }

  /**
   * Resolve the domain label for a cluster.
   * If all instincts share the same domain, use it; otherwise use 'universal'.
   */
  private resolveClusterDomain(instincts: Instinct[]): string {
    const domains = new Set(instincts.map((i) => i.domain).filter((d) => d !== 'universal'))
    if (domains.size === 1) return [...domains][0]
    return 'universal'
  }

  /**
   * Compute token-overlap similarity between two instincts.
   * Score = |intersection| / |union| (Jaccard index on trigger + action tokens).
   */
  private similarity(a: Instinct, b: Instinct): number {
    const tokensA = this.tokenize(`${a.trigger} ${a.action}`)
    const tokensB = this.tokenize(`${b.trigger} ${b.action}`)
    const intersection = new Set([...tokensA].filter((t) => tokensB.has(t)))
    const union = new Set([...tokensA, ...tokensB])
    return union.size === 0 ? 0 : intersection.size / union.size
  }

  /**
   * Derive a URL-safe label for a cluster from its most common tokens.
   *
   * Example tokens from a TypeScript cluster:
   *   ['type', 'error', 'typescript', 'mismatch', 'tsc', 'annotation']
   *   → label: "type-error-typescript"
   */
  private deriveClusterLabel(instincts: Instinct[]): string {
    const allText = instincts.map((i) => `${i.trigger} ${i.action}`).join(' ')
    const tokens = [...this.tokenize(allText)]

    // Frequency count
    const freq = new Map<string, number>()
    for (const token of tokens) {
      freq.set(token, (freq.get(token) ?? 0) + 1)
    }

    const topTokens = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t)

    return topTokens.join('-') || 'instinct-cluster'
  }

  private tokenize(text: string): Set<string> {
    const stopWords = new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'in', 'on', 'at',
      'to', 'for', 'of', 'and', 'or', 'but', 'with', 'when', 'that',
      'this', 'it', 'you', 'we', 'be', 'do', 'should', 'use', 'apply',
    ])
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((t) => t.length > 2 && !stopWords.has(t)),
    )
  }

  // -------------------------------------------------------------------------
  // STUB generators — replace with LLM calls in production
  // -------------------------------------------------------------------------

  private generateSkillMdStub(
    cluster: InstinctCluster,
    skillId: string,
    totalEvidence: number,
    avgConfidence: number,
  ): string {
    const steps = cluster.instincts
      .map((inst, i) => `${i + 1}. ${inst.action}`)
      .join('\n')

    const triggers = cluster.instincts.map((i) => `- ${i.trigger}`).join('\n')

    return `# Skill: ${cluster.label}
id: ${skillId}
version: 1.0.0
domain: ${cluster.domain}
evolved_from_instincts: ${cluster.instincts.length}
total_evidence: ${totalEvidence}
avg_confidence: ${avgConfidence.toFixed(2)}

## Trigger Conditions
${triggers}

## Steps
${steps}

## Notes
This skill was automatically evolved from ${cluster.instincts.length} related instincts
with a combined evidence count of ${totalEvidence} observations.
Average confidence at evolution: ${Math.round(avgConfidence * 100)}%.

<!-- TODO: Review and refine this auto-generated skill before activating in production. -->
`
  }

  private generateCommandStub(
    cluster: InstinctCluster,
    commandId: string,
  ): Record<string, unknown> {
    return {
      id: commandId,
      name: cluster.label,
      description: `Auto-evolved command from ${cluster.instincts.length} related instincts in domain '${cluster.domain}'.`,
      domain: cluster.domain,
      trigger: cluster.instincts[0]?.trigger ?? 'unknown',
      actions: cluster.instincts.map((i) => i.action),
      evolvedFromInstincts: cluster.instincts.map((i) => i.id),
      // TODO: Replace with LLM-generated parameter schema
      parameters: {},
    }
  }
}
