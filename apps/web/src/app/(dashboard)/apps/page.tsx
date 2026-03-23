'use client'

/**
 * App Dashboard — list all connected Mini Brains and Developments
 */

import { useState } from 'react'

interface ConnectedApp {
  id: string
  name: string
  tier: 'mini_brain' | 'development'
  template: string
  domain: string
  url: string
  healthScore: number
  connectedEngines: string[]
  activeAgents: number
  recentIncidents: number
  llmCost30d: number
  memoryEntries: number
  status: 'running' | 'degraded' | 'offline'
  createdAt: Date
}

const MOCK_APPS: ConnectedApp[] = [
  { id: 'mb-1', name: 'Astro Brain', tier: 'mini_brain', template: 'astrology', domain: 'Astrology', url: 'http://localhost:3101', healthScore: 0.97, connectedEngines: ['llm', 'memory', 'a2a', 'healing'], activeAgents: 4, recentIncidents: 0, llmCost30d: 142.50, memoryEntries: 1240, status: 'running', createdAt: new Date('2026-02-15') },
  { id: 'mb-2', name: 'Hotel Ops Brain', tier: 'mini_brain', template: 'hospitality', domain: 'Hotels', url: 'http://localhost:3102', healthScore: 0.89, connectedEngines: ['llm', 'memory', 'a2a', 'healing', 'guardrails', 'eval'], activeAgents: 7, recentIncidents: 2, llmCost30d: 387.20, memoryEntries: 3420, status: 'running', createdAt: new Date('2026-01-20') },
  { id: 'dev-1', name: 'Sports Astrology App', tier: 'development', template: 'sports-astrology', domain: 'Astrology', url: 'http://localhost:4101', healthScore: 0.94, connectedEngines: ['llm', 'memory'], activeAgents: 2, recentIncidents: 0, llmCost30d: 28.90, memoryEntries: 310, status: 'running', createdAt: new Date('2026-03-01') },
  { id: 'dev-2', name: 'Luxury Hotel Portal', tier: 'development', template: 'luxury-hotel', domain: 'Hotels', url: 'http://localhost:4102', healthScore: 0.72, connectedEngines: ['llm', 'memory', 'guardrails'], activeAgents: 3, recentIncidents: 1, llmCost30d: 95.40, memoryEntries: 890, status: 'degraded', createdAt: new Date('2026-02-28') },
  { id: 'mb-3', name: 'SOC Brain', tier: 'mini_brain', template: 'soc-ops', domain: 'Security', url: 'http://localhost:3103', healthScore: 0.0, connectedEngines: ['llm', 'memory', 'a2a', 'healing', 'guardrails'], activeAgents: 0, recentIncidents: 5, llmCost30d: 0, memoryEntries: 560, status: 'offline', createdAt: new Date('2026-03-10') },
]

function HealthBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = pct >= 90 ? '#22c55e' : pct >= 70 ? '#f97316' : '#ef4444'
  return (
    <div style={styles.healthBarBg}>
      <div style={{ ...styles.healthBarFill, width: `${pct}%`, background: color }} />
      <span style={{ ...styles.healthLabel, color }}>{pct}%</span>
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'running' ? '#22c55e' : status === 'degraded' ? '#f97316' : '#ef4444'
  return <span style={{ ...styles.statusDot, background: color, boxShadow: `0 0 4px ${color}` }} />
}

function AppCard({ app }: { app: ConnectedApp }) {
  return (
    <a href={`/apps/${app.id}`} style={styles.card}>
      <div style={styles.cardTop}>
        <div style={styles.cardLeft}>
          <StatusDot status={app.status} />
          <span style={styles.cardName}>{app.name}</span>
          <span style={styles.tierBadge}>{app.tier === 'mini_brain' ? 'Mini Brain' : 'Development'}</span>
        </div>
        <HealthBar score={app.healthScore} />
      </div>
      <div style={styles.cardDomain}>{app.domain} · {app.template}</div>
      <div style={styles.statsRow}>
        <div style={styles.stat}>
          <span style={styles.statValue}>{app.connectedEngines.length}</span>
          <span style={styles.statLabel}>Engines</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statValue}>{app.activeAgents}</span>
          <span style={styles.statLabel}>Agents</span>
        </div>
        <div style={styles.stat}>
          <span style={{ ...styles.statValue, color: app.recentIncidents > 0 ? '#f87171' : '#4ade80' }}>{app.recentIncidents}</span>
          <span style={styles.statLabel}>Incidents</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statValue}>${app.llmCost30d.toFixed(0)}</span>
          <span style={styles.statLabel}>LLM Cost</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statValue}>{app.memoryEntries.toLocaleString()}</span>
          <span style={styles.statLabel}>Memories</span>
        </div>
      </div>
      <div style={styles.engineTags}>
        {app.connectedEngines.map((e) => (
          <span key={e} style={styles.engineTag}>{e}</span>
        ))}
      </div>
    </a>
  )
}

export default function AppsPage() {
  const [filter, setFilter] = useState<'all' | 'mini_brain' | 'development'>('all')
  const filtered = filter === 'all' ? MOCK_APPS : MOCK_APPS.filter((a) => a.tier === filter)

  const miniBrains = MOCK_APPS.filter((a) => a.tier === 'mini_brain')
  const developments = MOCK_APPS.filter((a) => a.tier === 'development')
  const totalCost = MOCK_APPS.reduce((s, a) => s + a.llmCost30d, 0)

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Connected Apps</h1>
          <p style={styles.subtitle}>{miniBrains.length} Mini Brains · {developments.length} Developments · ${totalCost.toFixed(0)} LLM cost (30d)</p>
        </div>
      </div>

      <div style={styles.tabs}>
        {(['all', 'mini_brain', 'development'] as const).map((t) => (
          <button key={t} style={filter === t ? styles.tabActive : styles.tab} onClick={() => setFilter(t)}>
            {t === 'all' ? 'All' : t === 'mini_brain' ? 'Mini Brains' : 'Developments'}
          </button>
        ))}
      </div>

      <div style={styles.grid}>
        {filtered.map((app) => <AppCard key={app.id} app={app} />)}
      </div>
    </div>
  )
}

const styles = {
  page: { background: '#0f172a', minHeight: '100vh', color: '#f9fafb', fontFamily: 'sans-serif', padding: 24 },
  header: { marginBottom: 16 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  tabs: { display: 'flex', gap: 4, marginBottom: 16 },
  tab: { background: 'transparent', border: '1px solid #374151', borderRadius: 6, color: '#9ca3af', padding: '6px 16px', fontSize: 13, cursor: 'pointer' },
  tabActive: { background: '#1f2937', border: '1px solid #4b5563', borderRadius: 6, color: '#f9fafb', padding: '6px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  grid: { display: 'flex', flexDirection: 'column' as const, gap: 10 },
  card: { display: 'block', background: '#1f2937', borderRadius: 8, padding: 16, border: '1px solid #374151', textDecoration: 'none', color: 'inherit' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardLeft: { display: 'flex', alignItems: 'center', gap: 6 },
  cardName: { fontSize: 15, fontWeight: 700 },
  tierBadge: { fontSize: 10, background: '#1e3a5f', color: '#93c5fd', padding: '1px 6px', borderRadius: 4, fontWeight: 600 },
  cardDomain: { fontSize: 12, color: '#6b7280', marginBottom: 10 },
  statusDot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
  healthBarBg: { width: 100, height: 6, background: '#374151', borderRadius: 3, position: 'relative' as const, display: 'flex', alignItems: 'center' },
  healthBarFill: { height: '100%', borderRadius: 3 },
  healthLabel: { fontSize: 10, marginLeft: 6 },
  statsRow: { display: 'flex', gap: 20, marginBottom: 10 },
  stat: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: 700 },
  statLabel: { fontSize: 10, color: '#6b7280' },
  engineTags: { display: 'flex', gap: 4, flexWrap: 'wrap' as const },
  engineTag: { fontSize: 10, background: '#374151', borderRadius: 4, padding: '2px 6px', color: '#9ca3af' },
}
