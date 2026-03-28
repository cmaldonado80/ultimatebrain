/**
 * Cognition State Manager
 *
 * Global brain configuration and learned preferences:
 * - Feature flags (enable/disable brain capabilities)
 * - Policies (behavioral rules the brain follows)
 * - Prompt overlays (dynamic prompt injection per workspace)
 * - Agent trust scoring (reputation tracking)
 */

import type { Database } from '@solarc/db'
import { agentTrustScores, cognitionState, promptOverlays } from '@solarc/db'
import { and, eq } from 'drizzle-orm'

export interface CognitionFeatures {
  [key: string]: boolean
}

export interface CognitionPolicies {
  [key: string]: string | number | boolean
}

export interface TrustFactors {
  taskCompletionRate: number
  errorRate: number
  avgResponseTime: number
  guardrailViolations: number
  userRating: number
}

const SINGLETON_ID = '1'

export class CognitionManager {
  constructor(private db: Database) {}

  // === Feature Flags ===

  async getFeatures(): Promise<CognitionFeatures> {
    const state = await this.db.query.cognitionState.findFirst({
      where: eq(cognitionState.id, SINGLETON_ID),
    })
    return (state?.features as CognitionFeatures) ?? {}
  }

  async setFeature(name: string, enabled: boolean): Promise<void> {
    const current = await this.getFeatures()
    current[name] = enabled
    await this.upsertState({ features: current })
  }

  async isFeatureEnabled(name: string): Promise<boolean> {
    const features = await this.getFeatures()
    return features[name] ?? false
  }

  // === Policies ===

  async getPolicies(): Promise<CognitionPolicies> {
    const state = await this.db.query.cognitionState.findFirst({
      where: eq(cognitionState.id, SINGLETON_ID),
    })
    return (state?.policies as CognitionPolicies) ?? {}
  }

  async setPolicy(name: string, value: string | number | boolean): Promise<void> {
    const current = await this.getPolicies()
    current[name] = value
    await this.upsertState({ policies: current })
  }

  async removePolicy(name: string): Promise<void> {
    const current = await this.getPolicies()
    delete current[name]
    await this.upsertState({ policies: current })
  }

  // === Full State ===

  async getState() {
    return this.db.query.cognitionState.findFirst({
      where: eq(cognitionState.id, SINGLETON_ID),
    })
  }

  private async upsertState(updates: { features?: unknown; policies?: unknown }): Promise<void> {
    const existing = await this.getState()
    if (existing) {
      await this.db
        .update(cognitionState)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(cognitionState.id, SINGLETON_ID))
    } else {
      await this.db.insert(cognitionState).values({
        id: SINGLETON_ID,
        features: updates.features ?? {},
        policies: updates.policies ?? {},
      })
    }
  }

  // === Prompt Overlays ===

  async getActiveOverlays(workspaceId?: string) {
    const conditions = [eq(promptOverlays.active, true)]
    if (workspaceId) conditions.push(eq(promptOverlays.workspaceId, workspaceId))

    return this.db.query.promptOverlays.findMany({
      where: and(...conditions),
    })
  }

  async createOverlay(content: string, workspaceId?: string) {
    const [overlay] = await this.db
      .insert(promptOverlays)
      .values({
        content,
        workspaceId,
        active: true,
      })
      .returning()
    return overlay!
  }

  async toggleOverlay(id: string, active: boolean): Promise<void> {
    await this.db.update(promptOverlays).set({ active }).where(eq(promptOverlays.id, id))
  }

  async deleteOverlay(id: string): Promise<void> {
    await this.db.delete(promptOverlays).where(eq(promptOverlays.id, id))
  }

  /**
   * Build the full system prompt with overlays for a workspace.
   * Returns overlay contents joined as a prompt suffix.
   */
  async buildPromptOverlay(workspaceId?: string): Promise<string> {
    const overlays = await this.getActiveOverlays(workspaceId)
    if (overlays.length === 0) return ''
    return overlays.map((o) => o.content).join('\n\n')
  }

  // === Agent Trust Scores ===

  async getTrustScore(agentId: string): Promise<{ score: number; factors: TrustFactors | null }> {
    const row = await this.db.query.agentTrustScores.findFirst({
      where: eq(agentTrustScores.agentId, agentId),
    })
    return {
      score: row?.score ?? 0.5,
      factors: (row?.factors as TrustFactors) ?? null,
    }
  }

  async updateTrustScore(
    agentId: string,
    score: number,
    factors?: Partial<TrustFactors>,
  ): Promise<void> {
    const clamped = Math.max(0, Math.min(1, score))
    const existing = await this.db.query.agentTrustScores.findFirst({
      where: eq(agentTrustScores.agentId, agentId),
    })

    if (existing) {
      const mergedFactors = factors
        ? { ...(existing.factors as TrustFactors | null), ...factors }
        : existing.factors

      await this.db
        .update(agentTrustScores)
        .set({
          score: clamped,
          factors: mergedFactors,
          updatedAt: new Date(),
        })
        .where(eq(agentTrustScores.agentId, agentId))
    } else {
      await this.db.insert(agentTrustScores).values({
        agentId,
        score: clamped,
        factors: factors ?? null,
      })
    }
  }

  /**
   * Recalculate trust score from factors.
   */
  async recalculateTrust(agentId: string): Promise<number> {
    const { factors } = await this.getTrustScore(agentId)
    if (!factors) return 0.5

    // Weighted formula
    const score =
      factors.taskCompletionRate * 0.3 +
      (1 - factors.errorRate) * 0.2 +
      Math.min(1, 5000 / Math.max(1, factors.avgResponseTime)) * 0.15 + // Faster = better
      (1 - Math.min(1, factors.guardrailViolations / 10)) * 0.15 +
      factors.userRating * 0.2

    const clamped = Math.max(0, Math.min(1, score))
    await this.updateTrustScore(agentId, clamped)
    return clamped
  }
}
