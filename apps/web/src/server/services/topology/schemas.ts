/**
 * Topology Schemas — Zod-backed contracts for the Swarm Observatory.
 * All topology data flows through these schemas at service boundaries.
 */
import { z } from 'zod'

// ── Node Types ─────────────────────────────────────────────────────────

export const NodeTypeEnum = z.enum(['workspace', 'agent', 'orchestrator', 'model', 'entity'])

export const EdgeTypeEnum = z.enum([
  'belongs_to',
  'delegates_to',
  'supervises',
  'uses_model',
  'entity_agent',
  'entity_child',
])

// ── Core Schemas ───────────────────────────────────────────────────────

export const TopologyNodeSchema = z.object({
  id: z.string(),
  type: NodeTypeEnum,
  label: z.string(),
  status: z.string().optional(),
  workspaceId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  metadata: z.record(z.unknown()),
})

export const TopologyEdgeSchema = z.object({
  id: z.string(),
  type: EdgeTypeEnum,
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const TopologyStatsSchema = z.object({
  workspaces: z.number(),
  agents: z.number(),
  orchestrators: z.number(),
  models: z.number(),
  entities: z.number(),
  edges: z.number(),
})

export const TopologySnapshotSchema = z.object({
  nodes: z.array(TopologyNodeSchema),
  edges: z.array(TopologyEdgeSchema),
  stats: TopologyStatsSchema,
  generatedAt: z.date(),
})

// ── Runtime Overlay ────────────────────────────────────────────────────

export const AgentStatusSchema = z.object({
  status: z.string(),
  currentTicket: z.string().optional(),
})

export const StatusCountsSchema = z.object({
  idle: z.number(),
  executing: z.number(),
  error: z.number(),
  offline: z.number(),
})

export const RuntimeOverlaySchema = z.object({
  agentStatuses: z.record(AgentStatusSchema),
  statusCounts: StatusCountsSchema,
  pendingApprovals: z.number(),
  cronSummary: z.object({
    active: z.number(),
    failed: z.number(),
    total: z.number(),
  }),
  healthScore: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.date(),
})

// ── Insights ───────────────────────────────────────────────────────────

export const InsightSeverityEnum = z.enum(['info', 'warning', 'critical'])

export const InsightSchema = z.object({
  id: z.string(),
  severity: InsightSeverityEnum,
  title: z.string(),
  description: z.string(),
  nodeIds: z.array(z.string()),
})

// ── Blast Radius ───────────────────────────────────────────────────────

export const BlastRadiusSchema = z.object({
  nodeId: z.string(),
  affectedNodes: z.array(z.string()),
  affectedCount: z.number(),
  totalNodes: z.number(),
  riskScore: z.number().min(0).max(100),
  depth: z.number(),
})

// ── Inferred Types ─────────────────────────────────────────────────────

export type TopologyNode = z.infer<typeof TopologyNodeSchema>
export type TopologyEdge = z.infer<typeof TopologyEdgeSchema>
export type TopologySnapshot = z.infer<typeof TopologySnapshotSchema>
export type RuntimeOverlay = z.infer<typeof RuntimeOverlaySchema>
export type Insight = z.infer<typeof InsightSchema>
export type BlastRadiusResult = z.infer<typeof BlastRadiusSchema>
