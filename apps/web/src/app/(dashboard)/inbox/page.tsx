'use client'

/**
 * Agent Inbox — View all inter-agent communication.
 * The corporate email system for AI employees.
 */

import { useState } from 'react'

import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

export default function InboxPage() {
  const [filterAgent, setFilterAgent] = useState('')
  const messagesQuery = trpc.agents.messages.useQuery(
    filterAgent ? { agentId: filterAgent, limit: 50 } : { limit: 50 },
  )
  const agentsQuery = trpc.agents.list.useQuery({ limit: 200, offset: 0 })

  if (messagesQuery.isLoading) return <LoadingState message="Loading Agent Inbox..." />

  const messages = (messagesQuery.data ?? []) as unknown as Array<{
    id: string
    fromAgentId: string
    toAgentId: string
    fromAgentName: string
    toAgentName: string
    text: string
    read: boolean
    ackStatus: string
    createdAt: string
  }>

  const agentList = (agentsQuery.data ?? []) as Array<{ id: string; name: string }>

  const unreadCount = messages.filter((m) => !m.read).length

  return (
    <div className="p-6 text-slate-50">
      <PageHeader
        title="Agent Inbox"
        subtitle={`Corporate communication — ${messages.length} messages${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      />

      {/* Filter */}
      <div className="flex gap-2 mb-6">
        <select
          value={filterAgent}
          onChange={(e) => setFilterAgent(e.target.value)}
          className="bg-bg-elevated border border-border-dim rounded px-3 py-1.5 text-sm text-slate-200 focus:border-neon-teal focus:outline-none"
        >
          <option value="">All agents</option>
          {agentList.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <div className="text-[10px] text-slate-500 self-center">
          {messages.length} messages &middot; {unreadCount} unread
        </div>
      </div>

      {/* Messages */}
      <SectionCard title="Messages">
        {messages.length === 0 ? (
          <div className="text-xs text-slate-600 py-6 text-center">
            No agent messages yet. Agents use sessions_send to communicate.
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`bg-bg-deep rounded px-4 py-3 ${!msg.read ? 'border-l-2 border-neon-teal' : ''}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] text-neon-teal font-medium">
                    {msg.fromAgentName}
                  </span>
                  <span className="text-[10px] text-slate-600">→</span>
                  <span className="text-[11px] text-neon-purple font-medium">
                    {msg.toAgentName}
                  </span>
                  {!msg.read && <StatusBadge label="unread" color="teal" />}
                  <StatusBadge
                    label={msg.ackStatus}
                    color={
                      msg.ackStatus === 'acknowledged'
                        ? 'green'
                        : msg.ackStatus === 'pending'
                          ? 'yellow'
                          : 'slate'
                    }
                  />
                  <span className="text-[9px] text-slate-600 ml-auto">
                    {new Date(msg.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 whitespace-pre-wrap">
                  {msg.text.slice(0, 1000)}
                  {msg.text.length > 1000 && '...'}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
