import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RequestQueue } from '../transport/queue'

describe('RequestQueue', () => {
  let queue: RequestQueue

  beforeEach(() => {
    queue = new RequestQueue()
  })

  it('starts online with empty queue', () => {
    expect(queue.isOnline).toBe(true)
    expect(queue.size).toBe(0)
  })

  it('enqueue adds requests and returns an id', () => {
    const id = queue.enqueue('POST', '/api/tickets', { title: 'test' })
    expect(id).toBeTruthy()
    expect(queue.size).toBe(1)
  })

  it('goOffline marks the queue offline', () => {
    queue.goOffline()
    expect(queue.isOnline).toBe(false)
  })

  it('goOnline drains queued requests', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    queue.setDrainHandler(handler)

    queue.enqueue('POST', '/api/a', { data: 1 })
    queue.enqueue('PUT', '/api/b', { data: 2 })

    queue.goOffline()
    const result = await queue.goOnline()

    expect(result.sent).toBe(2)
    expect(result.failed).toBe(0)
    expect(handler).toHaveBeenCalledTimes(2)
    expect(queue.size).toBe(0)
  })

  it('retries failed requests up to 3 times', async () => {
    let callCount = 0
    queue.setDrainHandler(async () => {
      callCount++
      if (callCount <= 3) throw new Error('fail')
    })

    queue.enqueue('POST', '/api/test')

    // First drain: fails (retry 1)
    await queue.goOnline()
    expect(queue.size).toBe(1) // re-queued

    // Second drain: fails (retry 2)
    await queue.goOnline()
    expect(queue.size).toBe(1) // re-queued

    // Third drain: fails (retry 3, limit reached)
    await queue.goOnline()
    expect(queue.size).toBe(0) // dropped
  })

  it('returns {sent:0, failed:0} when no drain handler set', async () => {
    queue.enqueue('GET', '/api/test')
    const result = await queue.goOnline()
    expect(result).toEqual({ sent: 0, failed: 0 })
  })

  it('clear empties the queue', () => {
    queue.enqueue('POST', '/api/a')
    queue.enqueue('POST', '/api/b')
    queue.clear()
    expect(queue.size).toBe(0)
  })

  it('maintains request order during drain', async () => {
    const paths: string[] = []
    queue.setDrainHandler(async (req) => {
      paths.push(req.path)
    })

    queue.enqueue('GET', '/first')
    queue.enqueue('GET', '/second')
    queue.enqueue('GET', '/third')

    await queue.goOnline()
    expect(paths).toEqual(['/first', '/second', '/third'])
  })
})
