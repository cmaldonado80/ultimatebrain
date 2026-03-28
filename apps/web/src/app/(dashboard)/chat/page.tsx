'use client'

/**
 * Chat — modern agent chat interface with markdown rendering,
 * syntax highlighting, streaming indicators, and multi-agent crew support.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { MarkdownMessage } from '../../../components/chat/markdown-message'
import { DbErrorBanner } from '../../../components/db-error-banner'
import { trpc } from '../../../utils/trpc'

interface ChatSession {
  id: string
  agentId: string | null
  createdAt: Date
}

interface ChatMessage {
  id: string
  role: string
  text: string
  sourceAgentId: string | null
  createdAt: Date
}

interface Agent {
  id: string
  name: string
  model: string | null
  soul: string | null
  requiredModelType: string | null
  workspaceId: string | null
}

/** Deterministic color from agent name for avatar */
function agentColor(name: string): string {
  const colors = ['#00d4ff', '#8b5cf6', '#00ff88', '#ffd200', '#ff3a5c', '#f472b6', '#38bdf8']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

/** Agent avatar circle with initials */
function AgentAvatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const color = agentColor(name)
  return (
    <div
      className="flex-shrink-0 rounded-full flex items-center justify-center font-mono font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `${color}20`,
        color,
        border: `1px solid ${color}40`,
        boxShadow: `0 0 8px ${color}15`,
      }}
    >
      {initials}
    </div>
  )
}

/** Animated thinking dots */
function ThinkingIndicator({ agentName }: { agentName?: string | null }) {
  return (
    <div className="flex items-start gap-3 max-w-[80%] mb-3">
      <AgentAvatar name={agentName ?? 'AI'} />
      <div className="chat-bubble-agent">
        <div className="chat-agent-label" style={{ color: agentColor(agentName ?? 'AI') }}>
          {agentName ?? 'Assistant'}
        </div>
        <div className="flex items-center gap-1.5 py-1">
          <span className="chat-thinking-dot" style={{ animationDelay: '0ms' }} />
          <span className="chat-thinking-dot" style={{ animationDelay: '150ms' }} />
          <span className="chat-thinking-dot" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

export default function ChatPage() {
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [streamAgentName, setStreamAgentName] = useState<string | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [wsFilter, setWsFilter] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const sessionsQuery = trpc.intelligence.chatSessions.useQuery()
  const sessionQuery = trpc.intelligence.chatSession.useQuery(
    { id: selectedSession!, messageLimit: 100 },
    { enabled: !!selectedSession },
  )
  const allAgentsQuery = trpc.agents.list.useQuery(
    { limit: 100, offset: 0 },
    { enabled: !wsFilter },
  )
  const wsAgentsQuery = trpc.agents.byWorkspace.useQuery(
    { workspaceId: wsFilter || '00000000-0000-0000-0000-000000000000' },
    { enabled: !!wsFilter },
  )
  const agents = ((wsFilter ? wsAgentsQuery.data : allAgentsQuery.data) ?? []) as Agent[]
  const workspacesQuery = trpc.workspaces.list.useQuery({ limit: 100, offset: 0 })
  const createSessionMut = trpc.intelligence.createChatSession.useMutation()
  const deleteSessionMut = trpc.intelligence.deleteChatSession.useMutation()
  const utils = trpc.useUtils()

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sessionQuery.data, streamText, streaming])

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [])

  const agentMap = new Map(agents.map((a) => [a.id, a]))

  const handleNewSession = async () => {
    const primaryAgentId = selectedAgents[0] || undefined
    const primaryAgent = primaryAgentId ? agents.find((a) => a.id === primaryAgentId) : undefined
    const session = await createSessionMut.mutateAsync({
      agentId: primaryAgentId,
      workspaceId: primaryAgent?.workspaceId ?? undefined,
    })
    utils.intelligence.chatSessions.invalidate()
    if (session) setSelectedSession(session.id)
  }

  const handleDeleteSession = async (id: string) => {
    await deleteSessionMut.mutateAsync({ id })
    utils.intelligence.chatSessions.invalidate()
    if (selectedSession === id) setSelectedSession(null)
    setDeleteConfirm(null)
  }

  const handleSend = useCallback(async () => {
    if (!selectedSession || !newMessage.trim() || streaming) return
    const text = newMessage.trim()
    setNewMessage('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    setStreaming(true)
    setStreamText('')
    setStreamAgentName(null)
    setStreamError(null)

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
        setStreamError(errText)
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
            const event = JSON.parse(line.slice(6)) as {
              text?: string
              done?: boolean
              error?: string
              agentStart?: string
              agentName?: string
              type?: string
              name?: string
            }
            if (event.error) {
              setStreamError(event.error)
              break
            }
            if (event.agentStart) {
              setStreamAgentName(event.agentStart)
              setStreamText('')
            }
            if (event.text) setStreamText((prev) => prev + event.text)
            if (event.done) break
          } catch {
            /* skip malformed events */
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setStreamError((err as Error).message)
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
      await utils.intelligence.chatSession.invalidate({ id: selectedSession })
      setStreamText('')
    }
  }, [selectedSession, selectedAgents, newMessage, streaming, utils])

  if (sessionsQuery.error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={sessionsQuery.error} />
      </div>
    )
  }

  if (sessionsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-60px)]">
        <div className="text-center text-slate-500">
          <div className="text-lg mb-1">Loading...</div>
          <div className="text-xs">Fetching chat sessions</div>
        </div>
      </div>
    )
  }

  const sessions: ChatSession[] = (sessionsQuery.data as ChatSession[]) ?? []
  const sessionData = sessionQuery.data as
    | {
        messages?: {
          id: string
          role: string
          text: string
          sourceAgentId: string | null
          createdAt: Date
        }[]
      }
    | null
    | undefined
  const messages: ChatMessage[] = (sessionData?.messages ?? []) as ChatMessage[]

  const getAgentNameForMessage = (msg: ChatMessage): string => {
    if (msg.role === 'user') return 'You'
    if (msg.sourceAgentId) {
      return agentMap.get(msg.sourceAgentId)?.name ?? 'Agent'
    }
    // Try session agent
    const session = sessions.find((s) => s.id === selectedSession)
    if (session?.agentId) {
      return agentMap.get(session.agentId)?.name ?? 'Assistant'
    }
    return 'Assistant'
  }

  return (
    <div className="h-[calc(100vh-60px)] flex">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <div
        className={`chat-sidebar transition-all duration-200 ${sidebarCollapsed ? 'chat-sidebar-collapsed' : ''}`}
      >
        <div className="flex items-center justify-between mb-3 px-1">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="text-slate-500 hover:text-slate-300 text-xs"
            title={sidebarCollapsed ? 'Expand' : 'Collapse'}
          >
            {sidebarCollapsed ? '>' : '<'}
          </button>
          {!sidebarCollapsed && (
            <>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Chats
              </span>
              <button onClick={handleNewSession} className="cyber-btn-primary cyber-btn-sm">
                + New
              </button>
            </>
          )}
        </div>

        {!sidebarCollapsed && (
          <>
            {/* Workspace filter */}
            <select
              value={wsFilter}
              onChange={(e) => {
                setWsFilter(e.target.value)
                setSelectedAgents([])
              }}
              className="cyber-select cyber-select-sm w-full mb-2"
            >
              <option value="">All workspaces</option>
              {(workspacesQuery.data ?? []).map((ws: { id: string; name: string }) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>

            {/* Agent selection */}
            <div className="max-h-[140px] overflow-y-auto mb-3 space-y-0.5">
              {agents.slice(0, 30).map((a) => {
                const selected = selectedAgents.includes(a.id)
                return (
                  <label
                    key={a.id}
                    className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs transition-colors ${
                      selected
                        ? 'bg-neon-purple/10 text-neon-purple'
                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedAgents((prev) => [...prev, a.id])
                        else setSelectedAgents((prev) => prev.filter((id) => id !== a.id))
                      }}
                      className="w-3 h-3 accent-[#8b5cf6]"
                    />
                    <AgentAvatar name={a.name} size={18} />
                    <span className="truncate">{a.name}</span>
                  </label>
                )
              })}
            </div>

            {selectedAgents.length > 1 && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-neon-purple/10 border border-neon-purple/20 mb-3">
                <span className="neon-dot neon-dot-purple neon-dot-pulse" />
                <span className="text-[11px] text-neon-purple font-semibold">
                  Crew mode: {selectedAgents.length} agents
                </span>
              </div>
            )}

            {/* Session list */}
            <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-1.5 px-1">
              Sessions
            </div>
            <div className="space-y-0.5 flex-1 overflow-y-auto">
              {sessions.length === 0 ? (
                <div className="text-xs text-slate-600 text-center py-4">
                  No sessions yet. Click + New.
                </div>
              ) : (
                sessions.map((s) => {
                  const agentName = s.agentId
                    ? (agentMap.get(s.agentId)?.name ?? 'Agent')
                    : `Chat ${s.id.slice(0, 6)}`
                  const isActive = selectedSession === s.id
                  return (
                    <div
                      key={s.id}
                      className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs ${
                        isActive
                          ? 'bg-neon-blue/10 text-neon-blue border border-neon-blue/20'
                          : 'text-slate-400 hover:bg-white/5 hover:text-slate-300 border border-transparent'
                      }`}
                      onClick={() => setSelectedSession(s.id)}
                    >
                      {s.agentId && <AgentAvatar name={agentName} size={20} />}
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium">{agentName}</div>
                        <div className="text-[10px] text-slate-600">
                          {new Date(s.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (deleteConfirm === s.id) handleDeleteSession(s.id)
                          else setDeleteConfirm(s.id)
                        }}
                        className={`opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded transition-all ${
                          deleteConfirm === s.id
                            ? 'opacity-100 bg-neon-red/20 text-neon-red'
                            : 'text-slate-500 hover:text-neon-red'
                        }`}
                        title="Delete session"
                      >
                        {deleteConfirm === s.id ? 'Confirm?' : 'x'}
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Main Chat Area ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedSession ? (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="text-4xl mb-4 opacity-20">
                <span className="font-orbitron">Chat</span>
              </div>
              <p className="text-slate-500 text-sm mb-6">
                Select a session from the sidebar or create a new one to start chatting with your
                agents.
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
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 chat-messages-area">
              {messages.length === 0 && !streaming ? (
                <div className="flex items-center justify-center h-full text-slate-600 text-sm">
                  Send a message to start the conversation.
                </div>
              ) : (
                <div className="max-w-3xl mx-auto space-y-1">
                  {messages.map((m) => {
                    const name = getAgentNameForMessage(m)
                    if (m.role === 'user') {
                      return (
                        <div key={m.id} className="flex justify-end mb-3">
                          <div className="chat-bubble-user">
                            <div className="chat-markdown">
                              <p>{m.text}</p>
                            </div>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div key={m.id} className="flex items-start gap-3 max-w-[80%] mb-3">
                        <AgentAvatar name={name} />
                        <div className="chat-bubble-agent">
                          <div className="chat-agent-label" style={{ color: agentColor(name) }}>
                            {name}
                          </div>
                          <MarkdownMessage content={m.text} />
                        </div>
                      </div>
                    )
                  })}

                  {/* Streaming response */}
                  {streaming && streamText && (
                    <div className="flex items-start gap-3 max-w-[80%] mb-3">
                      <AgentAvatar name={streamAgentName ?? 'AI'} />
                      <div className="chat-bubble-agent">
                        <div
                          className="chat-agent-label"
                          style={{ color: agentColor(streamAgentName ?? 'AI') }}
                        >
                          {streamAgentName ?? 'Assistant'}
                        </div>
                        <MarkdownMessage content={streamText} />
                        <span className="chat-cursor" />
                      </div>
                    </div>
                  )}

                  {/* Thinking indicator */}
                  {streaming && !streamText && <ThinkingIndicator agentName={streamAgentName} />}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Error banner */}
            {streamError && (
              <div className="mx-4 mb-2 px-4 py-2 rounded-lg bg-neon-red/10 border border-neon-red/20 text-neon-red text-xs flex items-center justify-between">
                <span>{streamError}</span>
                <button
                  onClick={() => setStreamError(null)}
                  className="text-neon-red/60 hover:text-neon-red ml-3"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Input area */}
            <div className="border-t border-border px-4 py-3">
              <div className="max-w-3xl mx-auto flex gap-2 items-end">
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    className="cyber-input rounded-xl py-2.5 pr-4 resize-none"
                    placeholder={
                      selectedAgents.length > 1
                        ? `Message ${selectedAgents.length} agents...`
                        : 'Type a message...'
                    }
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value)
                      autoResize()
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    rows={1}
                    style={{ maxHeight: 160 }}
                  />
                </div>
                {streaming ? (
                  <button
                    className="cyber-btn-danger rounded-xl py-2.5 flex-shrink-0"
                    onClick={() => abortRef.current?.abort()}
                  >
                    Stop
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
              <div className="max-w-3xl mx-auto mt-1.5 text-[10px] text-slate-600 text-center">
                Shift+Enter for new line
                {selectedAgents.length > 0 && (
                  <span className="ml-2">
                    Talking to:{' '}
                    {selectedAgents.map((id) => agentMap.get(id)?.name ?? 'Agent').join(', ')}
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
