import { describe, it, expect, vi } from 'vitest'
import { FlowBuilder, type FlowContext, type StepFn } from '../flow-engine'

// Mock DB for FlowRunner (checkpoint manager)
const mockDb = {
  insert: vi
    .fn()
    .mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'cp-1' }]) }),
    }),
  query: { checkpoints: { findFirst: vi.fn().mockResolvedValue(null) } },
}

describe('FlowBuilder', () => {
  it('should build a flow definition with name', () => {
    const step: StepFn = async (ctx: FlowContext) => ctx
    const def = new FlowBuilder('test-flow').start(step).end()
    expect(def.name).toBe('test-flow')
    expect(def.steps.length).toBeGreaterThanOrEqual(1)
  })

  it('should chain sequential steps', () => {
    const step1: StepFn = async (ctx: FlowContext) => ({
      ...ctx,
      data: { ...ctx.data, step1: true },
    })
    const step2: StepFn = async (ctx: FlowContext) => ({
      ...ctx,
      data: { ...ctx.data, step2: true },
    })

    const def = new FlowBuilder('multi-step').start(step1).then(step2, 'step-2').end()

    expect(def.steps.length).toBeGreaterThanOrEqual(2)
  })

  it('should support parallel steps', () => {
    const main: StepFn = async (ctx: FlowContext) => ctx
    const parallel1: StepFn = async (ctx: FlowContext) => ({
      ...ctx,
      data: { ...ctx.data, p1: true },
    })
    const parallel2: StepFn = async (ctx: FlowContext) => ({
      ...ctx,
      data: { ...ctx.data, p2: true },
    })

    const def = new FlowBuilder('parallel-flow')
      .start(main)
      .parallel([parallel1, parallel2], 'fan-out')
      .end()

    expect(def.steps.length).toBeGreaterThanOrEqual(2)
  })

  it('should create a runner from definition', () => {
    const step: StepFn = async (ctx: FlowContext) => ctx
    const def = new FlowBuilder('runnable').start(step).end()
    const runner = def.runner(mockDb as never)
    expect(runner).toBeTruthy()
    expect(typeof runner.run).toBe('function')
  })
})

describe('FlowRunner', () => {
  it('should create a runner that can execute', () => {
    const step: StepFn = async (ctx: FlowContext) => ctx
    const def = new FlowBuilder('runnable').start(step).end()
    const runner = def.runner(mockDb as never)
    expect(typeof runner.run).toBe('function')
  })

  it('should handle step errors gracefully', async () => {
    const failStep: StepFn = async () => {
      throw new Error('Step failed')
    }

    const def = new FlowBuilder('failing').start(failStep).end()
    const runner = def.runner(mockDb as never)
    const result = await runner.run({}, { triggeredBy: 'test' })

    expect(result.status).toBe('failed')
  })
})
