import { describe, it, expect } from 'vitest'

// A2A protocol types and validators — these will be exported from the a2a
// engine once implemented.  Defined inline so the tests act as a spec.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentCard {
  id: string
  name: string
  description: string
  capabilities: string[]
  endpoint: string
  version: string
}

interface TaskDelegation {
  fromAgentId: string
  toAgentId: string
  taskId: string
  payload: Record<string, unknown>
  priority?: 'low' | 'medium' | 'high' | 'critical'
}

interface TaskResult {
  taskId: string
  agentId: string
  status: 'completed' | 'failed' | 'partial'
  output: unknown
  error?: string
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function validateAgentCard(card: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (typeof card !== 'object' || card === null) return { valid: false, errors: ['Card must be an object'] }
  const c = card as Record<string, unknown>

  if (typeof c.id !== 'string' || c.id.length === 0) errors.push('id is required and must be a non-empty string')
  if (typeof c.name !== 'string' || c.name.length === 0) errors.push('name is required and must be a non-empty string')
  if (typeof c.description !== 'string') errors.push('description must be a string')
  if (!Array.isArray(c.capabilities)) errors.push('capabilities must be an array')
  if (typeof c.endpoint !== 'string' || !c.endpoint.startsWith('http')) errors.push('endpoint must be a valid URL')
  if (typeof c.version !== 'string') errors.push('version must be a string')

  return { valid: errors.length === 0, errors }
}

function validateTaskDelegation(task: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (typeof task !== 'object' || task === null) return { valid: false, errors: ['Task must be an object'] }
  const t = task as Record<string, unknown>

  if (typeof t.fromAgentId !== 'string' || t.fromAgentId.length === 0) errors.push('fromAgentId is required')
  if (typeof t.toAgentId !== 'string' || t.toAgentId.length === 0) errors.push('toAgentId is required')
  if (typeof t.taskId !== 'string' || t.taskId.length === 0) errors.push('taskId is required')
  if (typeof t.payload !== 'object' || t.payload === null) errors.push('payload must be an object')
  if (t.priority !== undefined && !['low', 'medium', 'high', 'critical'].includes(t.priority as string)) {
    errors.push('priority must be one of: low, medium, high, critical')
  }

  return { valid: errors.length === 0, errors }
}

function matchCapabilities(required: string[], card: AgentCard): boolean {
  return required.every((cap) => card.capabilities.includes(cap))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('A2A Protocol', () => {
  describe('Agent Card Validation', () => {
    const validCard: AgentCard = {
      id: 'agent-001',
      name: 'CodeReviewer',
      description: 'Reviews pull requests and suggests improvements',
      capabilities: ['code-review', 'linting', 'security-scan'],
      endpoint: 'https://agents.example.com/code-reviewer',
      version: '1.0.0',
    }

    it('accepts a valid agent card', () => {
      const result = validateAgentCard(validCard)
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('rejects a card with missing id', () => {
      const { id, ...noId } = validCard
      const result = validateAgentCard(noId)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('id is required and must be a non-empty string')
    })

    it('rejects a card with empty name', () => {
      const result = validateAgentCard({ ...validCard, name: '' })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('name is required and must be a non-empty string')
    })

    it('rejects a card with invalid endpoint', () => {
      const result = validateAgentCard({ ...validCard, endpoint: 'not-a-url' })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('endpoint must be a valid URL')
    })

    it('rejects a card where capabilities is not an array', () => {
      const result = validateAgentCard({ ...validCard, capabilities: 'code-review' })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('capabilities must be an array')
    })

    it('rejects null input', () => {
      const result = validateAgentCard(null)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Card must be an object')
    })

    it('collects multiple errors at once', () => {
      const result = validateAgentCard({ id: '', endpoint: 'bad' })
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(1)
    })
  })

  describe('Task Delegation Format', () => {
    const validDelegation: TaskDelegation = {
      fromAgentId: 'agent-001',
      toAgentId: 'agent-002',
      taskId: 'task-abc-123',
      payload: { file: 'src/index.ts', action: 'review' },
      priority: 'high',
    }

    it('accepts a valid task delegation', () => {
      const result = validateTaskDelegation(validDelegation)
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('accepts delegation without optional priority', () => {
      const { priority, ...noPriority } = validDelegation
      const result = validateTaskDelegation(noPriority)
      expect(result.valid).toBe(true)
    })

    it('rejects delegation with missing fromAgentId', () => {
      const { fromAgentId, ...noFrom } = validDelegation
      const result = validateTaskDelegation(noFrom)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('fromAgentId is required')
    })

    it('rejects delegation with missing toAgentId', () => {
      const { toAgentId, ...noTo } = validDelegation
      const result = validateTaskDelegation(noTo)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('toAgentId is required')
    })

    it('rejects delegation with null payload', () => {
      const result = validateTaskDelegation({ ...validDelegation, payload: null })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('payload must be an object')
    })

    it('rejects delegation with invalid priority', () => {
      const result = validateTaskDelegation({ ...validDelegation, priority: 'urgent' })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('priority must be one of: low, medium, high, critical')
    })
  })

  describe('Capability Matching', () => {
    const card: AgentCard = {
      id: 'agent-001',
      name: 'CodeReviewer',
      description: 'Reviews code',
      capabilities: ['code-review', 'linting', 'security-scan'],
      endpoint: 'https://agents.example.com/cr',
      version: '1.0.0',
    }

    it('matches when all required capabilities are present', () => {
      expect(matchCapabilities(['code-review', 'linting'], card)).toBe(true)
    })

    it('matches when requiring a single present capability', () => {
      expect(matchCapabilities(['security-scan'], card)).toBe(true)
    })

    it('fails when a required capability is missing', () => {
      expect(matchCapabilities(['code-review', 'deployment'], card)).toBe(false)
    })

    it('matches when required list is empty', () => {
      expect(matchCapabilities([], card)).toBe(true)
    })
  })

  describe('TaskResult structure', () => {
    it('represents a completed result', () => {
      const result: TaskResult = {
        taskId: 'task-1',
        agentId: 'agent-001',
        status: 'completed',
        output: { summary: 'All checks passed' },
      }
      expect(result.status).toBe('completed')
      expect(result.error).toBeUndefined()
    })

    it('represents a failed result with error message', () => {
      const result: TaskResult = {
        taskId: 'task-2',
        agentId: 'agent-001',
        status: 'failed',
        output: null,
        error: 'Timeout after 30s',
      }
      expect(result.status).toBe('failed')
      expect(result.error).toBe('Timeout after 30s')
    })
  })
})
