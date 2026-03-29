/**
 * Gap Detector — compares domain state against product lifecycle model.
 *
 * Produces a structured gap report with completion percentage,
 * missing/partial/complete layers, and prioritized next steps.
 */

import { LAYER_DEFINITIONS, type ProductLayer } from './product-lifecycle'
import type { DomainState } from './system-inspector'

// ── Types ─────────────────────────────────────────────────────────────

export interface GapReport {
  domain: string
  completeLayers: string[]
  partialLayers: Array<{ layer: string; detail: string }>
  missingLayers: string[]
  completionPercent: number
  nextSteps: Array<{
    priority: number
    layer: string
    action: string
    effort: 'small' | 'medium' | 'large'
  }>
}

// ── Detection Rules ──────────────────────────────────────────────────

type LayerStatus = 'complete' | 'partial' | 'missing'

function detectLayerStatus(
  layer: ProductLayer,
  state: DomainState,
): { status: LayerStatus; detail: string } {
  switch (layer) {
    case 'computation':
      if (state.hasMiniBrain && state.registeredRoutes.length > 1) {
        return { status: 'complete', detail: `${state.registeredRoutes.length} routes registered` }
      }
      if (state.hasMiniBrain) {
        return { status: 'partial', detail: 'Mini Brain exists but only default route' }
      }
      if (state.templateId) {
        return { status: 'partial', detail: 'Template exists but Mini Brain not deployed' }
      }
      return { status: 'missing', detail: 'No Mini Brain or template found' }

    case 'persistence': {
      const domainTables = state.existingTables.filter((t) => t.startsWith(state.domain))
      if (domainTables.length >= 3) {
        return { status: 'complete', detail: `${domainTables.length} domain tables` }
      }
      if (domainTables.length > 0) {
        return { status: 'partial', detail: `Only ${domainTables.length} table(s)` }
      }
      return { status: 'missing', detail: 'No domain-specific tables' }
    }

    case 'list_views':
      if (state.hasApp) {
        return { status: 'partial', detail: 'App exists — check if list pages are implemented' }
      }
      return { status: 'missing', detail: 'No Development app' }

    case 'detail_views':
      if (state.hasApp) {
        return { status: 'partial', detail: 'App exists — check if [id] detail pages exist' }
      }
      return { status: 'missing', detail: 'No Development app' }

    case 'history':
      if (
        state.hasApp &&
        state.existingTables.some((t) => t.includes('report') || t.includes('history'))
      ) {
        return { status: 'complete', detail: 'Reports/history tables exist' }
      }
      if (state.hasApp) {
        return { status: 'partial', detail: 'App exists but no report storage' }
      }
      return { status: 'missing', detail: 'No app or report storage' }

    case 'org_scoping': {
      const domainTables = state.existingTables.filter((t) => t.startsWith(state.domain))
      if (domainTables.length > 0) {
        return { status: 'complete', detail: 'Tables use organizationId pattern' }
      }
      return { status: 'missing', detail: 'No tables to scope' }
    }

    case 'relationships': {
      const hasRelTable = state.existingTables.some(
        (t) => t.includes('relationship') || t.includes('synastry'),
      )
      if (hasRelTable) {
        return { status: 'complete', detail: 'Relationship table exists' }
      }
      return { status: 'missing', detail: 'No cross-entity analysis' }
    }

    case 'sharing': {
      const hasShareTable = state.existingTables.some((t) => t.includes('share'))
      if (hasShareTable) {
        return { status: 'complete', detail: 'Share tokens table exists' }
      }
      return { status: 'missing', detail: 'No sharing infrastructure' }
    }

    case 'export':
      // Export is typically part of the detail view — hard to detect without code analysis
      if (state.hasApp && state.existingTables.some((t) => t.includes('share'))) {
        return { status: 'complete', detail: 'Print/export likely available with sharing' }
      }
      return { status: 'missing', detail: 'No export capability detected' }

    case 'engagement': {
      const hasEngagement = state.existingTables.some((t) => t.includes('engagement'))
      if (hasEngagement) {
        return { status: 'complete', detail: 'Engagement tracking table exists' }
      }
      return { status: 'missing', detail: 'No engagement/last-seen tracking' }
    }

    default:
      return { status: 'missing', detail: 'Unknown layer' }
  }
}

// ── Gap Detection ────────────────────────────────────────────────────

export function detectGaps(state: DomainState): GapReport {
  const completeLayers: string[] = []
  const partialLayers: GapReport['partialLayers'] = []
  const missingLayers: string[] = []

  for (const layer of LAYER_DEFINITIONS) {
    const { status, detail } = detectLayerStatus(layer.id, state)
    if (status === 'complete') completeLayers.push(layer.id)
    else if (status === 'partial') partialLayers.push({ layer: layer.id, detail })
    else missingLayers.push(layer.id)
  }

  const total = LAYER_DEFINITIONS.length
  const complete = completeLayers.length + partialLayers.length * 0.5
  const completionPercent = Math.round((complete / total) * 100)

  // Generate prioritized next steps from missing + partial layers
  const nextSteps: GapReport['nextSteps'] = []

  for (const layerId of missingLayers) {
    const def = LAYER_DEFINITIONS.find((l) => l.id === layerId)
    if (!def) continue

    // Check if dependencies are met
    const depsComplete = def.dependsOn.every(
      (dep) => completeLayers.includes(dep) || partialLayers.some((p) => p.layer === dep),
    )

    if (depsComplete) {
      nextSteps.push({
        priority: def.priority,
        layer: def.id,
        action: `Add ${def.label}: ${def.description}`,
        effort: def.effort,
      })
    }
  }

  for (const partial of partialLayers) {
    const def = LAYER_DEFINITIONS.find((l) => l.id === partial.layer)
    if (!def) continue
    nextSteps.push({
      priority: def.priority,
      layer: def.id,
      action: `Complete ${def.label}: ${partial.detail}`,
      effort: 'small',
    })
  }

  nextSteps.sort((a, b) => a.priority - b.priority)

  return {
    domain: state.domain,
    completeLayers,
    partialLayers,
    missingLayers,
    completionPercent,
    nextSteps: nextSteps.slice(0, 10),
  }
}
