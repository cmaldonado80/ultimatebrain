import { beforeEach, describe, expect, it } from 'vitest'

import { journey, type JourneyDefinition, JourneyEngine } from '../journey-engine'

function buildTestJourney(): JourneyDefinition {
  return journey('test-journey')
    .name('Test Journey')
    .description('A test journey for unit tests')
    .glossary({ term1: 'Definition 1', term2: 'Definition 2' })
    .agent('agent-1')
    .domain('testing')
    .initialState('start')
    .state('start', {
      name: 'Start',
      guidelines: [
        { when: 'user greets', action: 'respond with welcome', tool: 'greet-tool' },
        { when: 'user asks question', action: 'search knowledge base' },
      ],
      transitions: { next: 'middle', skip: 'end' },
      tools: ['greet-tool', 'search'],
    })
    .state('middle', {
      name: 'Middle',
      guidelines: [{ when: 'data gathered', action: 'analyze and summarize' }],
      transitions: { complete: 'end' },
    })
    .state('end', {
      name: 'End',
      guidelines: [{ when: 'done', action: 'present final result' }],
      transitions: {},
      terminal: true,
    })
    .build()
}

describe('JourneyEngine', () => {
  let engine: JourneyEngine
  let journeyDef: JourneyDefinition

  beforeEach(() => {
    engine = new JourneyEngine()
    journeyDef = buildTestJourney()
  })

  describe('journey() builder', () => {
    it('should build a journey definition with all fields', () => {
      expect(journeyDef.id).toBe('test-journey')
      expect(journeyDef.name).toBe('Test Journey')
      expect(journeyDef.description).toBe('A test journey for unit tests')
      expect(journeyDef.glossary.term1).toBe('Definition 1')
      expect(journeyDef.agentId).toBe('agent-1')
      expect(journeyDef.domain).toBe('testing')
      expect(journeyDef.initialState).toBe('start')
      expect(Object.keys(journeyDef.states)).toEqual(['start', 'middle', 'end'])
    })

    it('should throw if no states defined', () => {
      expect(() => journey('empty').build()).toThrow('at least one state')
    })

    it('should auto-set initialState to first state added', () => {
      const def = journey('auto')
        .state('first', { guidelines: [{ when: 'x', action: 'y' }], transitions: {} })
        .build()
      expect(def.initialState).toBe('first')
    })
  })

  describe('start()', () => {
    it('should create an active execution at initial state', () => {
      const exec = engine.start(journeyDef)
      expect(exec.journeyId).toBe('test-journey')
      expect(exec.currentState).toBe('start')
      expect(exec.status).toBe('active')
      expect(exec.history).toEqual([])
      expect(exec.id).toBeTruthy()
    })

    it('should accept initial context', () => {
      const exec = engine.start(journeyDef, { key: 'value' })
      expect(exec.context.key).toBe('value')
    })
  })

  describe('processEvent()', () => {
    it('should transition on matching trigger', async () => {
      const exec = engine.start(journeyDef)
      const result = await engine.processEvent(exec.id, journeyDef, 'next')

      expect(result.transitioned).toBe(true)
      expect(result.newState).toBe('middle')
      expect(result.execution.currentState).toBe('middle')
      expect(result.execution.history).toHaveLength(1)
      expect(result.execution.history[0].fromState).toBe('start')
      expect(result.execution.history[0].toState).toBe('middle')
    })

    it('should not transition on unknown trigger', async () => {
      const exec = engine.start(journeyDef)
      const result = await engine.processEvent(exec.id, journeyDef, 'unknown')

      expect(result.transitioned).toBe(false)
      expect(result.execution.currentState).toBe('start')
    })

    it('should complete when reaching terminal state', async () => {
      const exec = engine.start(journeyDef)
      await engine.processEvent(exec.id, journeyDef, 'skip') // start → end (terminal)

      expect(exec.status).toBe('completed')
      expect(exec.completedAt).toBeTruthy()
    })

    it('should merge event data into context', async () => {
      const exec = engine.start(journeyDef)
      await engine.processEvent(exec.id, journeyDef, 'next', { newData: 42 })

      expect(exec.context.newData).toBe(42)
    })

    it('should throw for unknown execution', async () => {
      await expect(engine.processEvent('nonexistent', journeyDef, 'next')).rejects.toThrow(
        'Execution not found',
      )
    })

    it('should not transition if paused', async () => {
      const exec = engine.start(journeyDef)
      engine.pause(exec.id)

      const result = await engine.processEvent(exec.id, journeyDef, 'next')
      expect(result.transitioned).toBe(false)
      expect(exec.currentState).toBe('start')
    })
  })

  describe('getStatePrompt()', () => {
    it('should format prompt with glossary and guidelines', () => {
      const exec = engine.start(journeyDef)
      const prompt = engine.getStatePrompt(journeyDef, exec)

      expect(prompt).toContain('Test Journey')
      expect(prompt).toContain('Start')
      expect(prompt).toContain('term1')
      expect(prompt).toContain('Definition 1')
      expect(prompt).toContain('user greets')
      expect(prompt).toContain('greet-tool')
      expect(prompt).toContain('"next" → moves to state: middle')
    })
  })

  describe('lifecycle methods', () => {
    it('should list active executions', () => {
      engine.start(journeyDef)
      engine.start(journeyDef)
      expect(engine.listActive().length).toBeGreaterThanOrEqual(2)
    })

    it('should get execution by id', () => {
      const exec = engine.start(journeyDef)
      expect(engine.getExecution(exec.id)).toBeTruthy()
      expect(engine.getExecution('nonexistent')).toBeNull()
    })

    it('should pause and resume', () => {
      const exec = engine.start(journeyDef)
      engine.pause(exec.id)
      expect(exec.status).toBe('paused')

      engine.resume(exec.id)
      expect(exec.status).toBe('active')
    })

    it('should fail execution', () => {
      const exec = engine.start(journeyDef)
      engine.fail(exec.id)
      expect(exec.status).toBe('failed')
    })
  })
})
