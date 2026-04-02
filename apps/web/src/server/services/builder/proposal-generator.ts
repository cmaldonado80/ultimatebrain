/**
 * Proposal Generator — rule-based improvement suggestions.
 *
 * Combines gap reports with product usage data to propose concrete
 * improvements. All proposals require human approval before execution.
 */

import type { GapReport } from './gap-detector'

// ── Types ─────────────────────────────────────────────────────────────

export interface ProductInsights {
  domain: string
  totalEvents: number
  actionCounts: Record<string, number>
  topResources: Array<{ resourceType: string; count: number }>
  shareRate: number
  dailyActiveCount: number
}

export interface ImprovementProposal {
  domain: string
  layer: string
  title: string
  description: string
  expectedImpact: string
  confidence: number
}

// ── Rules ────────────────────────────────────────────────────────────

export function generateProposals(
  domain: string,
  gaps: GapReport,
  insights: ProductInsights | null,
): ImprovementProposal[] {
  const proposals: ImprovementProposal[] = []

  // Rule 1: Layer exists but zero usage
  if (insights && insights.totalEvents > 0) {
    for (const layer of gaps.completeLayers) {
      const layerActions = getLayerActions(layer)
      const hasUsage = layerActions.some((a) => (insights.actionCounts[a] ?? 0) > 0)
      if (!hasUsage) {
        proposals.push({
          domain,
          layer,
          title: `Improve ${layer} visibility`,
          description: `The ${layer} layer exists but has zero usage events. Consider adding prominent entry points or onboarding prompts.`,
          expectedImpact: 'Increase feature discovery and adoption',
          confidence: 0.7,
        })
      }
    }
  }

  // Rule 2: Low share rate
  if (insights && insights.totalEvents >= 10 && insights.shareRate < 0.05) {
    if (gaps.completeLayers.includes('sharing')) {
      proposals.push({
        domain,
        layer: 'sharing',
        title: 'Simplify sharing flow',
        description: `Sharing exists but only ${Math.round(insights.shareRate * 100)}% of actions involve sharing. Consider adding one-click share buttons on detail pages.`,
        expectedImpact: 'Increase distribution and viral growth',
        confidence: 0.6,
      })
    }
  }

  // Rule 3: Missing engagement despite data
  if (!gaps.completeLayers.includes('engagement') && insights && insights.totalEvents >= 20) {
    proposals.push({
      domain,
      layer: 'engagement',
      title: 'Add engagement tracking',
      description:
        'Users are active but there is no last-seen tracking. Adding a what-changed dashboard would increase return visits.',
      expectedImpact: 'Improve retention by showing evolving insights',
      confidence: 0.8,
    })
  }

  // Rule 4: Tables exist but no detail pages
  for (const partial of gaps.partialLayers) {
    if (partial.layer === 'detail_views') {
      proposals.push({
        domain,
        layer: 'detail_views',
        title: 'Complete detail pages',
        description: partial.detail,
        expectedImpact: 'Allow users to inspect individual records in depth',
        confidence: 0.9,
      })
    }
  }

  // Rule 5: No relationships despite persistence
  if (
    gaps.completeLayers.includes('persistence') &&
    !gaps.completeLayers.includes('relationships') &&
    !gaps.partialLayers.some((p) => p.layer === 'relationships')
  ) {
    proposals.push({
      domain,
      layer: 'relationships',
      title: 'Add cross-entity analysis',
      description:
        'Data records exist but there is no way to compare or relate them. Adding relationship analysis would deepen the product.',
      expectedImpact: 'Create new value from existing data through comparisons',
      confidence: 0.6,
    })
  }

  return proposals.sort((a, b) => b.confidence - a.confidence)
}

// ── Helpers ──────────────────────────────────────────────────────────

function getLayerActions(layer: string): string[] {
  switch (layer) {
    case 'sharing':
      return ['share', 'copy_link']
    case 'export':
      return ['export', 'print', 'copy']
    case 'engagement':
      return ['dashboard_view', 'what_changed']
    case 'relationships':
      return ['analyze', 'compare']
    case 'persistence':
      return ['create', 'save']
    default:
      return ['view']
  }
}
