'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ActivityRail } from '../../../components/chat/activity-rail'
import { CommandPalette } from '../../../components/chat/command-palette'
import { EvidenceSheet } from '../../../components/chat/evidence-sheet'
import { buildExecutionGroups, ExecutionGroup } from '../../../components/chat/execution-group'
import { InspectorPanel } from '../../../components/chat/inspector-panel'
import { IntelligenceCard } from '../../../components/chat/intelligence-card'
import { MentionPicker } from '../../../components/chat/mention-picker'
import { RunHistoryPanel } from '../../../components/chat/run-history-panel'
import { SuggestionBar } from '../../../components/chat/suggestion-bar'
import { ThreadItem, type ThreadItemData } from '../../../components/chat/thread-item'
import { DbErrorBanner } from '../../../components/db-error-banner'
import { useChatKeyboardShortcuts } from '../../../hooks/chat/use-chat-shortcuts'
import { sessionTitle, streamEventToItem, useChatStream } from '../../../hooks/chat/use-chat-stream'
import { useInspector } from '../../../hooks/chat/use-inspector'
import { trpc } from '../../../utils/trpc'

interface Agent {
  id: string
  name: string
  model: string | null
  type: string | null
  status: string | null
  workspaceId: string | null
}

export default function ChatPage() {
  // ── Session & UI state ──────────────────────────────────────────────
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [runHistoryOpen, setRunHistoryOpen] = useState(false)
  const [showCommands, setShowCommands] = useState(false)
  const [showMentions, setShowMentions] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [mentionQuery, setMentionQuery] = useState('')
  const [intelligenceDismissed, setIntelligenceDismissed] = useState(false)
  const [lastRecEventId, setLastRecEventId] = useState<string | null>(null)
  const [decisionMode, setDecisionMode] = useState('balanced')
  const [evidenceTarget, setEvidenceTarget] = useState<{
    recommendationId: string
    recommendationType: string
    label: string
  } | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── tRPC queries & mutations ────────────────────────────────────────
  const sessionsQuery = trpc.intelligence.chatSessions.useQuery()
  const sessionQuery = trpc.intelligence.chatSession.useQuery(
    { id: selectedSession!, messageLimit: 100 },
    { enabled: !!selectedSession },
  )
  const agentsQuery = trpc.agents.list.useQuery({ limit: 100, offset: 0 })
  const agents: Agent[] = (agentsQuery.data ?? []) as Agent[]
  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])

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

  // ── Custom hooks ────────────────────────────────────────────────────
  const {
    streaming,
    streamEvents,
    optimisticText,
    lastRunId,
    handleSend: sendStream,
    abort,
  } = useChatStream(selectedSession, selectedAgents, utils)

  const { inspectorOpen, setInspectorOpen, inspectorSelection, handleInspect } = useInspector()

  const handleNewSession = useCallback(async () => {
    const agentId = selectedAgents[0] || undefined
    const agent = agentId ? agentMap.get(agentId) : undefined
    const session = await createSession.mutateAsync({
      agentId,
      workspaceId: agent?.workspaceId ?? undefined,
    })
    utils.intelligence.chatSessions.invalidate()
    if (session) setSelectedSession(session.id)
  }, [selectedAgents, agentMap, createSession, utils])

  const handleCreateSession = useCallback(() => {
    createSession.mutateAsync({}).catch(() => {
      /* handled by tRPC error boundary */
    })
  }, [createSession])

  useChatKeyboardShortcuts({
    streaming,
    inspectorOpen,
    showCommands,
    showMentions,
    setInspectorOpen,
    setShowCommands,
    setShowMentions,
    createSession: handleCreateSession,
    abort,
  })

  // ── Auto-scroll ─────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamEvents, streaming, optimisticText])

  // Load decision mode from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('decision-mode')
    if (saved) setDecisionMode(saved)
  }, [])

  // Reset intelligence dismissal on session change
  useEffect(() => {
    setIntelligenceDismissed(false)
    setLastRecEventId(null)
  }, [selectedSession])

  // Link recommendation event to resulting run (fire-and-forget)
  const linkRecToRun = trpc.intelligence.linkRecommendationToRun.useMutation()
  useEffect(() => {
    if (lastRunId && lastRecEventId) {
      linkRecToRun
        .mutateAsync({ eventId: lastRecEventId, resultingRunId: lastRunId })
        .catch((err) => console.warn('chat: link recommendation to run failed', err))
      setLastRecEventId(null) // Only link once
    }
  }, [lastRunId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send wrapper (reads newMessage from local state) ────────────────
  const handleSend = useCallback(() => {
    if (!newMessage.trim()) return
    const text = newMessage.trim()
    setNewMessage('')
    sendStream(text, textareaRef)
  }, [newMessage, sendStream])

  /** Retry last message with lineage tracking */
  const handleRetry = useCallback(
    (retryType: 'manual' | 'suggested' = 'manual') => {
      const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === 'user')
      if (!lastUserMsg) return
      const autonomy =
        (localStorage.getItem('autonomy-level') as 'manual' | 'assist' | 'auto') ?? 'manual'
      sendStream(lastUserMsg.text, textareaRef, {
        retryOfRunId: lastRunId ?? undefined,
        retryType,
        autonomyLevel: autonomy,
      })
    },
    [messages, lastRunId, sendStream],
  )

  /** Targeted retry: group-level */
  const handleGroupRetry = useCallback(
    (runId: string, groupId: string) => {
      const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === 'user')
      if (!lastUserMsg) return
      const autonomy =
        (localStorage.getItem('autonomy-level') as 'manual' | 'assist' | 'auto') ?? 'manual'
      sendStream(lastUserMsg.text, textareaRef, {
        retryOfRunId: runId,
        retryType: 'manual',
        retryScope: 'group',
        retryTargetId: groupId,
        retryReason: `Retry group ${groupId}`,
        autonomyLevel: autonomy,
      })
    },
    [messages, sendStream],
  )

  /** Targeted retry: step-level */
  const handleStepRetry = useCallback(
    (runId: string, stepId: string) => {
      const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === 'user')
      if (!lastUserMsg) return
      const autonomy =
        (localStorage.getItem('autonomy-level') as 'manual' | 'assist' | 'auto') ?? 'manual'
      sendStream(lastUserMsg.text, textareaRef, {
        retryOfRunId: runId,
        retryType: 'manual',
        retryScope: 'step',
        retryTargetId: stepId,
        retryReason: `Retry step ${stepId.slice(0, 8)}`,
        autonomyLevel: autonomy,
      })
    },
    [messages, sendStream],
  )

  // ── Session delete ──────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (id: string) => {
      await deleteSession.mutateAsync({ id })
      utils.intelligence.chatSessions.invalidate()
      if (selectedSession === id) setSelectedSession(null)
      setDeleteConfirm(null)
    },
    [deleteSession, utils, selectedSession],
  )

  // ── Slash commands ──────────────────────────────────────────────────
  const handleCommand = useCallback(
    (command: string) => {
      setShowCommands(false)
      setNewMessage('')
      switch (command) {
        case 'crew':
          if (agents.length > 0) {
            setSelectedAgents(agents.map((a) => a.id).slice(0, 10))
          }
          break
        case 'clear':
          createSession.mutateAsync({})
          break
        case 'retry':
          handleRetry('manual')
          break
        case 'stop':
          abort()
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
    [agents, createSession, handleRetry, abort, selectedSession, sessionQuery.data],
  )

  // ── @mention handler ────────────────────────────────────────────────
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

  // ── Textarea auto-resize ────────────────────────────────────────────
  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [])

  // ── Build thread items ──────────────────────────────────────────────
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

  const allItems = useMemo(() => [...threadItems, ...streamItems], [threadItems, streamItems])
  const groupedItems = useMemo(() => buildExecutionGroups(allItems), [allItems])

  const headerTitle = selectedSession
    ? sessionTitle(messages, currentSession?.createdAt ?? new Date())
    : 'Chat'

  // ── Error state ─────────────────────────────────────────────────────
  if (sessionsQuery.error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={sessionsQuery.error} />
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────
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
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setRunHistoryOpen(!runHistoryOpen)
              if (!runHistoryOpen) {
                setInspectorOpen(false)
                setEvidenceTarget(null)
              }
            }}
            className={`cyber-btn-sm ${runHistoryOpen ? 'cyber-btn-primary' : 'cyber-btn-secondary'} text-xs`}
          >
            History
          </button>
          <button
            onClick={() => {
              setInspectorOpen(!inspectorOpen)
              if (!inspectorOpen) {
                setRunHistoryOpen(false)
                setEvidenceTarget(null)
              }
            }}
            className={`cyber-btn-sm ${inspectorOpen ? 'cyber-btn-primary' : 'cyber-btn-secondary'} text-xs`}
          >
            Details
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left panel -- session sidebar */}
        {sidebarOpen && (
          <div className="hidden md:flex w-64 flex-shrink-0 border-r border-border bg-bg-surface flex-col overflow-hidden">
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
                          onRetryGroup={
                            lastRunId
                              ? (groupId) => handleGroupRetry(lastRunId, groupId)
                              : undefined
                          }
                          onRetryStep={
                            lastRunId ? (stepId) => handleStepRetry(lastRunId, stepId) : undefined
                          }
                        />
                      ) : (
                        <ThreadItem
                          key={i}
                          item={item as Parameters<typeof ThreadItem>[0]['item']}
                          onInspect={handleInspect}
                          onRetryStep={
                            lastRunId ? (stepId) => handleStepRetry(lastRunId, stepId) : undefined
                          }
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
                            decisionMode={decisionMode}
                            onDecisionModeChange={(mode) => {
                              setDecisionMode(mode)
                              localStorage.setItem('decision-mode', mode)
                            }}
                            onAction={(action) => {
                              if (action === 'retry') handleRetry('manual')
                              else if (action === 'retry_different') handleRetry('suggested')
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
              {/* Pre-run intelligence */}
              {selectedSession &&
                !streaming &&
                !intelligenceDismissed &&
                newMessage.length > 10 && (
                  <div className="flex-shrink-0 px-4">
                    <IntelligenceCard
                      sessionId={selectedSession}
                      userInput={newMessage}
                      agentIds={selectedAgents.length > 0 ? selectedAgents : undefined}
                      decisionMode={decisionMode}
                      onAction={(action, eventId) => {
                        if (eventId) setLastRecEventId(eventId)
                        if (action.type === 'switch_autonomy') {
                          localStorage.setItem('autonomy-level', action.payload.level as string)
                        } else if (action.type === 'inspect_evidence') {
                          setEvidenceTarget({
                            recommendationId: action.payload.recommendationId as string,
                            recommendationType: action.payload.recommendationType as string,
                            label: action.payload.recommendationLabel as string,
                          })
                          setInspectorOpen(false)
                          setRunHistoryOpen(false)
                        }
                      }}
                      onDismiss={() => setIntelligenceDismissed(true)}
                    />
                  </div>
                )}
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
                        <span className="neon-dot neon-dot-purple neon-dot-pulse" /> Multi-Agent
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
                        onClick={abort}
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

        {/* Right panel -- inspector or run history */}
        {inspectorOpen && (
          <InspectorPanel
            selection={inspectorSelection}
            onClose={() => setInspectorOpen(false)}
            onCompareWithParent={() => {
              setInspectorOpen(false)
              setRunHistoryOpen(true)
            }}
            onNavigateToRun={(runId) => {
              // Open inspector for the target run (minimal info)
              handleInspect({
                type: 'run',
                runId,
                status: 'unknown',
                agentNames: [],
                stepCount: 0,
                durationMs: null,
                startedAt: new Date(),
                memoryCount: 0,
              })
            }}
            onRetryStep={lastRunId ? (stepId) => handleStepRetry(lastRunId, stepId) : undefined}
          />
        )}
        {runHistoryOpen && selectedSession && (
          <RunHistoryPanel
            sessionId={selectedSession}
            onSelectRun={(sel) => {
              handleInspect(sel)
              setRunHistoryOpen(false)
            }}
            onCompare={() => {
              // handled internally by RunHistoryPanel
            }}
            onClose={() => setRunHistoryOpen(false)}
          />
        )}
        {evidenceTarget && selectedSession && (
          <EvidenceSheet
            recommendationId={evidenceTarget.recommendationId}
            recommendationType={evidenceTarget.recommendationType}
            label={evidenceTarget.label}
            sessionId={selectedSession}
            userInput={newMessage.length > 5 ? newMessage : undefined}
            agentIds={selectedAgents.length > 0 ? selectedAgents : undefined}
            decisionMode={decisionMode}
            onClose={() => setEvidenceTarget(null)}
            onNavigateToRun={(runId) => {
              setEvidenceTarget(null)
              handleInspect({
                type: 'run',
                runId,
                status: 'unknown',
                agentNames: [],
                stepCount: 0,
                durationMs: null,
                startedAt: new Date(),
                memoryCount: 0,
              })
            }}
          />
        )}
      </div>
    </div>
  )
}
