'use client'

/**
 * Chat — interactive chat interface for communicating with agents.
 */

import { useState, useRef, useCallback } from 'react'
import { trpc } from '../../../utils/trpc'
import { DbErrorBanner } from '../../../components/db-error-banner'

interface ChatSession {
  id: string
  agentId: string | null
  createdAt: Date
}

interface ChatMessage {
  id: string
  role: string
  text: string
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

export default function ChatPage() {
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [streamAgentName, setStreamAgentName] = useState<string | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const sessionsQuery = trpc.intelligence.chatSessions.useQuery()
  const sessionQuery = trpc.intelligence.chatSession.useQuery(
    { id: selectedSession!, messageLimit: 100 },
    { enabled: !!selectedSession },
  )
  const agentsQuery = trpc.agents.list.useQuery({ limit: 100, offset: 0 })
  const agents = (agentsQuery.data ?? []) as Agent[]
  const createSessionMut = trpc.intelligence.createChatSession.useMutation()
  const utils = trpc.useUtils()

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

  const handleSend = useCallback(async () => {
    if (!selectedSession || !newMessage.trim() || streaming) return
    const text = newMessage.trim()
    setNewMessage('')
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
        setStreamError(`Error: ${res.status}`)
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
            /* skip */
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
      // Reload messages from DB first, then clear streaming text
      await utils.intelligence.chatSession.invalidate({ id: selectedSession })
      setStreamText('')
    }
  }, [selectedSession, selectedAgents, newMessage, streaming, utils])

  if (sessionsQuery.error) {
    return (
      <div style={styles.page}>
        <DbErrorBanner error={sessionsQuery.error} />
      </div>
    )
  }

  if (sessionsQuery.isLoading) {
    return (
      <div
        style={{
          ...styles.page,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
        }}
      >
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>Loading...</div>
          <div style={{ fontSize: 13 }}>Fetching chat sessions</div>
        </div>
      </div>
    )
  }

  const sessions: ChatSession[] = (sessionsQuery.data as ChatSession[]) ?? []
  const sessionData = sessionQuery.data as
    | { messages?: { id: string; role: string; text: string; createdAt: Date }[] }
    | null
    | undefined
  const messages: ChatMessage[] = sessionData?.messages ?? []

  return (
    <div style={styles.page}>
      <div style={styles.layout}>
        {/* Sidebar */}
        <div style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <span style={styles.sidebarTitle}>Sessions</span>
            <button style={styles.newBtn} onClick={handleNewSession}>
              + New
            </button>
          </div>
          <div style={{ maxHeight: 120, overflowY: 'auto', marginBottom: 8, fontSize: 11 }}>
            {agents.slice(0, 20).map((a) => (
              <label
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 4px',
                  cursor: 'pointer',
                  color: selectedAgents.includes(a.id) ? 'var(--color-neon-purple)' : '#9ca3af',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedAgents.includes(a.id)}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedAgents((prev) => [...prev, a.id])
                    else setSelectedAgents((prev) => prev.filter((id) => id !== a.id))
                  }}
                  style={{ width: 12, height: 12 }}
                />
                {a.name}
              </label>
            ))}
            {selectedAgents.length > 1 && (
              <div
                style={{ color: 'var(--color-neon-purple)', padding: '2px 4px', fontWeight: 600 }}
              >
                Crew mode: {selectedAgents.length} agents
              </div>
            )}
          </div>
          {sessions.length === 0 ? (
            <div style={styles.sidebarEmpty}>No sessions yet.</div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                style={selectedSession === s.id ? styles.sessionActive : styles.sessionItem}
                onClick={() => setSelectedSession(s.id)}
              >
                <div style={styles.sessionLabel}>
                  {s.agentId
                    ? (agents.find((a) => a.id === s.agentId)?.name ?? 'Agent')
                    : `Session ${s.id.slice(0, 8)}`}
                </div>
                <div style={styles.sessionMeta}>{new Date(s.createdAt).toLocaleDateString()}</div>
              </div>
            ))
          )}
        </div>

        {/* Main chat area */}
        <div style={styles.main}>
          {!selectedSession ? (
            <div style={styles.noSession}>
              Select a session or create a new one to start chatting.
            </div>
          ) : sessionQuery.isLoading ? (
            <div style={styles.noSession}>Loading messages...</div>
          ) : (
            <>
              <div style={styles.messages}>
                {messages.length === 0 && !streaming ? (
                  <div style={styles.noSession}>No messages yet. Send one below.</div>
                ) : (
                  <>
                    {messages.map((m) => (
                      <div key={m.id} style={m.role === 'user' ? styles.msgUser : styles.msgAgent}>
                        <div style={styles.msgRole}>{m.role}</div>
                        <div style={styles.msgText}>{m.text}</div>
                      </div>
                    ))}
                    {streaming && streamText && (
                      <div style={styles.msgAgent}>
                        <div style={styles.msgRole}>{streamAgentName ?? 'assistant'}</div>
                        <div style={styles.msgText}>
                          {streamText}
                          <span style={{ opacity: 0.4 }}>|</span>
                        </div>
                      </div>
                    )}
                    {streaming && !streamText && (
                      <div style={styles.msgAgent}>
                        <div style={styles.msgRole}>assistant</div>
                        <div style={{ ...styles.msgText, color: '#6b7280' }}>Thinking...</div>
                      </div>
                    )}
                  </>
                )}
              </div>
              {streamError && (
                <div
                  style={{
                    padding: '8px 16px',
                    background: 'rgba(255,58,92,0.15)',
                    color: 'var(--color-neon-red)',
                    fontSize: 12,
                  }}
                >
                  {streamError}
                </div>
              )}
              <div style={styles.inputBar}>
                <input
                  style={styles.input}
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
                {streaming ? (
                  <button
                    style={{ ...styles.sendBtn, background: 'var(--color-neon-red)' }}
                    onClick={() => abortRef.current?.abort()}
                  >
                    Cancel
                  </button>
                ) : (
                  <button style={styles.sendBtn} onClick={handleSend}>
                    Send
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: { padding: 0, fontFamily: 'sans-serif', color: '#f9fafb', height: 'calc(100vh - 60px)' },
  layout: { display: 'flex', height: '100%' },
  sidebar: {
    width: 260,
    borderRight: '1px solid var(--color-border)',
    background: 'var(--color-bg-elevated)',
    padding: 12,
    overflowY: 'auto' as const,
  },
  sidebarHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sidebarTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
  },
  newBtn: {
    background: 'var(--color-neon-purple)',
    color: '#f9fafb',
    border: 'none',
    borderRadius: 4,
    padding: '3px 10px',
    fontSize: 11,
    cursor: 'pointer',
  },
  sidebarEmpty: { fontSize: 12, color: '#4b5563', padding: 12, textAlign: 'center' as const },
  sessionItem: { padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 4 },
  sessionActive: {
    padding: '8px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    marginBottom: 4,
    background: 'var(--color-bg-card)',
    backdropFilter: 'blur(12px)',
  },
  sessionLabel: { fontSize: 13, fontWeight: 600 },
  sessionMeta: { fontSize: 10, color: '#4b5563' },
  main: { flex: 1, display: 'flex', flexDirection: 'column' as const },
  noSession: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    color: '#6b7280',
    fontSize: 14,
  },
  messages: { flex: 1, overflowY: 'auto' as const, padding: 16 },
  msgUser: {
    background: 'rgba(0,212,255,0.1)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    maxWidth: '70%',
    marginLeft: 'auto',
  },
  msgAgent: {
    background: 'var(--color-bg-card)',
    backdropFilter: 'blur(12px)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    maxWidth: '70%',
  },
  msgRole: {
    fontSize: 10,
    fontWeight: 700,
    color: '#6b7280',
    marginBottom: 4,
    textTransform: 'uppercase' as const,
  },
  msgText: { fontSize: 13, lineHeight: 1.5 },
  inputBar: { display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--color-border)' },
  input: {
    flex: 1,
    background: 'var(--color-bg-card)',
    backdropFilter: 'blur(12px)',
    color: '#f9fafb',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 13,
  },
  sendBtn: {
    background: 'var(--color-neon-purple)',
    color: '#f9fafb',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
}
