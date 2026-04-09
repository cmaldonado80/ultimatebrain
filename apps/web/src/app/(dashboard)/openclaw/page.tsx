'use client'

/**
 * OpenClaw Admin Dashboard — gateway status, providers, channels, skills, MCP servers.
 * Route: /openclaw
 */

import Link from 'next/link'

import { LoadingState } from '../../../components/ui/loading-state'
import { PageGrid } from '../../../components/ui/page-grid'
import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatCard } from '../../../components/ui/stat-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

export default function OpenClawDashboard() {
  const capQuery = trpc.entities.openclawCapabilities.useQuery(undefined, {
    staleTime: 30_000,
  })

  if (capQuery.isLoading) {
    return <LoadingState message="Checking OpenClaw gateway..." />
  }

  const data = capQuery.data as {
    connected: boolean
    version: string | null
    lastSeen: string | null
    providers: string[]
    channels: string[]
    skills: Array<{ name: string; description: string }>
    mcpServers: Array<{ name: string; tools: string[] }>
  } | null

  const connected = data?.connected ?? false

  return (
    <div className="p-6 text-slate-50 max-w-[900px]">
      <PageHeader
        title="OpenClaw Gateway"
        subtitle="Universal LLM/tool/channel gateway — 20+ providers, 26+ channels, 67+ skills"
        actions={
          <StatusBadge
            label={connected ? 'Connected' : 'Disconnected'}
            color={connected ? 'green' : 'slate'}
            dot
            pulse={connected}
          />
        }
      />

      {/* Stats */}
      <PageGrid cols="4" className="mb-6">
        <StatCard
          label="Providers"
          value={data?.providers?.length ?? 0}
          color="blue"
          sub="LLM providers"
        />
        <StatCard
          label="Channels"
          value={data?.channels?.length ?? 0}
          color="purple"
          sub="Messaging platforms"
        />
        <StatCard
          label="Skills"
          value={data?.skills?.length ?? 0}
          color="green"
          sub="Agent capabilities"
        />
        <StatCard
          label="MCP Servers"
          value={data?.mcpServers?.length ?? 0}
          color="blue"
          sub="Tool servers"
        />
      </PageGrid>

      {!connected && (
        <SectionCard variant="warning" className="mb-6">
          <div className="text-sm text-neon-yellow font-medium mb-2">OpenClaw Not Connected</div>
          <div className="text-[12px] text-slate-400 leading-relaxed">
            The OpenClaw gateway daemon is not running or not reachable. To enable:
          </div>
          <ol className="text-[12px] text-slate-400 mt-2 ml-4 space-y-1 list-decimal">
            <li>
              Install: <code className="text-slate-300">npm install -g openclaw@latest</code>
            </li>
            <li>
              Run: <code className="text-slate-300">openclaw daemon --port 18789</code>
            </li>
            <li>
              Set env: <code className="text-slate-300">OPENCLAW_WS=ws://localhost:18789</code>
            </li>
          </ol>
        </SectionCard>
      )}

      {/* Providers */}
      <SectionCard title="LLM Providers" className="mb-6">
        {(data?.providers ?? []).length === 0 ? (
          <div className="text-[12px] text-slate-500 text-center py-4">
            {connected ? 'No providers discovered' : 'Connect OpenClaw to see providers'}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {data!.providers.map((p) => (
              <span
                key={p}
                className="text-[10px] px-2 py-1 rounded bg-neon-blue/10 text-neon-blue border border-neon-blue/20"
              >
                {p}
              </span>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Channels */}
      <SectionCard title="Messaging Channels" className="mb-6">
        {(data?.channels ?? []).length === 0 ? (
          <div className="text-[12px] text-slate-500 text-center py-4">
            {connected ? 'No channels configured' : 'Connect OpenClaw to see channels'}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {data!.channels.map((ch) => (
              <span
                key={ch}
                className="text-[10px] px-2 py-1 rounded bg-neon-purple/10 text-neon-purple border border-neon-purple/20"
              >
                {ch}
              </span>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Skills */}
      <SectionCard title="Skills" className="mb-6">
        {(data?.skills ?? []).length === 0 ? (
          <div className="text-[12px] text-slate-500 text-center py-4">
            {connected ? 'No skills discovered' : 'Connect OpenClaw to see skills'}
          </div>
        ) : (
          <div className="space-y-1.5">
            {data!.skills.slice(0, 20).map((s) => (
              <div
                key={s.name}
                className="flex items-center gap-2 bg-bg-elevated rounded px-3 py-2"
              >
                <span className="text-[11px] text-neon-teal font-medium">{s.name}</span>
                <span className="text-[10px] text-slate-500 flex-1 truncate">{s.description}</span>
              </div>
            ))}
            {data!.skills.length > 20 && (
              <div className="text-[10px] text-slate-500 text-center pt-1">
                + {data!.skills.length - 20} more skills
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* MCP Servers */}
      <SectionCard title="MCP Servers" className="mb-6">
        {(data?.mcpServers ?? []).length === 0 ? (
          <div className="text-[12px] text-slate-500 text-center py-4">
            {connected ? 'No MCP servers discovered' : 'Connect OpenClaw to see MCP servers'}
          </div>
        ) : (
          <div className="space-y-1.5">
            {data!.mcpServers.map((server) => (
              <div key={server.name} className="bg-bg-elevated rounded px-3 py-2">
                <div className="text-[11px] text-neon-green font-medium mb-1">{server.name}</div>
                <div className="flex flex-wrap gap-1">
                  {server.tools.slice(0, 8).map((tool) => (
                    <span
                      key={tool}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-500"
                    >
                      {tool}
                    </span>
                  ))}
                  {server.tools.length > 8 && (
                    <span className="text-[9px] text-slate-600">+{server.tools.length - 8}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Quick Links */}
      <SectionCard title="Quick Links">
        <div className="flex flex-wrap gap-2">
          <Link href="/settings" className="cyber-btn-secondary cyber-btn-sm no-underline">
            Settings
          </Link>
          <Link href="/integrations" className="cyber-btn-secondary cyber-btn-sm no-underline">
            Integrations
          </Link>
          <Link href="/openclaw/mcp" className="cyber-btn-secondary cyber-btn-sm no-underline">
            MCP Tools
          </Link>
          <Link href="/skills" className="cyber-btn-secondary cyber-btn-sm no-underline">
            Skill Store
          </Link>
        </div>
      </SectionCard>
    </div>
  )
}
