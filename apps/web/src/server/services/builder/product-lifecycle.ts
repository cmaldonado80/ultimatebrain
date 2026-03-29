/**
 * Product Lifecycle Model — codified knowledge from Astrology reference implementation.
 *
 * Defines the canonical product layers and what signals indicate completion.
 * Used by the gap detector to compare domain state against the ideal product.
 */

// ── Layer Definitions ────────────────────────────────────────────────

export const PRODUCT_LAYERS = [
  'computation',
  'persistence',
  'list_views',
  'detail_views',
  'history',
  'sharing',
  'export',
  'engagement',
  'relationships',
  'org_scoping',
] as const

export type ProductLayer = (typeof PRODUCT_LAYERS)[number]

export interface LayerDefinition {
  id: ProductLayer
  label: string
  description: string
  priority: number // 1 = must-have first, 10 = nice-to-have
  effort: 'small' | 'medium' | 'large'
  dependsOn: ProductLayer[]
}

export const LAYER_DEFINITIONS: LayerDefinition[] = [
  {
    id: 'computation',
    label: 'Computation',
    description: 'Mini Brain routes that compute domain data',
    priority: 1,
    effort: 'large',
    dependsOn: [],
  },
  {
    id: 'persistence',
    label: 'Persistence',
    description: 'Database tables that store domain objects',
    priority: 2,
    effort: 'medium',
    dependsOn: ['computation'],
  },
  {
    id: 'list_views',
    label: 'List Views',
    description: 'App pages that list saved collections',
    priority: 3,
    effort: 'medium',
    dependsOn: ['persistence'],
  },
  {
    id: 'detail_views',
    label: 'Detail Views',
    description: 'App pages that display individual records',
    priority: 3,
    effort: 'medium',
    dependsOn: ['persistence'],
  },
  {
    id: 'history',
    label: 'History',
    description: 'Revisitable past results',
    priority: 4,
    effort: 'small',
    dependsOn: ['list_views', 'detail_views'],
  },
  {
    id: 'org_scoping',
    label: 'Org Scoping',
    description: 'organizationId on all tables, org-filtered queries',
    priority: 4,
    effort: 'small',
    dependsOn: ['persistence'],
  },
  {
    id: 'relationships',
    label: 'Relationships',
    description: 'Cross-entity analysis (synastry, comparisons)',
    priority: 5,
    effort: 'large',
    dependsOn: ['computation', 'persistence'],
  },
  {
    id: 'sharing',
    label: 'Sharing',
    description: 'Share tokens + public read-only pages',
    priority: 6,
    effort: 'medium',
    dependsOn: ['detail_views'],
  },
  {
    id: 'export',
    label: 'Export',
    description: 'Print/PDF/clipboard export',
    priority: 7,
    effort: 'small',
    dependsOn: ['detail_views'],
  },
  {
    id: 'engagement',
    label: 'Engagement',
    description: 'Last-seen tracking + what-changed dashboard',
    priority: 8,
    effort: 'medium',
    dependsOn: ['persistence', 'computation'],
  },
]

// ── Reference Model (Astrology) ──────────────────────────────────────

/** What a fully complete domain product looks like, based on Astrology */
export const ASTROLOGY_REFERENCE = {
  domain: 'astrology',
  tables: [
    'astrology_charts',
    'astrology_reports',
    'astrology_relationships',
    'astrology_share_tokens',
    'astrology_engagement',
  ],
  routes: [
    '/astrology/natal-summary',
    '/astrology/report',
    '/astrology/transits',
    '/astrology/timeline',
    '/astrology/synastry',
  ],
  pages: [
    '/dashboard',
    '/charts',
    '/charts/[id]',
    '/reports',
    '/reports/[id]',
    '/relationships',
    '/relationships/[id]',
    '/insights',
    '/share/[token]',
  ],
  completeLayers: PRODUCT_LAYERS as unknown as string[],
}
