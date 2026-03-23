'use client'

/**
 * Skill Store — Browse, install, and manage skills
 *
 * - Categories: productivity, coding, media, data, integrations
 * - Search by name/keyword
 * - One-click install with permission review modal
 * - Installed tab: enable/disable per agent, usage stats
 */

import { useState } from 'react'
import { trpc } from '../../../utils/trpc'
import type { SkillListing, SkillCategory, SkillCapability } from '../../../server/services/skills/marketplace'

// ── Constants ─────────────────────────────────────────────────────────────

const CATEGORIES: { id: SkillCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'coding', label: 'Coding' },
  { id: 'media', label: 'Media' },
  { id: 'data', label: 'Data' },
  { id: 'integrations', label: 'Integrations' },
]

const RISK_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#f97316',
  high: '#ef4444',
}

function getPermRisk(cap: SkillCapability): 'low' | 'medium' | 'high' {
  if (cap === 'file:read' || cap === 'llm:invoke') return 'low'
  if (cap === 'file:write' || cap === 'shell:execute') return 'high'
  return 'medium'
}

// ── Sub-components ────────────────────────────────────────────────────────

function Stars({ rating }: { rating: number }) {
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  return (
    <span style={styles.stars}>
      {'★'.repeat(full)}
      {half ? '½' : ''}
      <span style={styles.starsEmpty}>{'★'.repeat(5 - full - (half ? 1 : 0))}</span>
      <span style={styles.ratingNum}>{rating.toFixed(1)}</span>
    </span>
  )
}

function PermissionReviewModal({
  skill,
  onApprove,
  onCancel,
}: {
  skill: SkillListing
  onApprove: (approved: SkillCapability[]) => void
  onCancel: () => void
}) {
  const [approved, setApproved] = useState<Set<SkillCapability>>(
    new Set(skill.permissions.map((p) => p.capability))
  )

  const toggle = (cap: SkillCapability) => {
    const next = new Set(approved)
    if (next.has(cap)) next.delete(cap)
    else next.add(cap)
    setApproved(next)
  }

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <h3 style={styles.modalTitle}>Install "{skill.name}"</h3>
        <p style={styles.modalSub}>Review the permissions this skill requires:</p>

        <div style={styles.permList}>
          {skill.permissions.map((perm) => {
            const risk = getPermRisk(perm.capability)
            return (
              <label key={perm.capability} style={styles.permItem}>
                <input
                  type="checkbox"
                  checked={approved.has(perm.capability)}
                  onChange={() => toggle(perm.capability)}
                  style={styles.permCheck}
                />
                <div>
                  <div style={styles.permCap}>
                    <code style={styles.permCode}>{perm.capability}</code>
                    <span style={{ ...styles.riskBadge, color: RISK_COLORS[risk] }}>{risk}</span>
                  </div>
                  <div style={styles.permReason}>{perm.reason}</div>
                </div>
              </label>
            )
          })}
        </div>

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button
            style={{
              ...styles.installBtnModal,
              opacity: approved.size === 0 ? 0.5 : 1,
            }}
            onClick={() => onApprove(Array.from(approved))}
            disabled={approved.size === 0}
          >
            Install with {approved.size} permission{approved.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

function SkillCard({
  skill,
  onInstall,
  onUninstall,
}: {
  skill: SkillListing
  onInstall: () => void
  onUninstall: () => void
}) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTop}>
        <div style={styles.cardIcon}>{skill.category === 'coding' ? '💻' : skill.category === 'data' ? '📊' : skill.category === 'media' ? '🖼' : skill.category === 'integrations' ? '🔗' : '⚡'}</div>
        <div style={styles.cardInfo}>
          <div style={styles.cardName}>{skill.name}</div>
          <div style={styles.cardAuthor}>by {skill.author} · v{skill.version}</div>
        </div>
        {skill.installed ? (
          <button style={styles.uninstallBtn} onClick={onUninstall}>Uninstall</button>
        ) : (
          <button style={styles.installBtn} onClick={onInstall}>Install</button>
        )}
      </div>
      <div style={styles.cardDesc}>{skill.description}</div>
      <div style={styles.cardFooter}>
        <Stars rating={skill.rating} />
        <span style={styles.installs}>{skill.installCount.toLocaleString()} installs</span>
        <div style={styles.permTags}>
          {skill.permissions.map((p) => (
            <span key={p.capability} style={{ ...styles.permTag, borderColor: RISK_COLORS[getPermRisk(p.capability)] }}>
              {p.capability}
            </span>
          ))}
        </div>
      </div>
      {skill.installed && skill.usageStats && (
        <div style={styles.usageRow}>
          <span>{skill.usageStats.totalRuns} runs</span>
          <span>{skill.assignedAgents?.length ?? 0} agent{(skill.assignedAgents?.length ?? 0) !== 1 ? 's' : ''}</span>
          <span>{skill.usageStats.avgDurationMs}ms avg</span>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function SkillsPage() {
  const [tab, setTab] = useState<'browse' | 'installed'>('browse')
  const [category, setCategory] = useState<SkillCategory | 'all'>('all')
  const [search, setSearch] = useState('')
  const [installTarget, setInstallTarget] = useState<SkillListing | null>(null)

  const browseQuery = trpc.skills.browse.useQuery(
    { category: category === 'all' ? undefined : category, search: search || undefined },
  )
  const installedQuery = trpc.skills.installed.useQuery()
  const installMutation = trpc.skills.install.useMutation()
  const uninstallMutation = trpc.skills.uninstall.useMutation()

  const utils = trpc.useUtils()

  const isLoading = browseQuery.isLoading || installedQuery.isLoading
  const error = browseQuery.error || installedQuery.error

  if (isLoading) {
    return (
      <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>Loading...</div>
          <div style={{ fontSize: 13 }}>Fetching skills</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', color: '#f87171' }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Error loading skills</div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>{error.message}</div>
        </div>
      </div>
    )
  }

  const allSkills: SkillListing[] = browseQuery.data ?? []
  const installedSkills = (installedQuery.data ?? []) as unknown as SkillListing[]
  const installedIds = new Set(installedSkills.map((s) => s.id))

  // Merge installed status into browse results
  const mergedSkills = allSkills.map((s) => ({
    ...s,
    installed: installedIds.has(s.id) || s.installed,
  }))

  const displaySkills = tab === 'installed' ? mergedSkills.filter((s) => s.installed) : mergedSkills

  function handleApprove(permissions: SkillCapability[]) {
    if (!installTarget) return
    installMutation.mutate(
      { skillId: installTarget.id, approvedPermissions: permissions },
      {
        onSuccess: () => {
          utils.skills.browse.invalidate()
          utils.skills.installed.invalidate()
        },
      },
    )
    setInstallTarget(null)
  }

  function handleUninstall(skillId: string) {
    uninstallMutation.mutate(
      { skillId },
      {
        onSuccess: () => {
          utils.skills.browse.invalidate()
          utils.skills.installed.invalidate()
        },
      },
    )
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Skill Store</h1>
          <p style={styles.subtitle}>Browse, install, and manage agent skills</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button style={tab === 'browse' ? styles.tabActive : styles.tab} onClick={() => setTab('browse')}>
          Browse ({allSkills.length})
        </button>
        <button style={tab === 'installed' ? styles.tabActive : styles.tab} onClick={() => setTab('installed')}>
          Installed ({mergedSkills.filter((s) => s.installed).length})
        </button>
      </div>

      {/* Filters */}
      <div style={styles.filters}>
        <input
          style={styles.searchInput}
          placeholder="Search skills..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div style={styles.catRow}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              style={category === cat.id ? styles.catBtnActive : styles.catBtn}
              onClick={() => setCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div style={styles.grid}>
        {displaySkills.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            onInstall={() => setInstallTarget(skill)}
            onUninstall={() => handleUninstall(skill.id)}
          />
        ))}
        {displaySkills.length === 0 && (
          <div style={styles.empty}>No skills found matching your criteria.</div>
        )}
      </div>

      {/* Permission review modal */}
      {installTarget && (
        <PermissionReviewModal
          skill={installTarget}
          onApprove={handleApprove}
          onCancel={() => setInstallTarget(null)}
        />
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = {
  page: { background: '#0f172a', minHeight: '100vh', color: '#f9fafb', fontFamily: 'sans-serif', padding: 24 },
  header: { marginBottom: 16 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  // Tabs
  tabs: { display: 'flex', gap: 4, marginBottom: 16 },
  tab: { background: 'transparent', border: '1px solid #374151', borderRadius: 6, color: '#9ca3af', padding: '6px 16px', fontSize: 13, cursor: 'pointer' },
  tabActive: { background: '#1f2937', border: '1px solid #4b5563', borderRadius: 6, color: '#f9fafb', padding: '6px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  // Filters
  filters: { marginBottom: 16 },
  searchInput: { width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 6, color: '#f9fafb', padding: '8px 12px', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' as const },
  catRow: { display: 'flex', gap: 4, flexWrap: 'wrap' as const },
  catBtn: { background: 'transparent', border: '1px solid #374151', borderRadius: 12, color: '#9ca3af', padding: '3px 12px', fontSize: 12, cursor: 'pointer' },
  catBtnActive: { background: '#2563eb', border: '1px solid #2563eb', borderRadius: 12, color: '#fff', padding: '3px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  // Grid
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 },
  empty: { gridColumn: '1 / -1', textAlign: 'center' as const, padding: 40, color: '#6b7280', fontSize: 13 },
  // Card
  card: { background: '#1f2937', borderRadius: 8, padding: 16, border: '1px solid #374151' },
  cardTop: { display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  cardIcon: { fontSize: 24, lineHeight: 1 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 14, fontWeight: 700 },
  cardAuthor: { fontSize: 11, color: '#6b7280' },
  cardDesc: { fontSize: 12, color: '#9ca3af', marginBottom: 10, lineHeight: 1.5 },
  cardFooter: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const },
  stars: { fontSize: 12, color: '#eab308' },
  starsEmpty: { color: '#374151' },
  ratingNum: { color: '#9ca3af', marginLeft: 4, fontSize: 11 },
  installs: { fontSize: 11, color: '#6b7280' },
  permTags: { display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginLeft: 'auto' },
  permTag: { fontSize: 10, border: '1px solid', borderRadius: 4, padding: '1px 5px', color: '#9ca3af', fontFamily: 'monospace' },
  usageRow: { display: 'flex', gap: 12, marginTop: 10, paddingTop: 8, borderTop: '1px solid #374151', fontSize: 11, color: '#6b7280' },
  installBtn: { background: '#2563eb', border: 'none', borderRadius: 6, color: '#fff', padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  uninstallBtn: { background: 'transparent', border: '1px solid #374151', borderRadius: 6, color: '#9ca3af', padding: '5px 14px', fontSize: 12, cursor: 'pointer', flexShrink: 0 },
  // Modal
  modalOverlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: 24, width: 460, maxWidth: '95vw' },
  modalTitle: { margin: '0 0 4px', fontSize: 16, fontWeight: 700 },
  modalSub: { margin: '0 0 16px', fontSize: 13, color: '#9ca3af' },
  permList: { display: 'flex', flexDirection: 'column' as const, gap: 10, marginBottom: 16 },
  permItem: { display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' },
  permCheck: { marginTop: 3 },
  permCap: { display: 'flex', alignItems: 'center', gap: 6 },
  permCode: { fontSize: 12, background: '#111827', padding: '1px 5px', borderRadius: 3, color: '#d1d5db' },
  riskBadge: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const },
  permReason: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  cancelBtn: { padding: '7px 16px', background: 'transparent', border: '1px solid #4b5563', borderRadius: 6, color: '#9ca3af', fontSize: 13, cursor: 'pointer' },
  installBtnModal: { padding: '7px 16px', background: '#2563eb', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
}
