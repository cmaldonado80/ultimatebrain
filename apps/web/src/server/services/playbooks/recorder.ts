/**
 * Playbook Recorder
 *
 * Records user actions in the dashboard as structured events:
 * - Click targets (component, action, parameters)
 * - Decision points (option chosen + reason)
 * - Data transformations (input → output)
 *
 * Packages the recording session as a Playbook stored in the
 * `playbooks` table as JSONB steps.
 */

import type { Database } from '@solarc/db'
import { playbooks } from '@solarc/db'
import { eq } from 'drizzle-orm'

export type RecordedEventType =
  | 'click'
  | 'decision'
  | 'transformation'
  | 'navigation'
  | 'form_submit'
  | 'api_call'
  | 'custom'

export interface RecordedEvent {
  type: RecordedEventType
  timestamp: Date
  component?: string
  action?: string
  parameters?: Record<string, unknown>
  /** For decisions: which option was chosen and why */
  decision?: { option: string; reason?: string; alternatives?: string[] }
  /** For transformations: what changed */
  transformation?: { input: unknown; output: unknown; description?: string }
  /** For navigation: where we went */
  navigation?: { from: string; to: string }
  /** Raw metadata */
  meta?: Record<string, unknown>
}

export interface PlaybookStep {
  index: number
  name: string
  type: RecordedEventType
  description: string
  /** Parameterized values (replaced during distillation) */
  parameters: Record<string, unknown>
  /** Expected outcome to verify after execution */
  expectedOutcome?: string
  /** Whether to pause and ask user before executing */
  requiresApproval?: boolean
  /** Original recorded event */
  sourceEvent?: RecordedEvent
}

export interface RecordingSession {
  id: string
  startedAt: Date
  endedAt?: Date
  events: RecordedEvent[]
  context: Record<string, unknown>
}

export interface SavedPlaybook {
  id: string
  name: string
  description: string | null
  steps: PlaybookStep[]
  version: number
  createdBy: string | null
  createdAt: Date
  /** Computed from run history */
  successRate?: number
  lastRunAt?: Date
  triggerConditions?: string[]
}

/** In-memory active recording sessions */
const activeSessions = new Map<string, RecordingSession>()

export class PlaybookRecorder {
  constructor(private db: Database) {}

  // ── Recording Session ─────────────────────────────────────────────────

  /** Start a new recording session */
  startRecording(context: Record<string, unknown> = {}): string {
    const sessionId = crypto.randomUUID()
    activeSessions.set(sessionId, {
      id: sessionId,
      startedAt: new Date(),
      events: [],
      context,
    })
    return sessionId
  }

  /** Record a single event into an active session */
  record(sessionId: string, event: Omit<RecordedEvent, 'timestamp'>): void {
    const session = activeSessions.get(sessionId)
    if (!session) throw new Error(`No active session: ${sessionId}`)
    session.events.push({ ...event, timestamp: new Date() })
  }

  /** Convenience: record a click event */
  recordClick(
    sessionId: string,
    component: string,
    action: string,
    parameters?: Record<string, unknown>
  ): void {
    this.record(sessionId, { type: 'click', component, action, parameters })
  }

  /** Convenience: record a decision */
  recordDecision(
    sessionId: string,
    option: string,
    reason?: string,
    alternatives?: string[]
  ): void {
    this.record(sessionId, {
      type: 'decision',
      decision: { option, reason, alternatives },
    })
  }

  /** Convenience: record a data transformation */
  recordTransformation(
    sessionId: string,
    input: unknown,
    output: unknown,
    description?: string
  ): void {
    this.record(sessionId, {
      type: 'transformation',
      transformation: { input, output, description },
    })
  }

  /** Convenience: record an API call */
  recordApiCall(
    sessionId: string,
    action: string,
    parameters?: Record<string, unknown>
  ): void {
    this.record(sessionId, { type: 'api_call', action, parameters })
  }

  /** Get the current state of an active session */
  getSession(sessionId: string): RecordingSession | null {
    return activeSessions.get(sessionId) ?? null
  }

  // ── Session → Playbook ────────────────────────────────────────────────

  /**
   * End the session and convert events into PlaybookSteps.
   * Returns the raw steps ready for distillation or immediate save.
   */
  endRecording(sessionId: string): { session: RecordingSession; steps: PlaybookStep[] } {
    const session = activeSessions.get(sessionId)
    if (!session) throw new Error(`No active session: ${sessionId}`)

    session.endedAt = new Date()
    activeSessions.delete(sessionId)

    const steps = this.eventsToSteps(session.events)
    return { session, steps }
  }

  /**
   * Save a set of steps as a named playbook.
   */
  async save(
    name: string,
    steps: PlaybookStep[],
    options: {
      description?: string
      createdBy?: string
      triggerConditions?: string[]
    } = {}
  ): Promise<SavedPlaybook> {
    const stepsWithMeta = {
      steps,
      triggerConditions: options.triggerConditions ?? [],
    }

    const [saved] = await this.db
      .insert(playbooks)
      .values({
        name,
        description: options.description ?? null,
        steps: stepsWithMeta,
        createdBy: options.createdBy ?? null,
        version: 1,
      })
      .returning()

    return this.toSavedPlaybook(saved)
  }

  /**
   * List all saved playbooks.
   */
  async list(): Promise<SavedPlaybook[]> {
    const rows = await this.db.query.playbooks.findMany({
      orderBy: (p, { desc }) => [desc(p.createdAt)],
    })
    return rows.map(this.toSavedPlaybook)
  }

  /**
   * Get a single playbook by ID.
   */
  async get(id: string): Promise<SavedPlaybook | null> {
    const row = await this.db.query.playbooks.findFirst({
      where: eq(playbooks.id, id),
    })
    return row ? this.toSavedPlaybook(row) : null
  }

  /**
   * Delete a playbook.
   */
  async delete(id: string): Promise<void> {
    await this.db.delete(playbooks).where(eq(playbooks.id, id))
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private eventsToSteps(events: RecordedEvent[]): PlaybookStep[] {
    return events.map((event, i) => {
      const name = this.eventToStepName(event)
      const description = this.eventToDescription(event)
      const parameters = this.extractParameters(event)

      return {
        index: i,
        name,
        type: event.type,
        description,
        parameters,
        sourceEvent: event,
      }
    })
  }

  private eventToStepName(event: RecordedEvent): string {
    switch (event.type) {
      case 'click':
        return `Click: ${event.component ?? 'unknown'} → ${event.action ?? 'unknown'}`
      case 'decision':
        return `Decide: ${event.decision?.option ?? 'unknown'}`
      case 'transformation':
        return `Transform: ${event.transformation?.description ?? 'data'}`
      case 'navigation':
        return `Navigate: ${event.navigation?.to ?? 'unknown'}`
      case 'form_submit':
        return `Submit: ${event.component ?? 'form'}`
      case 'api_call':
        return `Call: ${event.action ?? 'api'}`
      default:
        return `Action: ${event.type}`
    }
  }

  private eventToDescription(event: RecordedEvent): string {
    switch (event.type) {
      case 'click':
        return `Clicked ${event.component} to perform "${event.action}"${event.parameters ? ` with ${JSON.stringify(event.parameters)}` : ''}`
      case 'decision':
        return `Chose "${event.decision?.option}"${event.decision?.reason ? ` because: ${event.decision.reason}` : ''}`
      case 'transformation':
        return event.transformation?.description ?? 'Transformed data'
      case 'navigation':
        return `Navigated from ${event.navigation?.from} to ${event.navigation?.to}`
      case 'api_call':
        return `Called ${event.action}`
      default:
        return `Performed ${event.type} action`
    }
  }

  private extractParameters(event: RecordedEvent): Record<string, unknown> {
    const params: Record<string, unknown> = {}
    if (event.parameters) Object.assign(params, event.parameters)
    if (event.decision) params['decision_option'] = event.decision.option
    if (event.transformation?.input) params['input'] = event.transformation.input
    if (event.navigation?.to) params['target_path'] = event.navigation.to
    return params
  }

  private toSavedPlaybook(row: typeof playbooks.$inferSelect): SavedPlaybook {
    const data = row.steps as { steps: PlaybookStep[]; triggerConditions?: string[] }
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      steps: data.steps ?? [],
      version: row.version ?? 1,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      triggerConditions: data.triggerConditions ?? [],
    }
  }
}
