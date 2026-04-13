'use client'

/**
 * A2A Dashboard — agent-to-agent protocol cards, delegations, and external agent registry.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { trpc } from '../../../lib/trpc'

interface AgentCard {
  agentId: string
  agentName: string
  agentStatus: string
  endpoint: string | null
  capabilities: unknown
}

interface ExternalAgent {
  url: string
  name?: string
  skills?: string[]
  status?: string
}

export default function A2APage() {
  const [discoverSkill, setDiscoverSkill] = useState('')
  const [showExternal, setShowExternal] = useState(false)

  const cardsQuery = trpc.a2a.cards.useQuery()
  const externalQuery = trpc.a2a.listExternal.useQuery()
  const utils = trpc.useUtils()

  const generateAllMut = trpc.a2a.generateAllCards.useMutation({
    onSuccess: () => utils.a2a.cards.invalidate(),
  })

  const healthCheckMut = trpc.a2a.healthCheckAll.useMutation({
    onSuccess: () => utils.a2a.listExternal.invalidate(),
  })

  const error = cardsQuery.error || externalQuery.error

  if (error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  if (cardsQuery.isLoading) {
    return <LoadingState message="Loading A2A protocol..." />
  }

  const cards = (cardsQuery.data ?? []) as AgentCard[]
  const external = (externalQuery.data ?? []) as ExternalAgent[]

  const filteredCards = discoverSkill
    ? cards.filter((c) => c.agentName.toLowerCase().includes(discoverSkill.toLowerCase()))
    : cards

  return (
    <div className="p-6 text-slate-50">
      <PageHeader title="A2A Protocol" />

      <div className="flex gap-2 mb-4">
        <button
          className="cyber-btn-primary"
          onClick={() =>
            generateAllMut.mutate({
              baseUrl:
                typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
            })
          }
          disabled={generateAllMut.isPending}
        >
          {generateAllMut.isPending ? 'Generating...' : 'Generate All Cards'}
        </button>
        <button className="cyber-btn-secondary" onClick={() => setShowExternal(!showExternal)}>
          External ({external.length})
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="cyber-card p-3 text-center">
          <div className="text-xl font-bold text-neon-blue font-orbitron">{cards.length}</div>
          <div className="text-[10px] text-slate-500">Agent Cards</div>
        </div>
        <div className="cyber-card p-3 text-center">
          <div className="text-xl font-bold text-neon-purple font-orbitron">{external.length}</div>
          <div className="text-[10px] text-slate-500">External Agents</div>
        </div>
      </div>

      {/* External Agents */}
      {showExternal && (
        <div className="cyber-card p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-orbitron text-white">External Agent Registry</h3>
            <button
              className="cyber-btn-secondary cyber-btn-xs"
              onClick={() => healthCheckMut.mutate()}
              disabled={healthCheckMut.isPending}
            >
              {healthCheckMut.isPending ? 'Checking...' : 'Health Check All'}
            </button>
          </div>
          {external.length === 0 ? (
            <div className="text-xs text-slate-600 py-3 text-center">
              No external agents registered
            </div>
          ) : (
            <div className="space-y-2">
              {external.map((e) => (
                <div
                  key={e.url}
                  className="flex items-center justify-between py-2 border-b border-border-dim last:border-0"
                >
                  <div>
                    <span className="text-xs text-slate-200 font-medium">{e.name ?? 'Agent'}</span>
                    <span className="text-[10px] text-slate-500 ml-2 font-mono">{e.url}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {e.skills && e.skills.length > 0 && (
                      <span className="text-[9px] text-slate-500">
                        {e.skills.slice(0, 3).join(', ')}
                      </span>
                    )}
                    <span
                      className={`neon-dot ${e.status === 'healthy' ? 'neon-dot-green' : 'neon-dot-red'}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Agent Cards */}
      <div className="mb-3">
        <input
          className="cyber-input w-full"
          placeholder="Discover by skill (e.g. typescript, api-design, docker)..."
          value={discoverSkill}
          onChange={(e) => setDiscoverSkill(e.target.value)}
        />
      </div>

      {filteredCards.length === 0 ? (
        <div className="text-center text-slate-600 py-10 text-sm">
          {discoverSkill
            ? `No agents with skill "${discoverSkill}"`
            : 'No agent cards registered. Click "Generate All Cards" to create them.'}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {filteredCards.map((card) => (
            <div key={card.agentId} className="cyber-card p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-white">{card.agentName}</span>
                <span
                  className={`neon-dot ${
                    card.agentStatus === 'idle'
                      ? 'neon-dot-green'
                      : card.agentStatus === 'error'
                        ? 'neon-dot-red'
                        : card.agentStatus === 'executing'
                          ? 'neon-dot-blue neon-dot-pulse'
                          : 'neon-dot-yellow'
                  }`}
                />
              </div>
              <div className="text-[10px] text-slate-500 font-mono mb-1">
                {card.agentId.slice(0, 12)}...
              </div>
              {card.endpoint && (
                <div className="text-[9px] text-slate-600 font-mono">{card.endpoint}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
