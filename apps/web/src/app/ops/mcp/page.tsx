'use client'

/**
 * MCP Tools — browse registered tools, manage external servers, and test tool calls.
 */

import { useState } from 'react'
import { trpc } from '../../../utils/trpc'
import { DbErrorBanner } from '../../../components/db-error-banner'

interface McpTool {
  name: string
  description?: string
  parameters?: Record<string, unknown>
  server?: string
}

interface ExternalServer {
  name: string
  url: string
  transport?: string
  enabled?: boolean
  toolCount?: number
}

export default function McpPage() {
  const [search, setSearch] = useState('')
  const [serverUrl, setServerUrl] = useState('')
  const [serverName, setServerName] = useState('')
  const [showAddServer, setShowAddServer] = useState(false)

  const toolsQuery = trpc.mcp.listTools.useQuery()
  const serversQuery = trpc.mcp.listExternalServers.useQuery()
  const statsQuery = trpc.mcp.stats.useQuery()
  const utils = trpc.useUtils()

  const addServerMut = trpc.mcp.addExternalServer.useMutation({
    onSuccess: () => {
      utils.mcp.listExternalServers.invalidate()
      utils.mcp.listTools.invalidate()
      setShowAddServer(false)
      setServerUrl('')
      setServerName('')
    },
  })

  const removeServerMut = trpc.mcp.removeExternalServer.useMutation({
    onSuccess: () => {
      utils.mcp.listExternalServers.invalidate()
      utils.mcp.listTools.invalidate()
    },
  })

  const refreshMut = trpc.mcp.refreshDiscovery.useMutation({
    onSuccess: () => {
      utils.mcp.listTools.invalidate()
      utils.mcp.stats.invalidate()
    },
  })

  const error = toolsQuery.error || serversQuery.error

  if (error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (toolsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-500">
          <div className="text-lg font-orbitron">Loading MCP tools...</div>
        </div>
      </div>
    )
  }

  const allTools = (toolsQuery.data ?? []) as McpTool[]
  const tools = search
    ? allTools.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.description?.toLowerCase().includes(search.toLowerCase()),
      )
    : allTools
  const servers = (serversQuery.data ?? []) as ExternalServer[]
  const stats = statsQuery.data as { totalTools?: number; servers?: number } | null

  return (
    <div className="p-6 text-slate-50">
      <div className="mb-5">
        <div className="flex justify-between items-center">
          <h2 className="m-0 text-[22px] font-bold font-orbitron">MCP Tools</h2>
          <div className="flex gap-2">
            <button
              className="cyber-btn-secondary"
              onClick={() => refreshMut.mutate()}
              disabled={refreshMut.isPending}
            >
              {refreshMut.isPending ? 'Refreshing...' : 'Refresh Discovery'}
            </button>
            <button className="cyber-btn-primary" onClick={() => setShowAddServer(!showAddServer)}>
              {showAddServer ? 'Cancel' : '+ Add Server'}
            </button>
          </div>
        </div>
        <p className="mt-1 mb-0 text-xs text-slate-500">
          Browse registered MCP tools, manage external servers, and test tool execution.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="cyber-card p-3 text-center">
          <div className="text-xl font-bold text-neon-blue font-orbitron">{allTools.length}</div>
          <div className="text-[10px] text-slate-500">Tools</div>
        </div>
        <div className="cyber-card p-3 text-center">
          <div className="text-xl font-bold text-neon-purple font-orbitron">{servers.length}</div>
          <div className="text-[10px] text-slate-500">External Servers</div>
        </div>
        <div className="cyber-card p-3 text-center">
          <div className="text-xl font-bold text-neon-green font-orbitron">
            {stats?.totalTools ?? allTools.length}
          </div>
          <div className="text-[10px] text-slate-500">Total Registered</div>
        </div>
      </div>

      {/* Add Server Form */}
      {showAddServer && (
        <div className="cyber-card p-4 mb-4">
          <div className="flex gap-2">
            <input
              className="cyber-input flex-1"
              placeholder="Server name..."
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
            />
            <input
              className="cyber-input flex-[2]"
              placeholder="Server URL (e.g. http://localhost:3001)..."
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
            />
            <button
              className="cyber-btn-primary flex-shrink-0"
              onClick={() =>
                serverName.trim() &&
                serverUrl.trim() &&
                addServerMut.mutate({
                  name: serverName.trim(),
                  url: serverUrl.trim(),
                  transport: 'http-sse' as const,
                })
              }
              disabled={addServerMut.isPending || !serverName.trim() || !serverUrl.trim()}
            >
              {addServerMut.isPending ? 'Adding...' : 'Add'}
            </button>
          </div>
          {addServerMut.error && (
            <div className="text-neon-red text-[11px] mt-2">{addServerMut.error.message}</div>
          )}
        </div>
      )}

      {/* External Servers */}
      {servers.length > 0 && (
        <div className="cyber-card p-4 mb-4">
          <h3 className="text-sm font-orbitron text-white mb-3">External Servers</h3>
          <div className="space-y-2">
            {servers.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between py-2 border-b border-border-dim last:border-0"
              >
                <div>
                  <span className="text-xs text-slate-200 font-medium">{s.name}</span>
                  <span className="text-[10px] text-slate-500 ml-2 font-mono">{s.url}</span>
                  {s.transport && (
                    <span className="cyber-badge text-[8px] ml-2">{s.transport}</span>
                  )}
                </div>
                <button
                  className="text-[10px] text-slate-600 hover:text-neon-red transition-colors"
                  onClick={() => removeServerMut.mutate({ name: s.name })}
                  disabled={removeServerMut.isPending}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tools Search + List */}
      <input
        className="cyber-input w-full mb-4"
        placeholder="Search tools..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {tools.length === 0 ? (
        <div className="text-center text-slate-600 py-10 text-sm">
          {search ? `No tools matching "${search}"` : 'No MCP tools registered yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
          {tools.map((tool) => (
            <div key={tool.name} className="cyber-card p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-neon-blue font-mono">{tool.name}</span>
                {tool.server && <span className="cyber-badge text-[8px]">{tool.server}</span>}
              </div>
              {tool.description && (
                <div className="text-[11px] text-slate-400 leading-relaxed">{tool.description}</div>
              )}
              {tool.parameters && Object.keys(tool.parameters).length > 0 && (
                <div className="mt-1.5 text-[10px] text-slate-600 font-mono">
                  params: {Object.keys(tool.parameters).join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
