'use client'

/**
 * Chat — interactive chat interface for communicating with agents.
 */

import { useState } from 'react'
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
  createdAt: Date
}

export default function ChatPage() {
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [newMessage, setNewMessage] = useState('')

  const sessionsQuery = trpc.intelligence.chatSessions.useQuery()
  const sessionQuery = trpc.intelligence.chatSession.useQuery(
    { id: selectedSession!, messageLimit: 100 },
    { enabled: !!selectedSession },
  )
  const createSessionMut = trpc.intelligence.createChatSession.useMutation()
  const sendMessageMut = trpc.intelligence.sendChatMessage.useMutation()
  const utils = trpc.useUtils()

  const handleNewSession = async () => {
    const session = await createSessionMut.mutateAsync()
    utils.intelligence.chatSessions.invalidate()
    if (session) setSelectedSession(session.id)
  }

  const handleSend = async () => {
    if (!selectedSession || !newMessage.trim() || sendMessageMut.isPending) return
    const text = newMessage.trim()
    setNewMessage('')
    await sendMessageMut.mutateAsync({
      sessionId: selectedSession,
      text,
    })
    utils.intelligence.chatSession.invalidate({ id: selectedSession })
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
      {sessionsQuery.error && (
        <div
          style={{
            background: '#1e1b4b',
            border: '1px solid #4338ca',
            borderRadius: 8,
            padding: '10px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ color: '#818cf8', fontSize: 14 }}>
            Database tables not yet provisioned.
          </span>
          <span style={{ color: '#6b7280', fontSize: 12 }}>
            Run the migration to populate data.
          </span>
        </div>
      )}
      <div style={styles.layout}>
        {/* Sidebar */}
        <div style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <span style={styles.sidebarTitle}>Sessions</span>
            <button style={styles.newBtn} onClick={handleNewSession}>
              + New
            </button>
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
                <div style={styles.sessionLabel}>Session {s.id.slice(0, 8)}</div>
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
                {messages.length === 0 ? (
                  <div style={styles.noSession}>No messages yet. Send one below.</div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} style={m.role === 'user' ? styles.msgUser : styles.msgAgent}>
                      <div style={styles.msgRole}>{m.role}</div>
                      <div style={styles.msgText}>{m.text}</div>
                    </div>
                  ))
                )}
              </div>
              {sendMessageMut.error && (
                <div
                  style={{
                    padding: '8px 16px',
                    background: '#7f1d1d',
                    color: '#fca5a5',
                    fontSize: 12,
                  }}
                >
                  {sendMessageMut.error.message}
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
                <button
                  style={styles.sendBtn}
                  onClick={handleSend}
                  disabled={sendMessageMut.isPending}
                >
                  {sendMessageMut.isPending ? 'Thinking...' : 'Send'}
                </button>
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
    borderRight: '1px solid #374151',
    background: '#111827',
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
    background: '#818cf8',
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
    background: '#1f2937',
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
    background: '#1e3a5f',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    maxWidth: '70%',
    marginLeft: 'auto',
  },
  msgAgent: {
    background: '#1f2937',
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
  inputBar: { display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #374151' },
  input: {
    flex: 1,
    background: '#1f2937',
    color: '#f9fafb',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 13,
  },
  sendBtn: {
    background: '#818cf8',
    color: '#f9fafb',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
}
