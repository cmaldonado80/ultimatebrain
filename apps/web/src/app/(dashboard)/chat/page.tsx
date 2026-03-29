'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ActivityRail } from '../../../components/chat/activity-rail'
import { CommandPalette } from '../../../components/chat/command-palette'
import { buildExecutionGroups, ExecutionGroup } from '../../../components/chat/execution-group'
import { InspectorPanel, type InspectorSelection } from '../../../components/chat/inspector-panel'
import { MentionPicker } from '../../../components/chat/mention-picker'
import { SuggestionBar } from '../../../components/chat/suggestion-bar'
import { ThreadItem, type ThreadItemData } from '../../../components/chat/thread-item'
import { DbErrorBanner } from '../../../components/db-error-banner'
import { trpc } from '../../../utils/trpc'

type StreamEvent =
  // Execution lifecycle (new in V10)
  | { type: 'run_started'; runId: string }
  | { type: 'run_completed'; runId: string; durationMs?: number }
  // Existing events (backward compatible)
  | { type: 'agent_start'; agentName: string; agentId: string }
  | { type: 'text'; content: string; agentId?: string; agentName?: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'memory_context'; count: number; sources?: string[] }
  | { type: 'error'; message: string }

interface Agent {
  id: string
  name: string
  model: string | null
  type: string | null
  status: string | null
  workspaceId: string | null
}

function sessionTitle(
  msgs: Array<{ role: string; text: string }> | undefined,
  createdAt: Date,
): string {
  const first = msgs?.find((m) => m.role === 'user')
  if (first?.text) return first.text.length > 32 ? first.text.slice(0, 32) + '...' : first.text
  return new Date(createdAt).toLocaleDateString()
}

function streamEventToItem(ev: StreamEvent): ThreadItemData {
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

export default function ChatPage() {
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [inspectorSelection, setInspectorSelection] = useState<InspectorSelection>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([])
  const [optimisticText, setOptimisticText] = useState<string | null>(null)
  const [showCommands, setShowCommands] = useState(false)
  const [showMentions, setShowMentions] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [mentionQuery, setMentionQuery] = useState('')

  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const sessionsQuery = trpc.intelligence.chatSessions.useQuery()
  const sessionQuery = trpc.intelligence.chatSession.useQuery(
    { id: selectedSession!, messageLimit: 100 },
    { enabled: !!selectedSession },
  )
  const agentsQuery = trpc.agents.list.useQuery({ limit: 200, offset: 0 })
  const agents: Agent[] = (agentsQuery.data ?? []) as Agent[]
  const agentMap = new Map(agents.map((a) => [a.id, a]))

  const createSession = trpc.intelligence.createChatSession.useMutation()
  const deleteSession = trpc.intelligence.deleteChatSession.useMutation()
  const utils = trpc.useUtils()

  const sessions = (sessionsQuery.data ?? []) as Array<{
    id: string
    agentId: string | null
    createdAt: Date
    updatedAt: Date
  }>
  const messages = (sessionQuery.data?.messages ?? []) as Array<{
    id: string
    role: string
    text: string
    sourceAgentId: string | null
    createdAt: Date
  }>
  const currentSession = sessions.find((s) => s.id === selectedSession)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamEvents, streaming, optimisticText])

  const handleNewSession = async () => {
    const agentId = selectedAgents[0] || undefined
    const agent = agentId ? agentMap.get(agentId) : undefined
    const session = await createSession.mutateAsync({
      agentId,
      workspaceId: agent?.workspaceId ?? undefined,
    })
    utils.intelligence.chatSessions.invalidate()
    if (session) setSelectedSession(session.id)
  }

  const handleDelete = async (id: string) => {
    await deleteSession.mutateAsync({ id })
    utils.intelligence.chatSessions.invalidate()
    if (selectedSession === id) setSelectedSession(null)
    setDeleteConfirm(null)
  }

  const handleSend = useCallback(async () => {
    if (!selectedSession || !newMessage.trim() || streaming) return
    const text = newMessage.trim()
    setNewMessage('')
    setOptimisticText(text)
    setStreaming(true)
    setStreamEvents([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: selectedSession,
          text,
          agentIds: selectedAgents.length > 0 ? selectedAgents : undefined,
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
          setTimeout(() => handleSend(), 2000)
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
  }, [selectedSession, selectedAgents, newMessage, streaming, utils])

  // ── Slash commands ───────────────────────────────────────────────────
  const handleCommand = useCallback(
    (command: string) => {
      setShowCommands(false)
      setNewMessage('')
      switch (command) {
        case 'crew':
          // Select all agents
          if (agents.length > 0) {
            setSelectedAgents(agents.map((a) => a.id).slice(0, 10))
          }
          break
        case 'clear':
          createSession.mutateAsync({})
          break
        case 'retry':
          // Retry last message — resend
          handleSend()
          break
        case 'stop':
          abortRef.current?.abort()
          break
        case 'export': {
          const data = sessionQuery.data as
            | { messages?: Array<{ role: string; text: string }> }
            | undefined
          if (data?.messages) {
            const blob = new Blob([JSON.stringify(data.messages, null, 2)], {
              type: 'application/json',
            })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `chat-${selectedSession?.slice(0, 8)}.json`
            a.click()
            URL.revokeObjectURL(url)
          }
          break
        }
      }
    },
    [agents, createSession, handleSend, selectedSession, sessionQuery.data],
  )

  // ── @mention handler ─────────────────────────────────────────────────
  const handleMention = useCallback(
    (agent: { id: string; name: string }) => {
      setShowMentions(false)
      setNewMessage((prev) => prev.replace(/@\S*$/, ''))
      if (!selectedAgents.includes(agent.id)) {
        setSelectedAgents((prev) => [...prev, agent.id])
      }
    },
    [selectedAgents],
  )

  // ── Keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+N → new conversation
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        createSession.mutateAsync({})
      }
      // Cmd+Shift+I → toggle inspector
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'I') {
        e.preventDefault()
        setInspectorOpen((v) => !v)
      }
      // Escape → stop generation or close inspector
      if (e.key === 'Escape') {
        if (streaming) abortRef.current?.abort()
        else if (inspectorOpen) setInspectorOpen(false)
        else if (showCommands) setShowCommands(false)
        else if (showMentions) setShowMentions(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [streaming, inspectorOpen, showCommands, showMentions, createSession])

  const handleInspect = useCallback((sel: InspectorSelection) => {
    setInspectorSelection(sel)
    setInspectorOpen(true)
  }, [])

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [])

  function getAgentName(msg: { role: string; sourceAgentId: string | null }): string {
    if (msg.role === 'user') return 'You'
    if (msg.sourceAgentId) return agentMap.get(msg.sourceAgentId)?.name ?? 'Agent'
    if (currentSession?.agentId) return agentMap.get(currentSession.agentId)?.name ?? 'Assistant'
    return 'Assistant'
  }

  const threadItems: ThreadItemData[] = messages.map((m) => {
    if (m.role === 'user') return { type: 'user', id: m.id, text: m.text, createdAt: m.createdAt }
    const name = getAgentName(m)
    const agent = m.sourceAgentId ? agentMap.get(m.sourceAgentId) : undefined
    return {
      type: 'agent',
      id: m.id,
      text: m.text,
      agentName: name,
      agentId: m.sourceAgentId ?? undefined,
      model: agent?.model ?? undefined,
      createdAt: m.createdAt,
    }
  })
  if (optimisticText) {
    threadItems.push({
      type: 'user',
      id: '_optimistic',
      text: optimisticText,
      createdAt: new Date(),
    })
  }

  const streamItems: ThreadItemData[] = streamEvents.map(streamEventToItem)
  if (streaming && streamEvents.length === 0) {
    streamItems.push({ type: 'streaming', text: '', agentName: undefined })
  }
  const allItems = [...threadItems, ...streamItems]
  const groupedItems = useMemo(() => buildExecutionGroups(allItems), [allItems])

  const headerTitle = selectedSession
    ? sessionTitle(messages, currentSession?.createdAt ?? new Date())
    : 'Chat'

  if (sessionsQuery.error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={sessionsQuery.error} />
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-60px)] flex flex-col">
      {/* Header */}
      <div className="h-12 flex-shrink-0 flex items-center justify-between px-4 border-b border-border bg-bg-surface">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="cyber-btn-sm cyber-btn-secondary text-xs"
          >
            {sidebarOpen ? '\u2190' : '\u2192'}
          </button>
          <h1 className="text-sm font-orbitron text-neon-teal truncate max-w-[300px]">
            {headerTitle}
          </h1>
          {currentSession?.agentId && (
            <span className="text-[10px] text-slate-500 font-mono">
              {agentMap.get(currentSession.agentId)?.name ?? ''}
            </span>
          )}
        </div>
        <button
          onClick={() => setInspectorOpen(!inspectorOpen)}
          className={`cyber-btn-sm ${inspectorOpen ? 'cyber-btn-primary' : 'cyber-btn-secondary'} text-xs`}
        >
          Inspector
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left panel -- session sidebar */}
        {sidebarOpen && (
          <div className="w-64 flex-shrink-0 border-r border-border bg-bg-surface flex flex-col overflow-hidden">
            <div className="p-3">
              <button onClick={handleNewSession} className="cyber-btn-primary cyber-btn-sm w-full">
                + New Session
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
              {sessions.length === 0 ? (
                <div className="text-xs text-slate-600 text-center py-4">No sessions yet</div>
              ) : (
                sessions.map((s) => {
                  const isActive = selectedSession === s.id
                  const label = s.agentId
                    ? (agentMap.get(s.agentId)?.name ?? `Chat ${s.id.slice(0, 6)}`)
                    : `Chat ${s.id.slice(0, 6)}`
                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedSession(s.id)}
                      className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs ${
                        isActive
                          ? 'bg-neon-blue/10 text-neon-blue border border-neon-blue/20'
                          : 'text-slate-400 hover:bg-white/5 hover:text-slate-300 border border-transparent'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium">{label}</div>
                        <div className="text-[10px] text-slate-600">
                          {new Date(s.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (deleteConfirm === s.id) handleDelete(s.id)
                          else setDeleteConfirm(s.id)
                        }}
                        className={`opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded transition-all ${
                          deleteConfirm === s.id
                            ? 'opacity-100 bg-neon-red/20 text-neon-red'
                            : 'text-slate-500 hover:text-neon-red'
                        }`}
                      >
                        {deleteConfirm === s.id ? 'Confirm?' : '\u00d7'}
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* Center panel -- thread + composer */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Activity Rail — shows during streaming */}
          {streaming && streamEvents.length > 0 && (
            <ActivityRail
              events={streamEvents as Parameters<typeof ActivityRail>[0]['events']}
              onInspect={(name) => handleInspect({ type: 'agent', id: '', name })}
            />
          )}
          {!selectedSession ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="text-3xl mb-4 opacity-20 font-orbitron">Chat</div>
                <p className="text-slate-500 text-sm mb-6">
                  Select a session or create a new one to begin.
                </p>
                <button onClick={handleNewSession} className="cyber-btn-primary">
                  Start New Chat
                </button>
              </div>
            </div>
          ) : sessionQuery.isLoading ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              Loading messages...
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {allItems.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-600 text-sm">
                    Send a message to start the conversation.
                  </div>
                ) : (
                  <div className="max-w-3xl mx-auto">
                    {groupedItems.map((item, i) =>
                      'kind' in item && (item as { kind: string }).kind === 'group' ? (
                        <ExecutionGroup
                          key={i}
                          group={item as Parameters<typeof ExecutionGroup>[0]['group']}
                          onInspect={handleInspect}
                        />
                      ) : (
                        <ThreadItem
                          key={i}
                          item={item as Parameters<typeof ThreadItem>[0]['item']}
                          onInspect={handleInspect}
                        />
                      ),
                    )}
                    {/* Suggestion bar — appears after final answer when not streaming */}
                    {!streaming &&
                      (() => {
                        const lastItem = allItems[allItems.length - 1]
                        if (
                          !lastItem ||
                          (lastItem.type !== 'final_answer' && lastItem.type !== 'agent')
                        )
                          return null
                        const hadError = allItems.some((i) => i.type === 'error')
                        const hadTools = allItems.some(
                          (i) => i.type === 'tool_use' || i.type === 'tool_result',
                        )
                        const finalText =
                          'text' in lastItem ? (lastItem as { text: string }).text : ''
                        const lastAgent =
                          'agentName' in lastItem
                            ? (lastItem as { agentName: string }).agentName
                            : 'Assistant'
                        return (
                          <SuggestionBar
                            hadError={hadError}
                            hadTools={hadTools}
                            agentCount={selectedAgents.length || 1}
                            agentName={lastAgent}
                            finalAnswerText={finalText}
                            onAction={(action) => {
                              if (action === 'retry' || action === 'retry_different') handleSend()
                              else if (action === 'copy') navigator.clipboard.writeText(finalText)
                              else if (action === 'follow_up') textareaRef.current?.focus()
                              else if (action === 'second_opinion') setShowMentions(true)
                            }}
                          />
                        )
                      })()}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
              {/* Composer */}
              <div className="border-t border-border px-4 py-3 flex-shrink-0">
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <select
                      className="cyber-input text-xs py-1 px-2 w-48"
                      value=""
                      onChange={(e) => {
                        const v = e.target.value
                        if (v && !selectedAgents.includes(v)) setSelectedAgents((p) => [...p, v])
                        e.target.value = ''
                      }}
                    >
                      <option value="">Auto (default)</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id} disabled={selectedAgents.includes(a.id)}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    {selectedAgents.map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neon-purple/10 text-neon-purple text-[11px] border border-neon-purple/20"
                      >
                        {agentMap.get(id)?.name ?? 'Agent'}
                        <button
                          className="hover:text-neon-red ml-0.5"
                          onClick={() => setSelectedAgents((p) => p.filter((x) => x !== id))}
                        >
                          x
                        </button>
                      </span>
                    ))}
                    {selectedAgents.length > 1 && (
                      <span className="text-[10px] text-neon-purple flex items-center gap-1">
                        <span className="neon-dot neon-dot-purple neon-dot-pulse" /> Crew mode
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 items-end relative">
                    {/* Slash command palette */}
                    {showCommands && (
                      <CommandPalette
                        query={commandQuery}
                        onSelect={handleCommand}
                        onClose={() => setShowCommands(false)}
                      />
                    )}
                    {/* @mention picker */}
                    {showMentions && (
                      <MentionPicker
                        query={mentionQuery}
                        agents={
                          agents as Array<{
                            id: string
                            name: string
                            type: string | null
                            model: string | null
                          }>
                        }
                        onSelect={handleMention}
                        onClose={() => setShowMentions(false)}
                      />
                    )}
                    <textarea
                      ref={textareaRef}
                      className="cyber-input flex-1 rounded-xl py-2.5 pr-4 resize-none"
                      placeholder={
                        selectedAgents.length > 1
                          ? `Message ${selectedAgents.length} agents... (/ for commands, @ for agents)`
                          : 'Type a message... (/ for commands, @ for agents)'
                      }
                      value={newMessage}
                      onChange={(e) => {
                        const val = e.target.value
                        setNewMessage(val)
                        autoResize()

                        // Detect slash command
                        if (val.startsWith('/')) {
                          setShowCommands(true)
                          setShowMentions(false)
                          setCommandQuery(val.slice(1))
                        } else {
                          setShowCommands(false)
                        }

                        // Detect @mention
                        const mentionMatch = val.match(/@(\S*)$/)
                        if (mentionMatch) {
                          setShowMentions(true)
                          setShowCommands(false)
                          setMentionQuery(mentionMatch[1])
                        } else {
                          setShowMentions(false)
                        }
                      }}
                      onKeyDown={(e) => {
                        if (showCommands || showMentions) return // Let palette handle keys
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSend()
                        }
                      }}
                      rows={1}
                      style={{ maxHeight: 160 }}
                    />
                    {streaming ? (
                      <button
                        className="cyber-btn-danger rounded-xl py-2.5 flex-shrink-0"
                        onClick={() => abortRef.current?.abort()}
                      >
                        &#9632; Stop
                      </button>
                    ) : (
                      <button
                        className="cyber-btn-primary rounded-xl py-2.5 flex-shrink-0 disabled:opacity-30"
                        onClick={handleSend}
                        disabled={!newMessage.trim()}
                      >
                        Send
                      </button>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-600 text-center flex items-center justify-center gap-3">
                    <span>Shift+Enter new line</span>
                    <span className="text-slate-700">|</span>
                    <span>/ commands</span>
                    <span className="text-slate-700">|</span>
                    <span>@agent</span>
                    <span className="text-slate-700">|</span>
                    <span>Cmd+N new chat</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right panel -- inspector */}
        {inspectorOpen && (
          <InspectorPanel selection={inspectorSelection} onClose={() => setInspectorOpen(false)} />
        )}
      </div>
    </div>
  )
}
