/**
 * Workflow DAG Engine — Directed Acyclic Graph execution for agent workflows.
 *
 * Inspired by LangGraph's graph-based orchestration.
 * Enables agents to define workflows with:
 *   - Conditional branching (if/then/else based on tool results)
 *   - Parallel execution (multiple steps run concurrently)
 *   - State passing between nodes
 *   - Automatic dependency resolution
 */

// ── Types ─────────────────────────────────────────────────────────────

export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface DAGNode {
  id: string
  type: 'tool' | 'condition' | 'parallel' | 'aggregate'
  /** Tool name to execute (for type=tool) */
  tool?: string
  /** Tool input (for type=tool) */
  input?: Record<string, unknown>
  /** Condition expression (for type=condition) — JS expression evaluated against state */
  condition?: string
  /** Branch taken when condition is true */
  trueBranch?: string[]
  /** Branch taken when condition is false */
  falseBranch?: string[]
  /** Node IDs that must complete before this node runs */
  dependsOn: string[]
  /** Current execution status */
  status: NodeStatus
  /** Execution result */
  result?: unknown
  /** Error message if failed */
  error?: string
  /** Duration in ms */
  durationMs?: number
}

export interface DAGWorkflow {
  id: string
  name: string
  nodes: DAGNode[]
  /** Shared state passed between nodes — each node can read/write */
  state: Record<string, unknown>
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt?: number
  completedAt?: number
}

export interface DAGExecutionResult {
  workflowId: string
  status: 'completed' | 'failed'
  state: Record<string, unknown>
  nodeResults: Array<{ id: string; status: NodeStatus; result?: unknown; durationMs?: number }>
  totalDurationMs: number
}

// ── DAG Validation ──────────────────────────────────────────────────

/**
 * Validate that a workflow is a valid DAG (no cycles).
 * Uses Kahn's algorithm for topological sort.
 */
export function validateDAG(nodes: DAGNode[]): { valid: boolean; error?: string } {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  for (const node of nodes) {
    inDegree.set(node.id, node.dependsOn.length)
    for (const dep of node.dependsOn) {
      if (!nodeMap.has(dep)) {
        return { valid: false, error: `Node "${node.id}" depends on unknown node "${dep}"` }
      }
      const adj = adjacency.get(dep) ?? []
      adj.push(node.id)
      adjacency.set(dep, adj)
    }
  }

  // Kahn's algorithm
  const queue = nodes.filter((n) => n.dependsOn.length === 0).map((n) => n.id)
  let processed = 0

  while (queue.length > 0) {
    const current = queue.shift()!
    processed++
    for (const neighbor of adjacency.get(current) ?? []) {
      const deg = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, deg)
      if (deg === 0) queue.push(neighbor)
    }
  }

  if (processed !== nodes.length) {
    return { valid: false, error: 'Workflow contains a cycle — not a valid DAG' }
  }

  return { valid: true }
}

// ── DAG Execution ───────────────────────────────────────────────────

/**
 * Execute a workflow DAG. Resolves dependencies automatically and runs
 * independent nodes in parallel.
 *
 * @param workflow - The workflow definition
 * @param executeTool - Function to execute a tool by name with input
 */
export async function executeDAG(
  workflow: DAGWorkflow,
  executeTool: (toolName: string, input: Record<string, unknown>) => Promise<string>,
): Promise<DAGExecutionResult> {
  const validation = validateDAG(workflow.nodes)
  if (!validation.valid) {
    return {
      workflowId: workflow.id,
      status: 'failed',
      state: workflow.state,
      nodeResults: [],
      totalDurationMs: 0,
    }
  }

  const startTime = Date.now()
  workflow.status = 'running'
  workflow.startedAt = startTime

  const nodeMap = new Map(workflow.nodes.map((n) => [n.id, n]))
  const completed = new Set<string>()
  const skipped = new Set<string>()

  // Process nodes in topological order with parallel execution of independent nodes
  while (completed.size + skipped.size < workflow.nodes.length) {
    // Find all nodes whose dependencies are satisfied
    const ready = workflow.nodes.filter(
      (n) => n.status === 'pending' && n.dependsOn.every((d) => completed.has(d) || skipped.has(d)),
    )

    if (ready.length === 0) {
      // No nodes ready but not all done — something is stuck
      break
    }

    // Execute all ready nodes in parallel
    await Promise.all(
      ready.map(async (node) => {
        const nodeStart = Date.now()
        node.status = 'running'

        try {
          switch (node.type) {
            case 'tool': {
              if (!node.tool) throw new Error('Tool node missing tool name')
              // Substitute state references in input: {{state.key}} → actual value
              const resolvedInput = resolveStateRefs(node.input ?? {}, workflow.state)
              const result = await executeTool(node.tool, resolvedInput)
              node.result = result
              // Store result in workflow state
              workflow.state[node.id] = result
              node.status = 'completed'
              break
            }
            case 'condition': {
              if (!node.condition) throw new Error('Condition node missing expression')
              const condResult = evaluateCondition(node.condition, workflow.state)
              node.result = condResult
              workflow.state[`${node.id}_result`] = condResult

              // Skip nodes in the non-taken branch
              const skipBranch = condResult ? node.falseBranch : node.trueBranch
              if (skipBranch) {
                for (const skipId of skipBranch) {
                  const skipNode = nodeMap.get(skipId)
                  if (skipNode) {
                    skipNode.status = 'skipped'
                    skipped.add(skipId)
                  }
                }
              }
              node.status = 'completed'
              break
            }
            case 'parallel': {
              // Parallel nodes are just markers — their dependsOn handles the fork
              node.status = 'completed'
              node.result = 'parallel_fork'
              break
            }
            case 'aggregate': {
              // Collect results from all dependencies
              const aggregated: Record<string, unknown> = {}
              for (const depId of node.dependsOn) {
                aggregated[depId] = workflow.state[depId]
              }
              node.result = aggregated
              workflow.state[node.id] = aggregated
              node.status = 'completed'
              break
            }
          }
        } catch (err) {
          node.status = 'failed'
          node.error = err instanceof Error ? err.message : 'Unknown error'
          workflow.state[`${node.id}_error`] = node.error
        }

        node.durationMs = Date.now() - nodeStart
        if (node.status === 'completed') {
          completed.add(node.id)
        } else if (node.status === 'failed') {
          completed.add(node.id) // Mark as processed to avoid infinite loop
        }
      }),
    )
  }

  const totalDurationMs = Date.now() - startTime
  const anyFailed = workflow.nodes.some((n) => n.status === 'failed')
  workflow.status = anyFailed ? 'failed' : 'completed'
  workflow.completedAt = Date.now()

  return {
    workflowId: workflow.id,
    status: workflow.status as 'completed' | 'failed',
    state: workflow.state,
    nodeResults: workflow.nodes.map((n) => ({
      id: n.id,
      status: n.status,
      result: n.result,
      durationMs: n.durationMs,
    })),
    totalDurationMs,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Replace {{state.key}} references in tool input with actual state values */
function resolveStateRefs(
  input: Record<string, unknown>,
  state: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
      const path = value.slice(2, -2).trim()
      const parts = path.split('.')
      let ref: unknown = state
      for (const part of parts) {
        if (ref && typeof ref === 'object') {
          ref = (ref as Record<string, unknown>)[part]
        } else {
          ref = undefined
          break
        }
      }
      resolved[key] = ref ?? value
    } else {
      resolved[key] = value
    }
  }
  return resolved
}

/** Safely evaluate a condition expression against workflow state */
function evaluateCondition(expression: string, state: Record<string, unknown>): boolean {
  // Simple safe evaluation — only supports basic comparisons
  // Pattern: "state.key operator value"
  const match = expression.match(
    /^(\w+(?:\.\w+)*)\s*(===|!==|==|!=|>=|<=|>|<|includes|startsWith)\s*(.+)$/,
  )
  if (!match) return false

  const [, path, operator, rawValue] = match
  let left: unknown = state
  for (const part of (path ?? '').split('.')) {
    if (left && typeof left === 'object') {
      left = (left as Record<string, unknown>)[part]
    } else {
      left = undefined
      break
    }
  }

  // Parse right-hand value
  let right: unknown = rawValue?.trim()
  if (right === 'true') right = true
  else if (right === 'false') right = false
  else if (right === 'null') right = null
  else if (typeof right === 'string' && !isNaN(Number(right))) right = Number(right)
  else if (typeof right === 'string' && right.startsWith('"') && right.endsWith('"'))
    right = right.slice(1, -1)

  switch (operator) {
    case '===':
    case '==':
      return left === right
    case '!==':
    case '!=':
      return left !== right
    case '>':
      return Number(left) > Number(right)
    case '<':
      return Number(left) < Number(right)
    case '>=':
      return Number(left) >= Number(right)
    case '<=':
      return Number(left) <= Number(right)
    case 'includes':
      return typeof left === 'string' && typeof right === 'string' && left.includes(right)
    case 'startsWith':
      return typeof left === 'string' && typeof right === 'string' && left.startsWith(right)
    default:
      return false
  }
}
