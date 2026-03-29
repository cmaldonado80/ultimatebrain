/**
 * Legal Contract Review — shared types
 *
 * Mirrors the contract from the Legal Mini Brain endpoint.
 */

export interface ContractReviewInput {
  title?: string
  contractText: string
  contractType?: 'nda' | 'employment' | 'service' | 'license' | 'general'
  focusAreas?: string[]
}

export interface KeyClause {
  name: string
  excerpt: string
  assessment: string
}

export interface RiskFlag {
  severity: 'high' | 'medium' | 'low'
  area: string
  description: string
  recommendation: string
}

export interface ContractReviewResponse {
  title: string
  summary: string
  contractType: string
  keyClauses: KeyClause[]
  riskFlags: RiskFlag[]
  recommendations: string[]
  analyzedAt: string
}
