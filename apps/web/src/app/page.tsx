'use client'

/**
 * Home Dashboard — stat cards, sparklines, progress rings, recent activity
 */

import { useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────

interface StatCardData {
  label: string
  value: string
  change?: { value: number; label: string }
  sparkline?: number[]
  color: string
}

interface RecentItem {
  id: string
  type: 'ticket' | 'agent' | 'incident' | 'flow'
  title: string
  subtitle: string
  time: string
  status: string
  statusColor: string
}

// ── Mock data ─────────────────────────────────────────────────────────────

const STATS: StatCardData[] = [
  { label: 'Active Agents', value: '12', change: { value: 3, label: 'from yesterday' }, sparkline: [4, 6, 5, 8, 7, 10, 12], color: '#818cf8' },
  { label: 'Open Tickets', value: '34', change: { value: -5, label: 'from yesterday' }, sparkline: [42, 39, 45, 38, 36, 37, 34], color: '#f97316' },
  { label: 'LLM Calls (24h)', value: '8,412', change: { value: 12, label: '% vs avg' }, sparkline: [620, 710, 580, 890, 920, 780, 850], color: '#22c55e' },
  { label: 'Cost (24h)', value: '$142.80', change: { value: -8, label: '% vs avg' }, sparkline: [180, 165, 155, 170, 148, 150, 142], color: '#eab308' },
  { label: 'Memory Entries', value: '14.2K', change: { value: 420, label: 'new today' }, sparkline: [12800, 13100, 13400, 13600, 13800, 14000, 14200], color: '#06b6d4' },
  { label: 'Health Score', value: '97%', change: { value: 2, label: 'pts improvement' }, sparkline: [91, 93, 94, 95, 94, 96, 97], color: '#22c55e' },
]

const RECENT: RecentItem[] = [
  { id: '1', type: 'ticket', title: 'Analyze Q1 revenue trends', subtitle: 'CFO Agent · Hotel Ops Brain', time: '2m ago', status: 'Running', statusColor: '#22c55e' },
  { id: '2', type: 'incident', title: 'Guardrails latency spike resolved', subtitle: 'Self-healing · Auto-scaled workers', time: '15m ago', status: 'Resolved', statusColor: '#4ade80' },
  { id: '3', type: 'agent', title: 'Code Reviewer completed PR #142', subtitle: 'Astro Brain · 3 files reviewed', time: '22m ago', status: 'Complete', statusColor: '#818cf8' },
  { id: '4', type: 'flow', title: 'Onboarding flow executed', subtitle: '4/4 steps passed · new workspace', time: '45m ago', status: 'Passed', statusColor: '#22c55e' },
  { id: '5', type: 'ticket', title: 'Guest complaint resolution T-089', subtitle: 'GM Agent · Hotel Ops Brain', time: '1h ago', status: 'Pending', statusColor: '#f97316' },
  { id: '6', type: 'agent', title: 'Threat Hunter scan completed', subtitle: 'SOC Brain · 0 threats found', time: '2h ago', status: 'Clean', statusColor: '#22c55e' },
]

const ENGINES_HEALTH = [
  { name: 'LLM Gateway', status: 'healthy', rpm: 142 },
  { name: 'Memory', status: 'healthy', rpm: 89 },
  { name: 'Orchestration', status: 'healthy', rpm: 34 },
  { name: 'A2A Protocol', status: 'healthy', rpm: 12 },
  { name: 'Guardrails', status: 'degraded', rpm: 67 },
  { name: 'Self-Healing', status: 'healthy', rpm: 8 },
  { name: 'Eval', status: 'healthy', rpm: 3 },
  { name: 'MCP', status: 'healthy', rpm: 5 },
]

const TOPOLOGY = [
  { name: 'Brain', tier: 'brain', children: 3 },
  { name: 'Astro Brain', tier: 'mini_brain', children: 4 },
  { name: 'Hotel Ops Brain', tier: 'mini_brain', children: 2 },
  { name: 'SOC Brain', tier: 'mini_brain', children: 1 },
]

// ── Sparkline SVG ─────────────────────────────────────────────────────────

function Sparkline({ data, color, width = 80, height = 24 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

// ── Progress Ring ─────────────────────────────────────────────────────────

function ProgressRing({ value, size = 64, color }: { value: number; size?: number; color: string }) {
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - value / 100)
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#1f2937" strokeWidth="4" />
      <circle
        cx={size/2} cy={size/2} r={radius}
        fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central" fill={color} fontSize="14" fontWeight="700">
        {value}%
      </text>
    </svg>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────

function StatCard({ stat }: { stat: StatCardData }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statTop}>
        <div>
          <div style={styles.statValue}>{stat.value}</div>
          <div style={styles.statLabel}>{stat.label}</div>
        </div>
        {stat.sparkline && <Sparkline data={stat.sparkline} color={stat.color} />}
      </div>
      {stat.change && (
        <div style={{ ...styles.statChange, color: stat.change.value >= 0 ? '#4ade80' : '#f87171' }}>
          {stat.change.value >= 0 ? '↑' : '↓'} {Math.abs(stat.change.value)} {stat.change.label}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Brain Dashboard</h2>
        <p style={styles.subtitle}>Central Intelligence Core — Solarc v4</p>
      </div>

      {/* Stat cards */}
      <div style={styles.statsGrid}>
        {STATS.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </div>

      {/* Three-column bottom section */}
      <div style={styles.bottomGrid}>
        {/* Recent Activity */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>Recent Activity</div>
          {RECENT.map((item) => (
            <div key={item.id} style={styles.activityRow}>
              <div style={styles.activityMain}>
                <div style={styles.activityTitle}>{item.title}</div>
                <div style={styles.activitySub}>{item.subtitle}</div>
              </div>
              <div style={styles.activityRight}>
                <span style={{ ...styles.activityStatus, color: item.statusColor }}>{item.status}</span>
                <span style={styles.activityTime}>{item.time}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Engine Health */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>Engine Health</div>
          {ENGINES_HEALTH.map((e) => (
            <div key={e.name} style={styles.engineRow}>
              <span style={{ ...styles.engineDot, background: e.status === 'healthy' ? '#22c55e' : '#f97316' }} />
              <span style={styles.engineName}>{e.name}</span>
              <span style={styles.engineRpm}>{e.rpm} rpm</span>
            </div>
          ))}
          <div style={{ marginTop: 16, textAlign: 'center' as const }}>
            <ProgressRing value={97} color="#22c55e" />
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>Overall Health</div>
          </div>
        </div>

        {/* Entity Topology */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>Entity Topology</div>
          {TOPOLOGY.map((entity, i) => (
            <div key={entity.name} style={{ ...styles.topoRow, paddingLeft: entity.tier === 'brain' ? 0 : 20 }}>
              <span style={styles.topoConnector}>{entity.tier === 'brain' ? '◆' : '├─'}</span>
              <span style={styles.topoName}>{entity.name}</span>
              <span style={styles.topoBadge}>
                {entity.tier === 'brain' ? 'Brain' : 'Mini Brain'}
              </span>
              <span style={styles.topoChildren}>{entity.children} apps</span>
            </div>
          ))}
          <div style={styles.topoSummary}>
            1 Brain · {TOPOLOGY.filter(t => t.tier === 'mini_brain').length} Mini Brains · {TOPOLOGY.reduce((s, t) => s + t.children, 0)} total apps
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = {
  page: { padding: 24, fontFamily: 'sans-serif', color: '#f9fafb' },
  header: { marginBottom: 20 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  // Stats
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 },
  statCard: { background: '#1f2937', borderRadius: 8, padding: 14, border: '1px solid #374151' },
  statTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: 700 },
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  statChange: { fontSize: 11 },
  // Bottom
  bottomGrid: { display: 'grid', gridTemplateColumns: '1fr 280px 280px', gap: 12 },
  panel: { background: '#1f2937', borderRadius: 8, padding: 16, border: '1px solid #374151' },
  panelHeader: { fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 12 },
  // Activity
  activityRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #111827', gap: 12 },
  activityMain: { flex: 1 },
  activityTitle: { fontSize: 13, fontWeight: 600 },
  activitySub: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  activityRight: { display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', flexShrink: 0 },
  activityStatus: { fontSize: 11, fontWeight: 600 },
  activityTime: { fontSize: 10, color: '#4b5563' },
  // Engines
  engineRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 12 },
  engineDot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  engineName: { flex: 1 },
  engineRpm: { color: '#6b7280', fontSize: 11 },
  // Topology
  topoRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', fontSize: 12 },
  topoConnector: { color: '#4b5563', fontFamily: 'monospace', width: 20 },
  topoName: { flex: 1, fontWeight: 600 },
  topoBadge: { fontSize: 10, background: '#1e3a5f', color: '#93c5fd', padding: '1px 5px', borderRadius: 4 },
  topoChildren: { fontSize: 10, color: '#6b7280' },
  topoSummary: { marginTop: 12, fontSize: 11, color: '#4b5563', textAlign: 'center' as const },
}
