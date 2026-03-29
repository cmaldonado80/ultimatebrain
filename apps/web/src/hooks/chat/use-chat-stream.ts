'use client'

import { useCallback, useRef, useState } from 'react'

import type { ThreadItemData } from '../../components/chat/thread-item'
import { trpc } from '../../utils/trpc'

export type StreamEvent =
  // Execution lifecycle (new in V10)
  | { type: 'run_started'; runId: string }
  | { type: 'run_completed'; runId: string; durationMs?: number }
  // Existing events (backward compatible)
  | { type: 'agent_start'; agentName: string; agentId: string; groupId?: string }
  | { type: 'text'; content: string; agentId?: string; agentName?: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'memory_context'; count: number; sources?: string[] }
  | { type: 'error'; message: string }

export function streamEventToItem(ev: StreamEvent): ThreadItemData {
  switch (ev.type) {
    case 'agent_start':
      return { type: 'agent_start', agentName: ev.agentName, agentId: ev.agentId }
    case 'text':
      return { type: 'streaming', text: ev.content, agentName: ev.agentName }
    case 'tool_use':
      return { type: 'tool_use', name: ev.name, input: ev.input }
    case 'tool_result':
      return { type: 'tool_result', name: ev.name, result: ev.result }
    case 'memory_context':
      return { type: 'memory_context', count: ev.count, sources: ev.sources }
    case 'error':
      return { type: 'error', message: ev.message }
    case 'run_started':
    case 'run_completed':
      // Lifecycle events don't render as thread items — they're metadata
      return { type: 'system', text: '' }
  }
}

export function sessionTitle(
  msgs: Array<{ role: string; text: string }> | undefined,
  createdAt: Date,
): string {
  const first = msgs?.find((m) => m.role === 'user')
  if (first?.text) return first.text.length > 32 ? first.text.slice(0, 32) + '...' : first.text
  return new Date(createdAt).toLocaleDateString()
}

export interface StreamMeta {
  retryOfRunId?: string
  retryType?: 'manual' | 'auto' | 'suggested'
  retryScope?: 'run' | 'group' | 'step'
  retryTargetId?: string
  retryReason?: string
  workflowId?: string
  workflowName?: string
  autonomyLevel?: 'manual' | 'assist' | 'auto'
}

export function useChatStream(
  selectedSession: string | null,
  selectedAgents: string[],
  utils: ReturnType<typeof trpc.useUtils>,
) {
  const [streaming, setStreaming] = useState(false)
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([])
  const [optimisticText, setOptimisticText] = useState<string | null>(null)
  const [lastRunId, setLastRunId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const handleSend = useCallback(
    async (
      text: string,
      textareaRef?: React.RefObject<HTMLTextAreaElement | null>,
      meta?: StreamMeta,
    ) => {
      if (!selectedSession || !text.trim() || streaming) return
      const trimmed = text.trim()
      setOptimisticText(trimmed)
      setStreaming(true)
      setStreamEvents([])
      if (textareaRef?.current) textareaRef.current.style.height = 'auto'

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: selectedSession,
            text: trimmed,
            agentIds: selectedAgents.length > 0 ? selectedAgents : undefined,
            ...meta,
          }),
          signal: controller.signal,
        })
        if (!res.ok) {
          const errText = await res.text().catch(() => `HTTP ${res.status}`)
          setStreamEvents((prev) => [...prev, { type: 'error', message: errText }])
          setStreaming(false)
          return
        }

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const ev = JSON.parse(line.slice(6)) as Record<string, unknown>
              if (ev.error) {
                setStreamEvents((p) => [...p, { type: 'error', message: ev.error as string }])
              } else if (ev.agentStart) {
                setStreamEvents((p) => [
                  ...p,
                  {
                    type: 'agent_start',
                    agentName: ev.agentStart as string,
                    agentId: (ev.agentId as string) ?? '',
                  },
                ])
              } else if (ev.text) {
                setStreamEvents((p) => {
                  const last = p[p.length - 1]
                  if (last?.type === 'text') {
                    const u = [...p]
                    u[u.length - 1] = {
                      ...last,
                      content: last.content + (ev.text as string),
                      agentName: (ev.agentName as string) ?? last.agentName,
                      agentId: (ev.agentId as string) ?? last.agentId,
                    }
                    return u
                  }
                  return [
                    ...p,
                    {
                      type: 'text' as const,
                      content: ev.text as string,
                      agentName: ev.agentName as string | undefined,
                      agentId: ev.agentId as string | undefined,
                    },
                  ]
                })
              } else if (ev.type === 'tool_use') {
                setStreamEvents((p) => [
                  ...p,
                  { type: 'tool_use', name: ev.name as string, input: ev.input },
                ])
              } else if (ev.type === 'tool_result') {
                setStreamEvents((p) => [
                  ...p,
                  { type: 'tool_result', name: ev.name as string, result: ev.result as string },
                ])
              } else if (ev.type === 'memory_context') {
                setStreamEvents((p) => [
                  ...p,
                  {
                    type: 'memory_context',
                    count: ev.count as number,
                    sources: ev.sources as string[] | undefined,
                  },
                ])
              } else if (ev.type === 'run_started') {
                setLastRunId(ev.runId as string)
                setStreamEvents((p) => [...p, { type: 'run_started', runId: ev.runId as string }])
              } else if (ev.type === 'run_completed') {
                setStreamEvents((p) => [
                  ...p,
                  {
                    type: 'run_completed',
                    runId: ev.runId as string,
                    durationMs: ev.durationMs as number | undefined,
                  },
                ])
              }
              if (ev.done) break
            } catch {
              /* skip malformed */
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          // Auto-retry once if autonomy level is 'auto'
          const autonomyLevel = localStorage.getItem('autonomy-level')
          const alreadyRetried = (err as Error & { retried?: boolean }).retried
          if (autonomyLevel === 'auto' && !alreadyRetried) {
            setStreamEvents((p) => [
              ...p,
              { type: 'error', message: `${(err as Error).message} — auto-retrying in 2s...` },
            ])
            setTimeout(
              () =>
                handleSend(trimmed, textareaRef, {
                  ...meta,
                  retryType: 'auto',
                  retryReason: (err as Error).message,
                  autonomyLevel: 'auto',
                }),
              2000,
            )
          } else {
            setStreamEvents((p) => [...p, { type: 'error', message: (err as Error).message }])
          }
        }
      } finally {
        setStreaming(false)
        setOptimisticText(null)
        abortRef.current = null
        await utils.intelligence.chatSession.invalidate({ id: selectedSession })
        setStreamEvents([])
      }
    },
    [selectedSession, selectedAgents, streaming, utils],
  )

  const abort = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { streaming, streamEvents, optimisticText, lastRunId, handleSend, abort, setStreamEvents }
}
