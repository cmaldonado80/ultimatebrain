'use client'

/**
 * Intelligence Hub — knowledge accumulation, chat sessions, memory, and agent insights.
 */

import Link from 'next/link'
import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatCard } from '../../../components/ui/stat-card'
import { trpc } from '../../../utils/trpc'

function DocumentUploadCard() {
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ chunksStored: number; documentName: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  async function handleUpload() {
    setStatus('uploading')
    try {
      let res: Response
      if (file) {
        // File upload via FormData
        const formData = new FormData()
        formData.append('file', file)
        if (name.trim()) formData.append('name', name.trim())
        res = await fetch('/api/documents/upload', { method: 'POST', body: formData })
      } else if (name.trim() && content.trim()) {
        // Text paste via JSON (backwards compatible)
        res = await fetch('/api/documents/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), content }),
        })
      } else {
        return
      }
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setResult(data)
      setStatus('done')
      setName('')
      setContent('')
      setFile(null)
    } catch {
      setStatus('error')
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) {
      setFile(dropped)
      if (!name.trim()) setName(dropped.name.replace(/\.[^.]+$/, ''))
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      if (!name.trim()) setName(selected.name.replace(/\.[^.]+$/, ''))
    }
  }

  const canUpload = status !== 'uploading' && (file || (name.trim() && content.trim()))

  return (
    <div className="cyber-card p-6 text-center border-dashed">
      <div className="text-slate-500 text-sm mb-2">Document Ingestion</div>
      <p className="text-xs text-slate-600 mb-3">
        Upload files or paste text for your agents to learn from.
      </p>
      <div className="space-y-2 max-w-md mx-auto text-left">
        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-neon-blue/50 bg-neon-blue/5'
              : 'border-border-dim hover:border-border'
          }`}
          onClick={() => document.getElementById('doc-file-input')?.click()}
        >
          <input
            id="doc-file-input"
            type="file"
            accept=".pdf,.txt,.md,.csv,.html,.json,.yaml,.yml,.xml,.log,.docx"
            onChange={handleFileSelect}
            className="hidden"
          />
          {file ? (
            <div className="text-xs">
              <span className="text-neon-blue font-medium">{file.name}</span>
              <span className="text-slate-600 ml-2">({(file.size / 1024).toFixed(1)} KB)</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setFile(null)
                }}
                className="ml-2 text-slate-500 hover:text-neon-red transition-colors"
              >
                remove
              </button>
            </div>
          ) : (
            <div className="text-[10px] text-slate-600">
              Drop a file here or click to browse
              <br />
              <span className="text-slate-700">PDF, TXT, MD, CSV, HTML, JSON (max 10MB)</span>
            </div>
          )}
        </div>

        {/* Name override */}
        <input
          type="text"
          placeholder="Document name (optional for files)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-1.5 bg-bg-deep border border-border-dim rounded text-xs text-slate-200 placeholder:text-slate-600"
        />

        {/* Text paste fallback (collapsed when file is selected) */}
        {!file && (
          <textarea
            placeholder="Or paste document content here..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className="w-full px-3 py-1.5 bg-bg-deep border border-border-dim rounded text-xs text-slate-200 placeholder:text-slate-600 resize-y"
          />
        )}

        <button
          onClick={handleUpload}
          disabled={!canUpload}
          className="cyber-btn-primary cyber-btn-sm w-full"
        >
          {status === 'uploading'
            ? 'Processing...'
            : file
              ? `Upload ${file.name}`
              : 'Upload Document'}
        </button>
        {status === 'done' && result && (
          <div className="text-xs text-neon-green">
            Stored {result.chunksStored} chunks from &ldquo;{result.documentName}&rdquo;
          </div>
        )}
        {status === 'error' && (
          <div className="text-xs text-red-400">Upload failed. Please try again.</div>
        )}
      </div>
    </div>
  )
}

export default function IntelligencePage() {
  const sessionsQuery = trpc.intelligence.chatSessions.useQuery()
  const memoryQuery = trpc.memory.list.useQuery({ limit: 10, offset: 0 })
  const agentsQuery = trpc.agents.list.useQuery({ limit: 500, offset: 0 })

  const error = sessionsQuery.error || memoryQuery.error
  if (error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  const isLoading = sessionsQuery.isLoading
  if (isLoading) {
    return <LoadingState message="Loading Intelligence Hub..." />
  }

  const sessions = (sessionsQuery.data ?? []) as Array<{
    id: string
    agentId: string | null
    createdAt: Date
  }>
  const memories = (memoryQuery.data ?? []) as Array<{
    id: string
    content: string
    tier: string
    createdAt: Date
  }>
  const agents = (agentsQuery.data ?? []) as Array<{
    id: string
    name: string
    type: string | null
    model: string | null
    soul: string | null
  }>

  const agentsByType: Record<string, number> = {}
  for (const a of agents) {
    const t = a.type ?? 'untyped'
    agentsByType[t] = (agentsByType[t] ?? 0) + 1
  }

  const agentsWithSouls = agents.filter((a) => a.soul && a.soul.length > 10).length
  const recentSessions = sessions.slice(0, 10)

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Intelligence Hub"
        subtitle="Knowledge, conversations, and agent capabilities"
      />

      {/* Stats */}
      <PageGrid cols="4">
        <StatCard label="Chat Sessions" value={sessions.length} color="blue" />
        <StatCard label="Memory Entries" value={`${memories.length}+`} color="purple" />
        <StatCard label="Total Agents" value={agents.length} color="green" />
        <StatCard label="Agents with Souls" value={agentsWithSouls} color="blue" />
      </PageGrid>

      <PageGrid cols="2">
        {/* The Hub — Recent Sessions */}
        <SectionCard variant="intelligence">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-orbitron text-white">The Hub</h3>
            <Link href="/chat" className="cyber-btn-primary cyber-btn-xs no-underline">
              New Chat
            </Link>
          </div>
          {recentSessions.length === 0 ? (
            <div className="text-xs text-slate-600 py-4 text-center">
              No conversations yet. Start a chat to build knowledge.
            </div>
          ) : (
            <div className="space-y-2">
              {recentSessions.map((s) => {
                const agent = agents.find((a) => a.id === s.agentId)
                return (
                  <Link
                    key={s.id}
                    href="/chat"
                    className="flex items-center gap-2 py-1.5 border-b border-border-dim last:border-0 no-underline hover:bg-bg-elevated/50 rounded px-1 -mx-1 transition-colors"
                  >
                    <div className="neon-dot neon-dot-blue" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-200">
                        {agent ? agent.name : 'Direct Chat'}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </SectionCard>

        {/* The Architect — Agent Capabilities */}
        <SectionCard variant="intelligence">
          <h3 className="text-sm font-orbitron text-white mb-3">The Architect</h3>
          <p className="text-xs text-slate-400 mb-3">
            Agent fleet by type &mdash; {agents.length} total agents
          </p>
          <div className="space-y-2">
            {Object.entries(agentsByType)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 10)
              .map(([type, count]) => (
                <div key={type} className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-slate-300">{type}</span>
                      <span className="text-[10px] text-slate-500">{count}</span>
                    </div>
                    <div className="h-1 bg-bg-deep rounded-full overflow-hidden">
                      <div
                        className="h-full bg-neon-purple rounded-full"
                        style={{ width: `${(count / agents.length) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </SectionCard>
      </PageGrid>

      {/* Memory Timeline */}
      <SectionCard variant="intelligence">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-orbitron text-white">Recent Memory</h3>
          <Link
            href="/memory"
            className="text-[10px] text-neon-blue hover:text-neon-blue/80 no-underline"
          >
            View all →
          </Link>
        </div>
        {memories.length === 0 ? (
          <div className="text-xs text-slate-600 py-4 text-center">
            No memories stored yet. Agent conversations will accumulate knowledge here.
          </div>
        ) : (
          <div className="space-y-2">
            {memories.map((m) => (
              <div
                key={m.id}
                className="flex items-start gap-2 py-1.5 border-b border-border-dim last:border-0"
              >
                <span className="cyber-badge text-[9px] bg-neon-purple/20 text-neon-purple mt-0.5">
                  {m.tier}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-200 line-clamp-2">{m.content}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Document Upload */}
      <DocumentUploadCard />
    </div>
  )
}
