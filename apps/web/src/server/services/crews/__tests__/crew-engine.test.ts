import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type CrewDefinition, CrewEngine, type ToolDefinition } from '../crew-engine'

// ── Mock GatewayRouter ─────────────────────────────────────────────────────

vi.mock('../../gateway', () => ({
  GatewayRouter: vi.fn().mockImplementation(() => ({
    chat: vi.fn(),
  })),
}))

function createMockDb() {
  return {} as unknown as ReturnType<typeof createMockDb>
}

function getGatewayChat(engine: CrewEngine) {
  return (engine as unknown as { gateway: { chat: ReturnType<typeof vi.fn> } }).gateway.chat
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeCrew(overrides: Partial<CrewDefinition> = {}): CrewDefinition {
  return {
    name: 'Test Crew',
    agents: [
      {
        id: 'agent-1',
        role: 'Researcher',
        goal: 'Find information',
        backstory: 'Expert researcher',
      },
    ],
    task: 'Summarize the topic',
    ...overrides,
  }
}

function reActResponse(thought: string, finalAnswer: string): string {
  return `Thought: ${thought}\nFinal Answer: ${finalAnswer}`
}

function reActToolCall(thought: string, action: string, input: Record<string, unknown>): string {
  return `Thought: ${thought}\nAction: ${action}\nAction Input: ${JSON.stringify(input)}`
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CrewEngine', () => {
  let engine: CrewEngine
  let chatMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    engine = new CrewEngine(createMockDb())
    chatMock = getGatewayChat(engine)
  })

  describe('run', () => {
    it('should run a single-agent crew and return result', async () => {
      chatMock.mockResolvedValueOnce({
        content: reActResponse('I know the answer', 'The summary is complete'),
      })

      const result = await engine.run(makeCrew())

      expect(result.crewName).toBe('Test Crew')
      expect(result.task).toBe('Summarize the topic')
      expect(result.status).toBe('completed')
      expect(result.agentResults).toHaveLength(1)
      expect(result.agentResults[0].finalAnswer).toBe('The summary is complete')
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('should run agents sequentially and pass last output as final', async () => {
      chatMock
        .mockResolvedValueOnce({
          content: reActResponse('Researching', 'Found data X'),
        })
        .mockResolvedValueOnce({
          content: reActResponse('Writing', 'Final report based on data X'),
        })

      const crew = makeCrew({
        agents: [
          { id: 'researcher', role: 'Researcher', goal: 'Find data', backstory: 'Expert' },
          { id: 'writer', role: 'Writer', goal: 'Write report', backstory: 'Author' },
        ],
      })

      const result = await engine.run(crew)

      expect(result.agentResults).toHaveLength(2)
      expect(result.finalOutput).toBe('Final report based on data X')
    })
  })

  describe('runAgent — ReAct loop', () => {
    it('should iterate through thought/action/observation cycle', async () => {
      const searchTool: ToolDefinition = {
        name: 'search',
        description: 'Search for info',
        parameters: { query: { type: 'string', description: 'Search query' } },
        execute: vi.fn().mockResolvedValue('Result: found 42'),
      }

      chatMock
        .mockResolvedValueOnce({
          content: reActToolCall('Need to search', 'search', { query: 'test' }),
        })
        .mockResolvedValueOnce({
          content: reActResponse('Got the answer', 'The answer is 42'),
        })

      const result = await engine.runAgent(
        { id: 'a1', role: 'Searcher', goal: 'Find answer', backstory: 'Expert' },
        'Find the answer',
        'crew-1',
        [searchTool],
      )

      expect(result.steps).toHaveLength(2)
      expect(result.steps[0].action).toBe('search')
      expect(result.steps[0].observation).toBe('Result: found 42')
      expect(result.steps[1].isFinal).toBe(true)
      expect(result.finalAnswer).toBe('The answer is 42')
      expect(result.toolsUsed).toContain('search')
      expect(searchTool.execute).toHaveBeenCalledOnce()
    })

    it('should stop at maxIterations and use last observation', async () => {
      chatMock.mockResolvedValue({
        content: reActToolCall('Thinking more', 'search', { query: 'loop' }),
      })

      const searchTool: ToolDefinition = {
        name: 'search',
        description: 'Search',
        parameters: {},
        execute: vi.fn().mockResolvedValue('still searching...'),
      }

      const result = await engine.runAgent(
        { id: 'a1', role: 'R', goal: 'G', backstory: 'B', maxIterations: 3 },
        'task',
        'crew-1',
        [searchTool],
      )

      expect(result.iterationsUsed).toBeLessThanOrEqual(4)
      expect(result.finalAnswer).toBe('still searching...')
    })

    it('should handle unknown tool gracefully', async () => {
      chatMock
        .mockResolvedValueOnce({
          content: reActToolCall('Trying tool', 'nonexistent_tool', {}),
        })
        .mockResolvedValueOnce({
          content: reActResponse('Tool not found, giving answer', 'Fallback answer'),
        })

      const result = await engine.runAgent(
        { id: 'a1', role: 'R', goal: 'G', backstory: 'B' },
        'task',
        'crew-1',
        [],
      )

      expect(result.steps[0].observation).toContain('Unknown tool: nonexistent_tool')
      expect(result.finalAnswer).toBe('Fallback answer')
    })

    it('should handle tool execution errors', async () => {
      const failingTool: ToolDefinition = {
        name: 'broken',
        description: 'A broken tool',
        parameters: {},
        execute: vi.fn().mockRejectedValue(new Error('Connection timeout')),
      }

      chatMock
        .mockResolvedValueOnce({
          content: reActToolCall('Using tool', 'broken', {}),
        })
        .mockResolvedValueOnce({
          content: reActResponse('Tool failed, answering directly', 'Manual answer'),
        })

      const result = await engine.runAgent(
        { id: 'a1', role: 'R', goal: 'G', backstory: 'B' },
        'task',
        'crew-1',
        [failingTool],
      )

      expect(result.steps[0].observation).toContain('Error executing broken: Connection timeout')
      expect(result.finalAnswer).toBe('Manual answer')
    })
  })

  describe('delegation tools', () => {
    it('should auto-generate delegate_work and ask_question when allowDelegation is true', async () => {
      // Agent 1 delegates to agent 2
      chatMock
        // Agent 1: decides to delegate
        .mockResolvedValueOnce({
          content: reActToolCall('Need help', 'delegate_work', {
            to_agent: 'agent-2',
            task_description: 'Research subtopic',
          }),
        })
        // Agent 2: handles delegated task (called recursively by delegation tool)
        .mockResolvedValueOnce({
          content: reActResponse('Researched', 'Subtopic result'),
        })
        // Agent 1: uses result
        .mockResolvedValueOnce({
          content: reActResponse('Got delegation result', 'Final combined answer'),
        })
        // Agent 2: runs as second agent in crew.run() sequential loop
        .mockResolvedValueOnce({
          content: reActResponse('Specialist done', 'Specialist final output'),
        })

      const crew = makeCrew({
        agents: [
          {
            id: 'agent-1',
            role: 'Lead',
            goal: 'Coordinate',
            backstory: 'Manager',
            allowDelegation: true,
          },
          { id: 'agent-2', role: 'Specialist', goal: 'Research', backstory: 'Expert' },
        ],
      })

      const result = await engine.run(crew)

      // Agent 1 should have delegated to agent 2
      const agent1Result = result.agentResults[0]
      expect(agent1Result.delegationsMade).toHaveLength(1)
      expect(agent1Result.delegationsMade[0].toAgentId).toBe('agent-2')
      expect(agent1Result.delegationsMade[0].result).toBe('Subtopic result')
      expect(agent1Result.finalAnswer).toBe('Final combined answer')
    })

    it('should return error when delegating to non-existent agent', async () => {
      chatMock
        .mockResolvedValueOnce({
          content: reActToolCall('Delegating', 'delegate_work', {
            to_agent: 'ghost-agent',
            task_description: 'Do something',
          }),
        })
        .mockResolvedValueOnce({
          content: reActResponse('Agent not found', 'Could not delegate'),
        })

      const crew = makeCrew({
        agents: [
          {
            id: 'agent-1',
            role: 'Lead',
            goal: 'Coordinate',
            backstory: 'M',
            allowDelegation: true,
          },
        ],
      })

      const result = await engine.run(crew)

      expect(result.agentResults[0].steps[0].observation).toBe('Agent ghost-agent not found')
    })
  })

  describe('parseReActResponse', () => {
    it('should parse standard Final Answer response', async () => {
      chatMock.mockResolvedValueOnce({
        content: 'Thought: I know this\nFinal Answer: The answer is 42',
      })

      const result = await engine.runAgent(
        { id: 'a1', role: 'R', goal: 'G', backstory: 'B' },
        'task',
        'crew-1',
        [],
      )

      expect(result.steps[0].thought).toBe('I know this')
      expect(result.steps[0].isFinal).toBe(true)
      expect(result.finalAnswer).toBe('The answer is 42')
    })

    it('should parse Action Input as JSON', async () => {
      chatMock
        .mockResolvedValueOnce({
          content:
            'Thought: Need to search\nAction: search\nAction Input: {"query": "test", "limit": 5}',
        })
        .mockResolvedValueOnce({
          content: reActResponse('Done', 'Result'),
        })

      const searchTool: ToolDefinition = {
        name: 'search',
        description: 'Search',
        parameters: {},
        execute: vi.fn().mockResolvedValue('ok'),
      }

      const result = await engine.runAgent(
        { id: 'a1', role: 'R', goal: 'G', backstory: 'B' },
        'task',
        'crew-1',
        [searchTool],
      )

      expect(result.steps[0].actionInput).toEqual({ query: 'test', limit: 5 })
    })

    it('should handle non-JSON Action Input gracefully', async () => {
      chatMock
        .mockResolvedValueOnce({
          content: 'Thought: Searching\nAction: search\nAction Input: just a plain string',
        })
        .mockResolvedValueOnce({
          content: reActResponse('Done', 'Result'),
        })

      const searchTool: ToolDefinition = {
        name: 'search',
        description: 'Search',
        parameters: {},
        execute: vi.fn().mockResolvedValue('ok'),
      }

      const result = await engine.runAgent(
        { id: 'a1', role: 'R', goal: 'G', backstory: 'B' },
        'task',
        'crew-1',
        [searchTool],
      )

      expect(result.steps[0].actionInput).toEqual({ input: 'just a plain string' })
    })
  })
})
