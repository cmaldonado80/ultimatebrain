'use client'

/**
 * useCommandStream — React hook for the Corporation Command Center SSE.
 *
 * Connects to /api/command-center/stream, dispatches events to state,
 * and auto-reconnects with exponential backoff.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface CommandStreamState {
  connected: boolean
  agents: { total: number; active: number; idle: number; error: number; offline: number }
  tickets: { open: number; done: number; failed: number }
  swarms: {
    active: number
    swarms: Array<{ id: string; task: string; members: number; createdAt: string }>
  }
  costs: { lastHourUsd: number; lastHourCalls: number }
  healing: { lastHourActions: number }
  cron: {
    recentRuns: Array<{
      name: string
      status: string
      lastRun: string
      failed: boolean
    }>
  }
  activity: {
    items: Array<{
      type: string
      id: string
      title: string
      status: string
      timestamp: string
    }>
  }
}

const INITIAL_STATE: CommandStreamState = {
  connected: false,
  agents: { total: 0, active: 0, idle: 0, error: 0, offline: 0 },
  tickets: { open: 0, done: 0, failed: 0 },
  swarms: { active: 0, swarms: [] },
  costs: { lastHourUsd: 0, lastHourCalls: 0 },
  healing: { lastHourActions: 0 },
  cron: { recentRuns: [] },
  activity: { items: [] },
}

export function useCommandStream() {
  const [state, setState] = useState<CommandStreamState>(INITIAL_STATE)
  const esRef = useRef<EventSource | null>(null)
  const retryRef = useRef(0)

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close()

    const es = new EventSource('/api/command-center/stream')
    esRef.current = es

    es.addEventListener('connected', () => {
      retryRef.current = 0
      setState((s) => ({ ...s, connected: true }))
    })

    es.addEventListener('agents', (e) => {
      const data = JSON.parse(e.data)
      setState((s) => ({ ...s, agents: { ...s.agents, ...data } }))
    })

    es.addEventListener('tickets', (e) => {
      const data = JSON.parse(e.data)
      setState((s) => ({ ...s, tickets: { ...s.tickets, ...data } }))
    })

    es.addEventListener('swarms', (e) => {
      const data = JSON.parse(e.data)
      setState((s) => ({ ...s, swarms: data }))
    })

    es.addEventListener('costs', (e) => {
      const data = JSON.parse(e.data)
      setState((s) => ({ ...s, costs: data }))
    })

    es.addEventListener('healing', (e) => {
      const data = JSON.parse(e.data)
      setState((s) => ({ ...s, healing: data }))
    })

    es.addEventListener('cron', (e) => {
      const data = JSON.parse(e.data)
      setState((s) => ({ ...s, cron: data }))
    })

    es.addEventListener('activity', (e) => {
      const data = JSON.parse(e.data)
      setState((s) => ({ ...s, activity: data }))
    })

    es.onerror = () => {
      es.close()
      setState((s) => ({ ...s, connected: false }))
      const delay = Math.min(2000 * 2 ** retryRef.current, 30000)
      retryRef.current++
      setTimeout(connect, delay)
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      esRef.current?.close()
    }
  }, [connect])

  return state
}
