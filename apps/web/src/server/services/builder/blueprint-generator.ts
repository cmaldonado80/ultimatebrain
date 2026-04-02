/**
 * Blueprint Generator — produces domain product blueprints.
 *
 * Uses factory template definitions + product lifecycle model to generate
 * a complete product design for any domain.
 */

import { MiniBrainFactory } from '../../services/mini-brain-factory/factory'
import { LAYER_DEFINITIONS } from './product-lifecycle'

// ── Types ─────────────────────────────────────────────────────────────

export interface DomainBlueprint {
  domain: string
  coreCapabilities: string[]
  suggestedAgents: Array<{ name: string; role: string }>
  productLayers: Array<{ id: string; label: string; description: string }>
  dataModel: {
    tables: Array<{ name: string; purpose: string; keyColumns: string[] }>
  }
  miniBrainRoutes: Array<{ path: string; method: string; purpose: string }>
  appPages: Array<{ route: string; purpose: string }>
  developmentTemplates: string[]
}

// ── Generator ────────────────────────────────────────────────────────

let _factory: MiniBrainFactory | null = null

export function generateBlueprint(domain: string, _objective?: string): DomainBlueprint {
  const domainLower = domain.toLowerCase()
  _factory ??= new MiniBrainFactory()

  const template = _factory.getTemplate(domainLower as Parameters<typeof _factory.getTemplate>[0])

  // Core capabilities from template or generic
  const coreCapabilities = template?.engines ?? [
    'domain-computation',
    'data-analysis',
    'report-generation',
  ]

  // Agents from template or generic
  const suggestedAgents = template?.agents
    ? template.agents.map((a) => ({ name: a.name, role: a.role }))
    : [
        { name: `${domain} Analyst`, role: 'Primary domain computation and analysis' },
        { name: `${domain} Reporter`, role: 'Report generation and narrative' },
      ]

  // Product layers
  const productLayers = LAYER_DEFINITIONS.map((l) => ({
    id: l.id,
    label: l.label,
    description: l.description,
  }))

  // Data model — domain-specific tables following the astrology pattern
  const prefix = domainLower
  const dataModel = {
    tables: [
      {
        name: `${prefix}_records`,
        purpose: 'Primary domain objects (equivalent to charts)',
        keyColumns: [
          'id',
          'organizationId',
          'createdByUserId',
          'name',
          'data (jsonb)',
          'createdAt',
        ],
      },
      {
        name: `${prefix}_reports`,
        purpose: 'Generated analysis reports with sections',
        keyColumns: [
          'id',
          'organizationId',
          'recordId (FK)',
          'reportType',
          'sections (jsonb)',
          'createdAt',
        ],
      },
      {
        name: `${prefix}_relationships`,
        purpose: 'Cross-entity comparisons and analysis',
        keyColumns: [
          'id',
          'organizationId',
          'entityAData (jsonb)',
          'entityBData (jsonb)',
          'score',
          'createdAt',
        ],
      },
      {
        name: `${prefix}_share_tokens`,
        purpose: 'Public sharing via token-based URLs',
        keyColumns: [
          'id',
          'resourceType',
          'resourceId',
          'token (unique)',
          'revokedAt',
          'createdAt',
        ],
      },
      {
        name: `${prefix}_engagement`,
        purpose: 'Last-seen tracking for what-changed dashboard',
        keyColumns: ['id', 'userId', 'recordId', 'lastSeenAt'],
      },
    ],
  }

  // Mini Brain routes
  const miniBrainRoutes = [
    { path: `/${domainLower}/compute`, method: 'POST', purpose: 'Primary domain computation' },
    { path: `/${domainLower}/report`, method: 'POST', purpose: 'Generate detailed report' },
    { path: `/${domainLower}/analyze`, method: 'POST', purpose: 'Cross-entity analysis' },
    {
      path: `/${domainLower}/insights`,
      method: 'POST',
      purpose: 'Time-based insights (transits equivalent)',
    },
    { path: `/${domainLower}/timeline`, method: 'POST', purpose: 'Significant events timeline' },
  ]

  // App pages
  const appPages = [
    { route: '/', purpose: 'Input form for primary computation' },
    { route: '/dashboard', purpose: 'Personal intelligence hub with what-changed' },
    { route: `/${domainLower}`, purpose: 'List of saved records' },
    { route: `/${domainLower}/[id]`, purpose: 'Record detail view' },
    { route: '/reports', purpose: 'Saved reports list' },
    { route: '/reports/[id]', purpose: 'Report detail with sections' },
    { route: '/relationships', purpose: 'Cross-entity analyses' },
    { route: '/relationships/[id]', purpose: 'Analysis detail' },
    { route: '/insights', purpose: 'Time-based insights view' },
    { route: '/share/[token]', purpose: 'Public shared view (no auth)' },
  ]

  // Development templates
  const developmentTemplates = template
    ? _factory.getDevelopmentTemplates(
        domainLower as Parameters<typeof _factory.getDevelopmentTemplates>[0],
      )
    : []

  return {
    domain: domainLower,
    coreCapabilities,
    suggestedAgents,
    productLayers,
    dataModel,
    miniBrainRoutes,
    appPages,
    developmentTemplates,
  }
}
