/**
 * Persistent Agent State
 *
 * Stolen from GSD's .planning/STATE.md pattern.
 * Each agent gets a persistent state object that survives sessions:
 *   - What it's working on (current task, phase, context)
 *   - What it's done (completed tasks with summaries)
 *   - What's blocked (issues, dependencies, decisions needed)
 *   - Focused context (only what's needed for the current task)
 *
 * This enables:
 *   1. Session resumption — agent picks up where it left off
 *   2. Fresh context loading — new tasks start with focused state, not full history
 *   3. Cross-session learning — patterns persist between conversations
 *   4. Handoff between agents — state is transferable
 */

// Agent state is in-memory (no DB dependency yet — can be persisted later)

// ── Types ────────────────────────────────────────────────────────────────

export interface AgentTask {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked'
  startedAt?: number
  completedAt?: number
  summary?: string // what was accomplished
  blockedBy?: string // why it's stuck
}

export interface AgentContext {
  /** Essential context for the current task — what the agent needs to know */
  currentFocus: string | null
  /** Key decisions made that affect future work */
  decisions: Array<{ id: string; decision: string; reason: string; timestamp: number }>
  /** Files the agent has been working with */
  recentFiles: string[]
  /** Important findings from research/exploration */
  findings: Array<{ topic: string; insight: string; timestamp: number }>
}

export interface AgentState {
  agentId: string
  agentName: string
  workspaceId: string

  // Current work
  currentPhase: string | null
  currentTask: AgentTask | null
  taskQueue: AgentTask[]
  completedTasks: AgentTask[]

  // Context (the "fresh context" pattern from GSD)
  context: AgentContext

  // Session tracking
  lastActiveAt: number
  sessionCount: number
  totalTasksCompleted: number

  // Verification results from last work
  lastVerification: {
    passed: boolean
    score: number
    summary: string
    timestamp: number
  } | null
}

// ── State Manager ────────────────────────────────────────────────────────

const MAX_COMPLETED_TASKS = 20
const MAX_DECISIONS = 30
const MAX_FINDINGS = 20
const MAX_RECENT_FILES = 15

export class AgentStateManager {
  private states = new Map<string, AgentState>()

  /**
   * Get or create state for an agent.
   */
  getState(agentId: string, agentName: string, workspaceId: string): AgentState {
    let state = this.states.get(agentId)
    if (!state) {
      state = {
        agentId,
        agentName,
        workspaceId,
        currentPhase: null,
        currentTask: null,
        taskQueue: [],
        completedTasks: [],
        context: {
          currentFocus: null,
          decisions: [],
          recentFiles: [],
          findings: [],
        },
        lastActiveAt: Date.now(),
        sessionCount: 0,
        totalTasksCompleted: 0,
        lastVerification: null,
      }
      this.states.set(agentId, state)
    }
    return state
  }

  /**
   * Start a new task for an agent.
   * Clears current focus and sets fresh context for the task.
   */
  startTask(agentId: string, task: AgentTask): AgentState | null {
    const state = this.states.get(agentId)
    if (!state) return null

    // Move current task to queue if exists
    if (state.currentTask && state.currentTask.status === 'in_progress') {
      state.currentTask.status = 'pending'
      state.taskQueue.unshift(state.currentTask)
    }

    task.status = 'in_progress'
    task.startedAt = Date.now()
    state.currentTask = task
    state.context.currentFocus = task.title
    state.lastActiveAt = Date.now()

    return state
  }

  /**
   * Complete the current task with a summary.
   */
  completeTask(agentId: string, summary: string): AgentState | null {
    const state = this.states.get(agentId)
    if (!state || !state.currentTask) return null

    state.currentTask.status = 'completed'
    state.currentTask.completedAt = Date.now()
    state.currentTask.summary = summary

    state.completedTasks.push(state.currentTask)
    while (state.completedTasks.length > MAX_COMPLETED_TASKS) {
      state.completedTasks.shift()
    }

    state.totalTasksCompleted++
    state.currentTask = null
    state.lastActiveAt = Date.now()

    // Auto-advance to next task in queue
    if (state.taskQueue.length > 0) {
      const next = state.taskQueue.shift()!
      next.status = 'in_progress'
      next.startedAt = Date.now()
      state.currentTask = next
      state.context.currentFocus = next.title
    } else {
      state.context.currentFocus = null
    }

    return state
  }

  /**
   * Mark current task as failed.
   */
  failTask(agentId: string, reason: string): AgentState | null {
    const state = this.states.get(agentId)
    if (!state || !state.currentTask) return null

    state.currentTask.status = 'failed'
    state.currentTask.completedAt = Date.now()
    state.currentTask.summary = `FAILED: ${reason}`
    state.completedTasks.push(state.currentTask)
    while (state.completedTasks.length > MAX_COMPLETED_TASKS) {
      state.completedTasks.shift()
    }

    state.currentTask = null
    state.lastActiveAt = Date.now()
    return state
  }

  /**
   * Block current task with a reason.
   */
  blockTask(agentId: string, blockedBy: string): AgentState | null {
    const state = this.states.get(agentId)
    if (!state || !state.currentTask) return null

    state.currentTask.status = 'blocked'
    state.currentTask.blockedBy = blockedBy
    state.lastActiveAt = Date.now()
    return state
  }

  /**
   * Record a decision made during work.
   */
  recordDecision(agentId: string, id: string, decision: string, reason: string) {
    const state = this.states.get(agentId)
    if (!state) return

    state.context.decisions.push({ id, decision, reason, timestamp: Date.now() })
    while (state.context.decisions.length > MAX_DECISIONS) {
      state.context.decisions.shift()
    }
  }

  /**
   * Record a finding/insight from research.
   */
  recordFinding(agentId: string, topic: string, insight: string) {
    const state = this.states.get(agentId)
    if (!state) return

    state.context.findings.push({ topic, insight, timestamp: Date.now() })
    while (state.context.findings.length > MAX_FINDINGS) {
      state.context.findings.shift()
    }
  }

  /**
   * Track a file the agent worked with.
   */
  trackFile(agentId: string, filePath: string) {
    const state = this.states.get(agentId)
    if (!state) return

    // Move to front, deduplicate
    state.context.recentFiles = [
      filePath,
      ...state.context.recentFiles.filter((f) => f !== filePath),
    ].slice(0, MAX_RECENT_FILES)
  }

  /**
   * Record verification results.
   */
  recordVerification(agentId: string, passed: boolean, score: number, summary: string) {
    const state = this.states.get(agentId)
    if (!state) return

    state.lastVerification = { passed, score, summary, timestamp: Date.now() }
  }

  /**
   * Build focused context for a new task (GSD's "fresh context" pattern).
   * Returns only what the agent needs — not the full history.
   */
  buildFocusedContext(agentId: string): {
    currentTask: AgentTask | null
    recentDecisions: AgentContext['decisions']
    recentFindings: AgentContext['findings']
    recentFiles: string[]
    lastVerification: AgentState['lastVerification']
    completedTaskSummaries: string[]
  } | null {
    const state = this.states.get(agentId)
    if (!state) return null

    return {
      currentTask: state.currentTask,
      recentDecisions: state.context.decisions.slice(-5),
      recentFindings: state.context.findings.slice(-5),
      recentFiles: state.context.recentFiles.slice(0, 5),
      lastVerification: state.lastVerification,
      completedTaskSummaries: state.completedTasks
        .slice(-5)
        .map((t) => `${t.title}: ${t.summary ?? t.status}`),
    }
  }

  /**
   * Start a new session (increment counter, update timestamp).
   */
  startSession(agentId: string) {
    const state = this.states.get(agentId)
    if (state) {
      state.sessionCount++
      state.lastActiveAt = Date.now()
    }
  }

  /**
   * Get all agent states.
   */
  getAllStates(): AgentState[] {
    return Array.from(this.states.values())
  }

  /**
   * Get states for a specific workspace.
   */
  getWorkspaceStates(workspaceId: string): AgentState[] {
    return Array.from(this.states.values()).filter((s) => s.workspaceId === workspaceId)
  }
}
