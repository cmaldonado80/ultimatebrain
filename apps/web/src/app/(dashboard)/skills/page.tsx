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

import { DbErrorBanner } from '../../../components/db-error-banner'
import { LoadingState } from '../../../components/ui/loading-state'
import { PageHeader } from '../../../components/ui/page-header'
import { trpc } from '../../../lib/trpc'
import type {
  SkillCapability,
  SkillCategory,
  SkillListing,
} from '../../../server/services/skills/marketplace'

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
  low: 'text-neon-green',
  medium: 'text-neon-yellow',
  high: 'text-neon-red',
}

const RISK_BORDER_COLORS: Record<string, string> = {
  low: 'border-green-500',
  medium: 'border-yellow-500',
  high: 'border-red-500',
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
    <span className="text-xs text-yellow-400">
      {'★'.repeat(full)}
      {half ? '½' : ''}
      <span className="text-border-dim">{'★'.repeat(5 - full - (half ? 1 : 0))}</span>
      <span className="text-slate-400 ml-1 text-[11px]">{rating.toFixed(1)}</span>
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
    new Set(skill.permissions.map((p) => p.capability)),
  )

  const toggle = (cap: SkillCapability) => {
    const next = new Set(approved)
    if (next.has(cap)) next.delete(cap)
    else next.add(cap)
    setApproved(next)
  }

  return (
    <div className="cyber-overlay">
      <div className="cyber-modal w-[460px] max-w-[95vw]">
        <h3 className="m-0 mb-1 text-base font-bold font-orbitron">
          Install &quot;{skill.name}&quot;
        </h3>
        <p className="m-0 mb-4 text-[13px] text-slate-400">
          Review the permissions this skill requires:
        </p>

        <div className="flex flex-col gap-2.5 mb-4">
          {skill.permissions.map((perm) => {
            const risk = getPermRisk(perm.capability)
            return (
              <label key={perm.capability} className="flex gap-2 items-start cursor-pointer">
                <input
                  type="checkbox"
                  checked={approved.has(perm.capability)}
                  onChange={() => toggle(perm.capability)}
                  className="mt-[3px]"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <code className="font-mono text-xs bg-bg-deep px-1.5 py-px rounded text-slate-300">
                      {perm.capability}
                    </code>
                    <span className={`text-[10px] font-bold uppercase ${RISK_COLORS[risk]}`}>
                      {risk}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{perm.reason}</div>
                </div>
              </label>
            )
          })}
        </div>

        <div className="flex justify-end gap-2">
          <button className="cyber-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`cyber-btn-primary ${approved.size === 0 ? 'opacity-50' : ''}`}
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
  onScan,
  scanPending,
}: {
  skill: SkillListing
  onInstall: () => void
  onUninstall: () => void
  onScan?: () => void
  scanPending?: boolean
}) {
  return (
    <div className="cyber-card">
      <div className="flex items-start gap-2.5 mb-2">
        <div className="text-2xl leading-none">
          {skill.category === 'coding'
            ? '💻'
            : skill.category === 'data'
              ? '📊'
              : skill.category === 'media'
                ? '🖼'
                : skill.category === 'integrations'
                  ? '🔗'
                  : '⚡'}
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold">{skill.name}</div>
          <div className="text-[11px] text-slate-500">
            by {skill.author} · v{skill.version}
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {skill.installed && onScan && (
            <button
              className="cyber-btn-secondary cyber-btn-xs shrink-0"
              onClick={onScan}
              disabled={scanPending}
            >
              {scanPending ? '...' : 'Scan'}
            </button>
          )}
          {skill.installed ? (
            <button className="cyber-btn-secondary shrink-0 text-xs" onClick={onUninstall}>
              Uninstall
            </button>
          ) : (
            <button className="cyber-btn-primary shrink-0 text-xs" onClick={onInstall}>
              Install
            </button>
          )}
        </div>
      </div>
      <div className="text-xs text-slate-400 mb-2.5 leading-relaxed">{skill.description}</div>
      <div className="flex items-center gap-2.5 flex-wrap">
        <Stars rating={skill.rating} />
        <span className="text-[11px] text-slate-500">
          {skill.installCount.toLocaleString()} installs
        </span>
        <div className="flex gap-1 flex-wrap ml-auto">
          {skill.permissions.map((p) => (
            <span
              key={p.capability}
              className={`text-[10px] border rounded px-1.5 py-px text-slate-400 font-mono ${RISK_BORDER_COLORS[getPermRisk(p.capability)]}`}
            >
              {p.capability}
            </span>
          ))}
        </div>
      </div>
      {skill.installed && skill.usageStats && (
        <div className="flex gap-3 mt-2.5 pt-2 border-t border-border-dim text-[11px] text-slate-500">
          <span>{skill.usageStats.totalRuns} runs</span>
          <span>
            {skill.assignedAgents?.length ?? 0} agent
            {(skill.assignedAgents?.length ?? 0) !== 1 ? 's' : ''}
          </span>
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

  const browseQuery = trpc.skills.browse.useQuery({
    category: category === 'all' ? undefined : category,
    search: search || undefined,
  })
  const installedQuery = trpc.skills.installed.useQuery()
  const installMutation = trpc.skills.install.useMutation()
  const uninstallMutation = trpc.skills.uninstall.useMutation()
  const scanMutation = trpc.skills.scan.useMutation()
  const [scanResult, setScanResult] = useState<{
    skillName: string
    verdict: string
    reviewRequired: boolean
  } | null>(null)

  const utils = trpc.useUtils()

  const error = browseQuery.error || installedQuery.error

  if (error) {
    return (
      <div className="p-6 text-slate-50">
        <DbErrorBanner error={error} />
      </div>
    )
  }

  const isLoading = browseQuery.isLoading || installedQuery.isLoading

  if (isLoading) {
    return (
      <div className="p-6 text-slate-50">
        <LoadingState message="Loading skills..." />
      </div>
    )
  }

  const allSkills: SkillListing[] = (browseQuery.data as SkillListing[]) ?? []
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
    <div className="p-6 text-slate-50">
      {/* Header */}
      <PageHeader title="Skill Store" />
      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        <button
          className={
            tab === 'browse' ? 'cyber-btn-primary text-[13px]' : 'cyber-btn-secondary text-[13px]'
          }
          onClick={() => setTab('browse')}
        >
          Browse ({allSkills.length})
        </button>
        <button
          className={
            tab === 'installed'
              ? 'cyber-btn-primary text-[13px]'
              : 'cyber-btn-secondary text-[13px]'
          }
          onClick={() => setTab('installed')}
        >
          Installed ({mergedSkills.filter((s) => s.installed).length})
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4">
        <input
          className="cyber-input w-full mb-2.5"
          placeholder="Search skills..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={
                category === cat.id
                  ? 'cyber-btn-primary rounded-full text-xs px-3 py-0.5'
                  : 'cyber-btn-secondary rounded-full text-xs px-3 py-0.5'
              }
              onClick={() => setCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scan Result Banner */}
      {scanResult && (
        <div
          className={`rounded-lg px-4 py-2 mb-3 text-xs flex items-center justify-between ${
            scanResult.verdict === 'clean'
              ? 'bg-neon-green/10 border border-neon-green/20 text-neon-green'
              : scanResult.verdict === 'suspicious'
                ? 'bg-neon-yellow/10 border border-neon-yellow/20 text-neon-yellow'
                : 'bg-neon-red/10 border border-neon-red/20 text-neon-red'
          }`}
        >
          <span>
            Scan result for <strong>{scanResult.skillName}</strong>:{' '}
            {scanResult.verdict.toUpperCase()}
            {scanResult.reviewRequired && ' — review required'}
          </span>
          <button
            className="text-current opacity-60 hover:opacity-100"
            onClick={() => setScanResult(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Grid */}
      <div className="cyber-grid">
        {displaySkills.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            onInstall={() => setInstallTarget(skill)}
            onUninstall={() => handleUninstall(skill.id)}
            onScan={() =>
              scanMutation.mutate(
                { skillName: skill.name, content: skill.description },
                {
                  onSuccess: (data) => {
                    const r = data as {
                      skillName: string
                      verdict: string
                      reviewRequired: boolean
                    }
                    setScanResult(r)
                    setTimeout(() => setScanResult(null), 6000)
                  },
                },
              )
            }
            scanPending={scanMutation.isPending}
          />
        ))}
        {displaySkills.length === 0 && (
          <div className="col-span-full text-center py-10 text-slate-500 text-[13px]">
            No skills found matching your criteria.
          </div>
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
