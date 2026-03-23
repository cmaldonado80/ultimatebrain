'use client'

/**
 * Single App View — detailed dashboard for a connected Mini Brain or Development
 *
 * Shows: health score, connected engines + usage, active agents,
 * recent incidents, LLM cost, scoped memory entries.
 */

import { useState } from 'react'

interface AppDetail {
  id: string
  name: string
  tier: 'mini_brain' | 'development'
  template: string
  domain: string
  url: string
  healthScore: number
  status: 'running' | 'degraded' | 'offline'
  engines: EngineUsage[]
  agents: AppAgent[]
  incidents: AppIncident[]
  llmCost: { last7d: number; last30d: number; trend: number }
  memoryEntries: { total: number; working: number; episodic: number; archival: number }
}

interface EngineUsage { id: string; name: string; requests: number; errors: number; avgMs: number; status: string }
interface AppAgent { id: string; name: string; role: string; status: 'active' | 'idle' | 'error'; currentTask?: string }
interface AppIncident { id: string; severity: string; message: string; detectedAt: Date; resolvedAt?: Date; resolution?: string }

const MOCK_APP: AppDetail = {
  id: 'mb-2',
  name: 'Hotel Ops Brain',
  tier: 'mini_brain',
  template: 'hospitality',
  domain: 'Hotels',
  url: 'http://localhost:3102',
  healthScore: 0.89,
  status: 'running',
  engines: [
    { id: 'llm', name: 'LLM Gateway', requests: 12400, errors: 23, avgMs: 890, status: 'healthy' },
    { id: 'memory', name: 'Memory', requests: 8900, errors: 5, avgMs: 45, status: 'healthy' },
    { id: 'a2a', name: 'A2A Protocol', requests: 340, errors: 2, avgMs: 120, status: 'healthy' },
    { id: 'healing', name: 'Self-Healing', requests: 890, errors: 0, avgMs: 30, status: 'healthy' },
    { id: 'guardrails', name: 'Guardrails', requests: 4200, errors: 12, avgMs: 65, status: 'degraded' },
    { id: 'eval', name: 'Evaluations', requests: 180, errors: 1, avgMs: 2100, status: 'healthy' },
  ],
  agents: [
    { id: 'a1', name: 'CEO', role: 'Strategic oversight', status: 'idle' },
    { id: 'a2', name: 'COO', role: 'Operations', status: 'active', currentTask: 'Analyzing Q1 occupancy trends' },
    { id: 'a3', name: 'CFO', role: 'Financial analysis', status: 'active', currentTask: 'Preparing monthly P&L report' },
    { id: 'a4', name: 'GM', role: 'General management', status: 'active', currentTask: 'Guest complaint resolution T-089' },
    { id: 'a5', name: 'F&B Director', role: 'Food & beverage', status: 'idle' },
    { id: 'a6', name: 'HR', role: 'Human resources', status: 'idle' },
    { id: 'a7', name: 'Sales', role: 'Revenue', status: 'active', currentTask: 'Corporate rate proposal for Acme Corp' },
  ],
  incidents: [
    { id: 'i1', severity: 'medium', message: 'Guardrails engine latency spike (>500ms)', detectedAt: new Date(Date.now() - 3600_000), resolvedAt: new Date(Date.now() - 1800_000), resolution: 'Auto-scaled guardrail workers' },
    { id: 'i2', severity: 'low', message: 'Memory tier promotion backlog (>100 entries)', detectedAt: new Date(Date.now() - 7200_000), resolvedAt: new Date(Date.now() - 5400_000), resolution: 'Batch promoted 142 entries' },
  ],
  llmCost: { last7d: 98.40, last30d: 387.20, trend: -0.05 },
  memoryEntries: { total: 3420, working: 180, episodic: 1240, archival: 2000 },
}

function HealthRing({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = pct >= 90 ? '#22c55e' : pct >= 70 ? '#f97316' : '#ef4444'
  return (
    <div style={styles.ring}>
      <span style={{ ...styles.ringValue, color }}>{pct}</span>
      <span style={styles.ringLabel}>Health</span>
    </div>
  )
}

export default function AppDetailPage() {
  const app = MOCK_APP
  const activeAgents = app.agents.filter((a) => a.status === 'active')

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <a href="/apps" style={styles.back}>← Apps</a>
        <div style={styles.headerMain}>
          <div>
            <h1 style={styles.title}>{app.name}</h1>
            <div style={styles.headerMeta}>
              <span style={styles.tierBadge}>{app.tier === 'mini_brain' ? 'Mini Brain' : 'Development'}</span>
              <span style={styles.metaText}>{app.domain} · {app.template}</span>
              <span style={styles.metaText}>{app.url}</span>
            </div>
          </div>
          <HealthRing score={app.healthScore} />
        </div>
      </div>

      {/* Stats row */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statBig}>{app.engines.length}</div>
          <div style={styles.statLabel}>Engines</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statBig}>{activeAgents.length}/{app.agents.length}</div>
          <div style={styles.statLabel}>Active Agents</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statBig, color: app.incidents.length > 0 ? '#f87171' : '#4ade80' }}>{app.incidents.length}</div>
          <div style={styles.statLabel}>Incidents</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statBig}>${app.llmCost.last30d.toFixed(0)}</div>
          <div style={styles.statLabel}>LLM Cost (30d)</div>
          <div style={{ fontSize: 10, color: app.llmCost.trend < 0 ? '#4ade80' : '#f87171' }}>
            {app.llmCost.trend < 0 ? '↓' : '↑'} {Math.abs(app.llmCost.trend * 100).toFixed(0)}% vs prior
          </div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statBig}>{app.memoryEntries.total.toLocaleString()}</div>
          <div style={styles.statLabel}>Memories</div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>
            W:{app.memoryEntries.working} E:{app.memoryEntries.episodic} A:{app.memoryEntries.archival}
          </div>
        </div>
      </div>

      <div style={styles.columns}>
        {/* Left: Engines + Agents */}
        <div style={styles.colLeft}>
          {/* Engines */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>Connected Engines</div>
            {app.engines.map((e) => (
              <div key={e.id} style={styles.engineRow}>
                <span style={{ ...styles.eDot, background: e.status === 'healthy' ? '#22c55e' : '#f97316' }} />
                <span style={styles.eName}>{e.name}</span>
                <span style={styles.eStat}>{e.requests.toLocaleString()} req</span>
                <span style={styles.eStat}>{e.errors} err</span>
                <span style={styles.eStat}>{e.avgMs}ms</span>
              </div>
            ))}
          </div>

          {/* Agents */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>Agents ({app.agents.length})</div>
            {app.agents.map((a) => (
              <div key={a.id} style={styles.agentRow}>
                <span style={{ ...styles.aDot, background: a.status === 'active' ? '#22c55e' : a.status === 'idle' ? '#6b7280' : '#ef4444' }} />
                <div style={styles.agentInfo}>
                  <div style={styles.agentName}>{a.name} <span style={styles.agentRole}>({a.role})</span></div>
                  {a.currentTask && <div style={styles.agentTask}>{a.currentTask}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Incidents */}
        <div style={styles.colRight}>
          <div style={styles.section}>
            <div style={styles.sectionHeader}>Recent Incidents</div>
            {app.incidents.length === 0 ? (
              <div style={styles.emptyText}>No incidents</div>
            ) : (
              app.incidents.map((inc) => (
                <div key={inc.id} style={styles.incidentRow}>
                  <div style={styles.incHeader}>
                    <span style={{ ...styles.sevBadge, background: inc.severity === 'high' || inc.severity === 'critical' ? '#7f1d1d' : inc.severity === 'medium' ? '#422006' : '#1c1917', color: inc.severity === 'high' || inc.severity === 'critical' ? '#f87171' : inc.severity === 'medium' ? '#fb923c' : '#a8a29e' }}>
                      {inc.severity}
                    </span>
                    <span style={styles.incTime}>{inc.detectedAt.toLocaleTimeString()}</span>
                  </div>
                  <div style={styles.incMsg}>{inc.message}</div>
                  {inc.resolution && (
                    <div style={styles.incResolution}>Resolved: {inc.resolution}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: { background: '#0f172a', minHeight: '100vh', color: '#f9fafb', fontFamily: 'sans-serif', padding: 24 },
  header: { marginBottom: 20 },
  back: { fontSize: 12, color: '#6b7280', textDecoration: 'none', display: 'block', marginBottom: 8 },
  headerMain: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { margin: '0 0 6px', fontSize: 22, fontWeight: 700 },
  headerMeta: { display: 'flex', gap: 8, alignItems: 'center' },
  tierBadge: { fontSize: 10, background: '#1e3a5f', color: '#93c5fd', padding: '2px 8px', borderRadius: 4, fontWeight: 600 },
  metaText: { fontSize: 12, color: '#6b7280' },
  ring: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', background: '#1f2937', borderRadius: 8, padding: '12px 20px', border: '1px solid #374151' },
  ringValue: { fontSize: 28, fontWeight: 700 },
  ringLabel: { fontSize: 10, color: '#6b7280' },
  // Stats
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 },
  statCard: { background: '#1f2937', borderRadius: 8, padding: 12, textAlign: 'center' as const, border: '1px solid #374151' },
  statBig: { fontSize: 22, fontWeight: 700 },
  statLabel: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  // Columns
  columns: { display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 },
  colLeft: {},
  colRight: {},
  section: { background: '#1f2937', borderRadius: 8, padding: 16, border: '1px solid #374151', marginBottom: 12 },
  sectionHeader: { fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 10 },
  // Engine rows
  engineRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #111827', fontSize: 12 },
  eDot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  eName: { flex: 1, fontWeight: 600 },
  eStat: { color: '#6b7280', fontSize: 11 },
  // Agent rows
  agentRow: { display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #111827' },
  aDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4 },
  agentInfo: { flex: 1 },
  agentName: { fontSize: 13, fontWeight: 600 },
  agentRole: { fontWeight: 400, color: '#6b7280', fontSize: 11 },
  agentTask: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  // Incidents
  incidentRow: { padding: '8px 0', borderBottom: '1px solid #111827' },
  incHeader: { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 },
  sevBadge: { fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4 },
  incTime: { fontSize: 10, color: '#6b7280' },
  incMsg: { fontSize: 12, color: '#d1d5db' },
  incResolution: { fontSize: 11, color: '#4ade80', marginTop: 4 },
  emptyText: { fontSize: 12, color: '#4b5563', textAlign: 'center' as const, padding: 16 },
}
