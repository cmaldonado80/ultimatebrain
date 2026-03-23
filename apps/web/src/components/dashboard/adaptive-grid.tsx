'use client'

/**
 * Adaptive Dashboard Grid
 *
 * Panels ranked by relevance score (behavior + role + time + context).
 * Top 4 always visible, rest collapsed. Pin to override. Reset to clear.
 */

import { useState, useCallback } from 'react'
import type { RankedPanel, PanelId } from '../../server/services/adaptive/layout-engine'

// ── Mock ranked panels ────────────────────────────────────────────────────

const MOCK_PANELS: RankedPanel[] = [
  { id: 'ticket_board', label: 'Ticket Board', description: 'Active tickets and their status', score: 42.5, isPinned: true, isVisible: true, breakdown: { behavior: 8.2, role: 10, timeOfDay: 10, context: 0, pin: 100 } },
  { id: 'agent_status', label: 'Agent Status', description: 'Running agents and their current tasks', score: 35.1, isPinned: false, isVisible: true, breakdown: { behavior: 6.1, role: 8, timeOfDay: 8, context: 4.5, pin: 0 } },
  { id: 'ops_health', label: 'Ops Health', description: 'System health, uptime, and alerts', score: 30.8, isPinned: false, isVisible: true, breakdown: { behavior: 3.2, role: 8, timeOfDay: 0, context: 9, pin: 0 } },
  { id: 'approvals', label: 'Approvals', description: 'Pending approval requests from agents', score: 28.4, isPinned: false, isVisible: true, breakdown: { behavior: 4.0, role: 6, timeOfDay: 6, context: 4, pin: 0 } },
  { id: 'recent_activity', label: 'Recent Activity', description: 'Latest actions across the platform', score: 22.0, isPinned: false, isVisible: false, breakdown: { behavior: 5.5, role: 7, timeOfDay: 0, context: 0, pin: 0 } },
  { id: 'standup_summary', label: 'Standup Summary', description: 'Daily overview', score: 18.3, isPinned: false, isVisible: false, breakdown: { behavior: 2.0, role: 0, timeOfDay: 5, context: 0, pin: 0 } },
  { id: 'metrics', label: 'Metrics', description: 'Key performance metrics and trends', score: 16.0, isPinned: false, isVisible: false, breakdown: { behavior: 3.0, role: 0, timeOfDay: 0, context: 0, pin: 0 } },
  { id: 'active_flows', label: 'Active Flows', description: 'Running orchestration flows', score: 14.5, isPinned: false, isVisible: false, breakdown: { behavior: 1.5, role: 6, timeOfDay: 7, context: 0, pin: 0 } },
  { id: 'dlq', label: 'Dead Letter Queue', description: 'Failed messages awaiting review', score: 12.2, isPinned: false, isVisible: false, breakdown: { behavior: 0.5, role: 9, timeOfDay: 0, context: 0, pin: 0 } },
  { id: 'security', label: 'Security', description: 'Guardrail violations and security events', score: 10.0, isPinned: false, isVisible: false, breakdown: { behavior: 0.2, role: 10, timeOfDay: 0, context: 0, pin: 0 } },
]

// ── Sub-components ────────────────────────────────────────────────────────

function ScoreBreakdown({ breakdown }: { breakdown: RankedPanel['breakdown'] }) {
  const bars = [
    { label: 'Behavior', value: breakdown.behavior, color: '#3b82f6', max: 10 },
    { label: 'Role', value: breakdown.role, color: '#8b5cf6', max: 10 },
    { label: 'Time', value: breakdown.timeOfDay, color: '#f97316', max: 10 },
    { label: 'Context', value: breakdown.context, color: '#22c55e', max: 10 },
  ]

  return (
    <div style={styles.breakdown}>
      {bars.map((bar) => (
        <div key={bar.label} style={styles.breakdownRow}>
          <span style={styles.breakdownLabel}>{bar.label}</span>
          <div style={styles.breakdownBarBg}>
            <div
              style={{
                ...styles.breakdownBarFill,
                width: `${(bar.value / bar.max) * 100}%`,
                background: bar.color,
              }}
            />
          </div>
          <span style={styles.breakdownValue}>{bar.value.toFixed(1)}</span>
        </div>
      ))}
    </div>
  )
}

function PanelCard({
  panel,
  onPin,
  expanded,
  onToggleExpand,
}: {
  panel: RankedPanel
  onPin: () => void
  expanded: boolean
  onToggleExpand: () => void
}) {
  return (
    <div
      style={{
        ...styles.card,
        ...(panel.isVisible ? {} : styles.cardCollapsed),
        ...(panel.isPinned ? styles.cardPinned : {}),
      }}
    >
      <div style={styles.cardHeader}>
        <div style={styles.cardLeft}>
          <span style={styles.cardLabel}>{panel.label}</span>
          {panel.isPinned && <span style={styles.pinBadge}>Pinned</span>}
          <span style={styles.scoreBadge}>{panel.score.toFixed(1)}</span>
        </div>
        <div style={styles.cardActions}>
          <button
            style={{ ...styles.iconBtn, color: panel.isPinned ? '#f97316' : '#6b7280' }}
            onClick={onPin}
            title={panel.isPinned ? 'Unpin' : 'Pin to dashboard'}
          >
            📌
          </button>
          <button
            style={styles.iconBtn}
            onClick={onToggleExpand}
            title="Show score breakdown"
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>
      <div style={styles.cardDesc}>{panel.description}</div>

      {/* Placeholder panel content */}
      {panel.isVisible && (
        <div style={styles.cardContent}>
          <div style={styles.placeholder}>
            <span style={styles.placeholderText}>{panel.label} panel content</span>
          </div>
        </div>
      )}

      {expanded && <ScoreBreakdown breakdown={panel.breakdown} />}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────

interface AdaptiveGridProps {
  panels?: RankedPanel[]
  onPin?: (panelId: PanelId) => void
  onReset?: () => void
}

export default function AdaptiveGrid({
  panels = MOCK_PANELS,
  onPin,
  onReset,
}: AdaptiveGridProps) {
  const [expandedPanel, setExpandedPanel] = useState<PanelId | null>(null)
  const [showCollapsed, setShowCollapsed] = useState(false)

  const visiblePanels = panels.filter((p) => p.isVisible)
  const collapsedPanels = panels.filter((p) => !p.isVisible)

  const handlePin = useCallback(
    (panelId: PanelId) => {
      onPin?.(panelId)
    },
    [onPin]
  )

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Dashboard</h2>
          <p style={styles.subtitle}>
            Showing {visiblePanels.length} panels · {collapsedPanels.length} collapsed · Ranked by relevance
          </p>
        </div>
        <div style={styles.headerActions}>
          <button
            style={styles.resetBtn}
            onClick={onReset}
            title="Clear all learned preferences"
          >
            Reset Layout
          </button>
        </div>
      </div>

      {/* Visible panels grid */}
      <div style={styles.grid}>
        {visiblePanels.map((panel) => (
          <PanelCard
            key={panel.id}
            panel={panel}
            onPin={() => handlePin(panel.id)}
            expanded={expandedPanel === panel.id}
            onToggleExpand={() =>
              setExpandedPanel(expandedPanel === panel.id ? null : panel.id)
            }
          />
        ))}
      </div>

      {/* Collapsed panels */}
      {collapsedPanels.length > 0 && (
        <div style={styles.collapsedSection}>
          <button
            style={styles.collapsedToggle}
            onClick={() => setShowCollapsed(!showCollapsed)}
          >
            {showCollapsed ? '▲ Hide' : '▼ Show'} {collapsedPanels.length} more panels
          </button>

          {showCollapsed && (
            <div style={styles.collapsedGrid}>
              {collapsedPanels.map((panel) => (
                <PanelCard
                  key={panel.id}
                  panel={panel}
                  onPin={() => handlePin(panel.id)}
                  expanded={expandedPanel === panel.id}
                  onToggleExpand={() =>
                    setExpandedPanel(expandedPanel === panel.id ? null : panel.id)
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = {
  container: { padding: 24, fontFamily: 'sans-serif', color: '#f9fafb' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  headerActions: { display: 'flex', gap: 8 },
  resetBtn: {
    background: 'transparent',
    border: '1px solid #374151',
    borderRadius: 6,
    color: '#9ca3af',
    padding: '6px 14px',
    fontSize: 12,
    cursor: 'pointer',
  },
  // Grid
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12,
    marginBottom: 16,
  },
  // Card
  card: {
    background: '#1f2937',
    borderRadius: 8,
    padding: 16,
    border: '1px solid #374151',
  },
  cardCollapsed: { opacity: 0.7 },
  cardPinned: { borderColor: '#f97316', borderWidth: 2 },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardLeft: { display: 'flex', alignItems: 'center', gap: 6 },
  cardLabel: { fontSize: 14, fontWeight: 700 },
  pinBadge: { fontSize: 10, background: '#7c2d12', color: '#fed7aa', padding: '1px 5px', borderRadius: 4, fontWeight: 600 },
  scoreBadge: { fontSize: 10, background: '#1e3a5f', color: '#93c5fd', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace' },
  cardActions: { display: 'flex', gap: 4 },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: 13,
    cursor: 'pointer',
    padding: '2px 4px',
    color: '#6b7280',
  },
  cardDesc: { fontSize: 12, color: '#9ca3af', marginBottom: 10 },
  cardContent: { marginBottom: 8 },
  placeholder: {
    background: '#111827',
    borderRadius: 6,
    padding: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
  },
  placeholderText: { fontSize: 12, color: '#4b5563' },
  // Breakdown
  breakdown: {
    marginTop: 8,
    padding: '8px 0',
    borderTop: '1px solid #374151',
  },
  breakdownRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 },
  breakdownLabel: { fontSize: 10, color: '#6b7280', width: 55 },
  breakdownBarBg: { flex: 1, height: 4, background: '#111827', borderRadius: 2, overflow: 'hidden' },
  breakdownBarFill: { height: '100%', borderRadius: 2 },
  breakdownValue: { fontSize: 10, color: '#9ca3af', width: 28, textAlign: 'right' as const, fontFamily: 'monospace' },
  // Collapsed section
  collapsedSection: { borderTop: '1px solid #1f2937', paddingTop: 12 },
  collapsedToggle: {
    background: 'transparent',
    border: 'none',
    color: '#6b7280',
    fontSize: 12,
    cursor: 'pointer',
    padding: '4px 0',
    width: '100%',
    textAlign: 'left' as const,
  },
  collapsedGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12,
    marginTop: 12,
  },
}
