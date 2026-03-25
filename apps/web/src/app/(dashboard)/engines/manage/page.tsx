'use client'

/**
 * Brain Manager — create and manage brain entities, mini-brains, and developments.
 * Hierarchy: Brain → Mini-Brain → Development
 */

import { useState } from 'react'
import { trpc } from '../../../../utils/trpc'
import { DbErrorBanner } from '../../../../components/db-error-banner'

interface Entity {
  id: string
  name: string
  domain: string | null
  tier: string
  status: string
  parentId: string | null
  enginesEnabled: string[] | null
  lastHealthCheck: Date | null
  createdAt: Date
}

interface Template {
  id: string
  domain: string
  name: string
  description: string
  engines: string[]
  agentCount: number
}

const TIER_COLORS: Record<string, string> = {
  brain: '#818cf8',
  mini_brain: '#22c55e',
  development: '#eab308',
}

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  provisioning: '#eab308',
  suspended: '#ef4444',
  degraded: '#f97316',
}

export default function BrainManagerPage() {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [entityName, setEntityName] = useState('')
  const [entityDomain, setEntityDomain] = useState('')

  const entitiesQuery = trpc.platform.entitiesByTier.useQuery({ tier: 'brain' })
  const miniBrainsQuery = trpc.platform.entitiesByTier.useQuery({ tier: 'mini_brain' })
  const developmentsQuery = trpc.platform.entitiesByTier.useQuery({ tier: 'development' })
  const templatesQuery = trpc.factory.templates.useQuery()

  const utils = trpc.useUtils()
  const createMut = trpc.platform.createEntity.useMutation({
    onSuccess: () => {
      utils.platform.entitiesByTier.invalidate()
      setShowCreateForm(false)
      setEntityName('')
      setEntityDomain('')
    },
  })
  const activateMut = trpc.platform.activateEntity.useMutation({
    onSuccess: () => utils.platform.entitiesByTier.invalidate(),
  })
  const suspendMut = trpc.platform.suspendEntity.useMutation({
    onSuccess: () => utils.platform.entitiesByTier.invalidate(),
  })

  const error = entitiesQuery.error || miniBrainsQuery.error
  if (error) {
    return (
      <div style={styles.page}>
        <DbErrorBanner error={error} />
      </div>
    )
  }

  const isLoading = entitiesQuery.isLoading || miniBrainsQuery.isLoading
  if (isLoading) {
    return (
      <div
        style={{
          ...styles.page,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
        }}
      >
        <div style={{ textAlign: 'center', color: '#6b7280' }}>Loading brain hierarchy...</div>
      </div>
    )
  }

  const brains = (entitiesQuery.data ?? []) as Entity[]
  const miniBrains = (miniBrainsQuery.data ?? []) as Entity[]
  const developments = (developmentsQuery.data ?? []) as Entity[]
  const templates = (templatesQuery.data ?? []) as unknown as Template[]
  const allEntities = [...brains, ...miniBrains, ...developments]

  function renderEntity(entity: Entity, depth: number) {
    const children = allEntities.filter((e) => e.parentId === entity.id)
    const tierColor = TIER_COLORS[entity.tier] ?? '#6b7280'
    const statusColor = STATUS_COLORS[entity.status] ?? '#6b7280'

    return (
      <div key={entity.id}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            paddingLeft: 12 + depth * 24,
            background: depth % 2 === 0 ? '#1f2937' : '#111827',
            borderBottom: '1px solid #374151',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: statusColor,
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{entity.name}</span>
          <span
            style={{
              fontSize: 10,
              background: tierColor + '20',
              color: tierColor,
              padding: '1px 8px',
              borderRadius: 3,
              fontWeight: 600,
            }}
          >
            {entity.tier.replace('_', ' ')}
          </span>
          {entity.domain && <span style={{ fontSize: 10, color: '#6b7280' }}>{entity.domain}</span>}
          <span style={{ fontSize: 10, color: statusColor, fontWeight: 600 }}>{entity.status}</span>
          {entity.status === 'provisioning' && (
            <button
              style={{ ...styles.btnSmall, background: '#22c55e' }}
              onClick={() => activateMut.mutate({ id: entity.id })}
              disabled={activateMut.isPending}
            >
              Activate
            </button>
          )}
          {entity.status === 'active' && (
            <button
              style={{ ...styles.btnSmall, background: '#ef4444' }}
              onClick={() => suspendMut.mutate({ id: entity.id })}
              disabled={suspendMut.isPending}
            >
              Suspend
            </button>
          )}
          {entity.status === 'suspended' && (
            <button
              style={{ ...styles.btnSmall, background: '#22c55e' }}
              onClick={() => activateMut.mutate({ id: entity.id })}
              disabled={activateMut.isPending}
            >
              Reactivate
            </button>
          )}
        </div>
        {children.map((child) => renderEntity(child, depth + 1))}
      </div>
    )
  }

  // Root entities (no parent)
  const rootEntities = allEntities.filter((e) => !e.parentId)

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={styles.title}>Brain Manager</h2>
          <button style={styles.btnPrimary} onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? 'Cancel' : '+ Create Entity'}
          </button>
        </div>
        <p style={styles.subtitle}>
          Manage the brain hierarchy — Brain → Mini-Brain → Development.
        </p>
      </div>

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          marginBottom: 20,
        }}
      >
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: TIER_COLORS.brain }}>{brains.length}</div>
          <div style={styles.statLabel}>Brains</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: TIER_COLORS.mini_brain }}>
            {miniBrains.length}
          </div>
          <div style={styles.statLabel}>Mini-Brains</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: TIER_COLORS.development }}>
            {developments.length}
          </div>
          <div style={styles.statLabel}>Developments</div>
        </div>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div style={styles.formCard}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            <input
              style={styles.input}
              placeholder="Entity name..."
              value={entityName}
              onChange={(e) => setEntityName(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ ...styles.input, flex: 1 }}
                placeholder="Domain (e.g., hospitality, healthcare)..."
                value={entityDomain}
                onChange={(e) => setEntityDomain(e.target.value)}
              />
              {templates.length > 0 && (
                <select
                  style={styles.select}
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                >
                  <option value="">Template (optional)</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} — {t.description}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={styles.btnCreate}
                onClick={() =>
                  entityName.trim() &&
                  createMut.mutate({
                    name: entityName.trim(),
                    tier: 'mini_brain',
                    domain: entityDomain.trim() || undefined,
                    parentId: brains[0]?.id,
                  })
                }
                disabled={createMut.isPending || !entityName.trim()}
              >
                {createMut.isPending ? 'Creating...' : 'Create Mini-Brain'}
              </button>
              <button
                style={{ ...styles.btnCreate, background: '#eab308', color: '#000' }}
                onClick={() =>
                  entityName.trim() &&
                  createMut.mutate({
                    name: entityName.trim(),
                    tier: 'development',
                    domain: entityDomain.trim() || undefined,
                    parentId: miniBrains[0]?.id || brains[0]?.id,
                  })
                }
                disabled={createMut.isPending || !entityName.trim()}
              >
                {createMut.isPending ? 'Creating...' : 'Create Development'}
              </button>
            </div>
            {createMut.error && (
              <div style={{ color: '#fca5a5', fontSize: 11 }}>{createMut.error.message}</div>
            )}
          </div>
        </div>
      )}

      {/* Hierarchy Tree */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Entity Hierarchy ({allEntities.length})</div>
        {allEntities.length === 0 ? (
          <div
            style={{ color: '#4b5563', fontSize: 13, textAlign: 'center' as const, padding: 20 }}
          >
            No brain entities yet. Create one to get started.
          </div>
        ) : (
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #374151' }}>
            {rootEntities.map((e) => renderEntity(e, 0))}
          </div>
        )}
      </div>

      {/* Templates */}
      {templates.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Available Templates ({templates.length})</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: 8,
            }}
          >
            {templates.map((t) => (
              <div
                key={t.id}
                style={{
                  background: '#111827',
                  borderRadius: 6,
                  padding: 10,
                  border: '1px solid #374151',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{t.name}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
                  {t.description}
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#4b5563' }}>
                  <span>Domain: {t.domain}</span>
                  <span>Engines: {t.engines.length}</span>
                  <span>Agents: {t.agentCount}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: { padding: 24, fontFamily: 'sans-serif', color: '#f9fafb' },
  header: { marginBottom: 20 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  statCard: {
    background: '#1f2937',
    borderRadius: 8,
    padding: 14,
    border: '1px solid #374151',
    textAlign: 'center' as const,
  },
  statValue: { fontSize: 24, fontWeight: 700 },
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#9ca3af',
    marginBottom: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  formCard: {
    background: '#1f2937',
    borderRadius: 8,
    padding: 16,
    border: '1px solid #374151',
    marginBottom: 16,
  },
  input: {
    background: '#111827',
    color: '#f9fafb',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 13,
  },
  select: {
    background: '#111827',
    color: '#f9fafb',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    flex: 1,
  },
  btnPrimary: {
    background: '#818cf8',
    color: '#f9fafb',
    border: 'none',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnCreate: {
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnSmall: {
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 10,
    fontWeight: 600,
    cursor: 'pointer',
  },
}
