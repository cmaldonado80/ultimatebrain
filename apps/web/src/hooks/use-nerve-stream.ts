'use client'

/**
 * useNerveStream — React hook for real-time Nerve Center SSE events.
 *
 * Connects to /api/nerve-center/stream and dispatches events to state.
 * Auto-reconnects on disconnect with exponential backoff.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

// ── Types ────────────────────────────────────────────────────────────────

export interface GatewayProviderHealth {
  provider: string
  total: number
  errors: number
  errorRate: number
  avgLatencyMs: number | null
}

export interface NerveStreamState {
  connected: boolean
  cortex: {
    systemHealth: string
    isRunning: boolean
    cycleCount: number
    totalHealingActions: number
    totalRecoveries: number
    totalDegradations: number
  } | null
  metrics: Record<string, number[]> // metric name → time series values
  degradation: {
    total: number
    full: number
    reduced: number
    minimal: number
    suspended: number
  } | null
  sandbox: {
    totalExecutions: number
    blockedByPolicy: number
    timeouts: number
    poolSize: number
    successRate: number
  } | null
  gatewayHealth: {
    providers: GatewayProviderHealth[]
  } | null
  lastUpdate: number
}

const INITIAL_STATE: NerveStreamState = {
  connected: false,
  cortex: null,
  metrics: {},
  degradation: null,
  sandbox: null,
  gatewayHealth: null,
  lastUpdate: 0,
}

const MAX_RECONNECT_DELAY = 30000
const BASE_RECONNECT_DELAY = 2000

// ── Hook ─────────────────────────────────────────────────────────────────

export function useNerveStream(enabled = true): NerveStreamState {
  const [state, setState] = useState<NerveStreamState>(INITIAL_STATE)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    if (!enabled) return
    if (eventSourceRef.current) return

    try {
      const es = new EventSource('/api/nerve-center/stream')
      eventSourceRef.current = es

      es.addEventListener('connected', () => {
        reconnectAttemptRef.current = 0
        setState((s) => ({ ...s, connected: true }))
      })

      es.addEventListener('cortex_status', (e) => {
        const data = JSON.parse(e.data)
        setState((s) => ({ ...s, cortex: data, lastUpdate: Date.now() }))
      })

      es.addEventListener('metric_update', (e) => {
        const data = JSON.parse(e.data)
        setState((s) => ({
          ...s,
          metrics: { ...s.metrics, ...data.metrics },
          lastUpdate: Date.now(),
        }))
      })

      es.addEventListener('degradation_summary', (e) => {
        const data = JSON.parse(e.data)
        setState((s) => ({ ...s, degradation: data, lastUpdate: Date.now() }))
      })

      es.addEventListener('sandbox_event', (e) => {
        const data = JSON.parse(e.data)
        setState((s) => ({ ...s, sandbox: data, lastUpdate: Date.now() }))
      })

      es.addEventListener('gateway_health', (e) => {
        const data = JSON.parse(e.data)
        setState((s) => ({ ...s, gatewayHealth: data, lastUpdate: Date.now() }))
      })

      es.onerror = () => {
        es.close()
        eventSourceRef.current = null
        setState((s) => ({ ...s, connected: false }))

        // Reconnect with exponential backoff
        const delay = Math.min(
          BASE_RECONNECT_DELAY * 2 ** reconnectAttemptRef.current,
          MAX_RECONNECT_DELAY,
        )
        reconnectAttemptRef.current++
        reconnectTimerRef.current = setTimeout(connect, delay)
      }
    } catch {
      // SSE not supported or blocked
    }
  }, [enabled])

  useEffect(() => {
    connect()

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
    }
  }, [connect])

  return state
}
