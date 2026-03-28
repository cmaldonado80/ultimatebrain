/**
 * Observatory Constants — single source of truth for status/color/icon mappings.
 */

// ── Agent Status → Visual ──────────────────────────────────────────────

export const STATUS_DOT: Record<string, string> = {
  executing: 'neon-dot-green animate-pulse',
  planning: 'neon-dot-green animate-pulse',
  error: 'neon-dot-red',
  offline: 'bg-slate-600',
  idle: 'neon-dot-blue',
  reviewing: 'neon-dot-yellow',
}

export const STATUS_BORDER: Record<string, string> = {
  executing: 'border-neon-green/50',
  planning: 'border-neon-green/30',
  error: 'border-neon-red/50',
  offline: 'border-slate-600/50',
  idle: 'border-border',
  reviewing: 'border-neon-yellow/30',
}

// ── Health Score → Visual ──────────────────────────────────────────────

export const HEALTH_DOT: Record<string, string> = {
  healthy: 'neon-dot-green',
  degraded: 'neon-dot-yellow',
  unhealthy: 'neon-dot-red',
}

export const HEALTH_TEXT: Record<string, string> = {
  healthy: 'text-neon-green',
  degraded: 'text-neon-yellow',
  unhealthy: 'text-neon-red',
}

// ── Insight Severity → Visual ──────────────────────────────────────────

export const SEVERITY_STYLES: Record<string, { dot: string; text: string; bg: string }> = {
  critical: { dot: 'neon-dot-red', text: 'text-neon-red', bg: 'bg-neon-red/5 border-neon-red/20' },
  warning: {
    dot: 'neon-dot-yellow',
    text: 'text-neon-yellow',
    bg: 'bg-neon-yellow/5 border-neon-yellow/20',
  },
  info: { dot: 'neon-dot-blue', text: 'text-neon-blue', bg: 'bg-neon-blue/5 border-neon-blue/20' },
}

// ── Node Types → Visual ────────────────────────────────────────────────

export const NODE_COLORS: Record<string, string> = {
  workspace: '#00d4ff',
  agent: '#475569',
  orchestrator: '#a855f7',
  model: '#00d4ff',
  entity: '#22c55e',
}
