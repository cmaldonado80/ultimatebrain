import { describe, expect, it } from 'vitest'

import { shouldSkipCache } from '../cache'

describe('shouldSkipCache', () => {
  it('skips streaming requests', () => {
    expect(
      shouldSkipCache({
        stream: true,
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).toBe(true)
  })

  it('skips tool-use requests', () => {
    expect(
      shouldSkipCache({
        tools: [{ name: 'search' }],
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).toBe(true)
  })

  it('skips when system prompt has template markers', () => {
    expect(
      shouldSkipCache({
        messages: [
          { role: 'system', content: 'You are {{agent_name}}' },
          { role: 'user', content: 'hello' },
        ],
      }),
    ).toBe(true)
  })

  it('skips when system prompt references current_time', () => {
    expect(
      shouldSkipCache({
        messages: [
          { role: 'system', content: 'The current_time is 2026-01-01' },
          { role: 'user', content: 'hello' },
        ],
      }),
    ).toBe(true)
  })

  it('allows caching for simple non-streaming requests', () => {
    expect(
      shouldSkipCache({
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is 2+2?' },
        ],
      }),
    ).toBe(false)
  })

  it('allows caching when tools array is empty', () => {
    expect(
      shouldSkipCache({
        tools: [],
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).toBe(false)
  })

  it('allows caching with no system prompt', () => {
    expect(
      shouldSkipCache({
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).toBe(false)
  })
})
