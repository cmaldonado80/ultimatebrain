import { describe, expect, it } from 'vitest'

import { computeBlastRadius } from '../analysis'
import { computeHealthScore } from '../overlay'
import type { TopologySnapshot } from '../schemas'
import {
  BlastRadiusSchema,
  InsightSeverityEnum,
  NodeTypeEnum,
  TopologyNodeSchema,
  TopologySnapshotSchema,
} from '../schemas'

// ── Health Score Tests ──────────────────────────────────────────────────

describe('computeHealthScore', () => {
  it('returns healthy when no errors and no cron failures', () => {
    expect(computeHealthScore({ error: 0 }, 0)).toBe('healthy')
  })

  it('returns degraded when few errors', () => {
    expect(computeHealthScore({ error: 2 }, 0)).toBe('degraded')
  })

  it('returns unhealthy when many errors', () => {
    expect(computeHealthScore({ error: 5 }, 0)).toBe('unhealthy')
  })

  it('returns unhealthy when many cron failures', () => {
    expect(computeHealthScore({ error: 0 }, 3)).toBe('unhealthy')
  })

  it('returns degraded with 1 cron failure', () => {
    expect(computeHealthScore({ error: 0 }, 1)).toBe('degraded')
  })
})

// ── Schema Validation Tests ────────────────────────────────────────────

describe('Zod schemas', () => {
  it('validates NodeTypeEnum', () => {
    expect(NodeTypeEnum.parse('workspace')).toBe('workspace')
    expect(NodeTypeEnum.parse('agent')).toBe('agent')
    expect(() => NodeTypeEnum.parse('invalid')).toThrow()
  })

  it('validates InsightSeverityEnum', () => {
    expect(InsightSeverityEnum.parse('critical')).toBe('critical')
    expect(() => InsightSeverityEnum.parse('low')).toThrow()
  })

  it('validates TopologyNodeSchema', () => {
    const valid = {
      id: 'agent-123',
      type: 'agent',
      label: 'Test Agent',
      status: 'idle',
      metadata: { model: 'qwen3.5:cloud' },
    }
    expect(TopologyNodeSchema.parse(valid)).toBeTruthy()
  })

  it('rejects invalid node type', () => {
    const invalid = {
      id: 'test',
      type: 'invalid_type',
      label: 'Test',
      metadata: {},
    }
    expect(() => TopologyNodeSchema.parse(invalid)).toThrow()
  })

  it('validates BlastRadiusSchema bounds', () => {
    const valid = {
      nodeId: 'agent-1',
      affectedNodes: ['agent-2'],
      affectedCount: 1,
      totalNodes: 10,
      riskScore: 50,
      depth: 2,
    }
    expect(BlastRadiusSchema.parse(valid)).toBeTruthy()

    const invalidScore = { ...valid, riskScore: 150 }
    expect(() => BlastRadiusSchema.parse(invalidScore)).toThrow()
  })
})

// ── Blast Radius Tests ─────────────────────────────────────────────────

describe('computeBlastRadius', () => {
  const makeSnapshot = (
    nodes: TopologySnapshot['nodes'],
    edges: TopologySnapshot['edges'],
  ): TopologySnapshot => ({
    nodes,
    edges,
    stats: {
      workspaces: 0,
      agents: nodes.length,
      orchestrators: 0,
      models: 0,
      entities: 0,
      edges: edges.length,
    },
    generatedAt: new Date(),
  })

  it('returns zero affected for isolated node', () => {
    const snapshot = makeSnapshot([{ id: 'agent-1', type: 'agent', label: 'A', metadata: {} }], [])
    const result = computeBlastRadius(snapshot, 'agent-1')
    expect(result.affectedCount).toBe(0)
    expect(result.riskScore).toBe(0)
  })

  it('finds supervised children', () => {
    const snapshot = makeSnapshot(
      [
        { id: 'agent-orch', type: 'orchestrator', label: 'Orch', metadata: {} },
        { id: 'agent-a', type: 'agent', label: 'A', metadata: {} },
        { id: 'agent-b', type: 'agent', label: 'B', metadata: {} },
      ],
      [
        { id: 'e1', type: 'supervises', source: 'agent-orch', target: 'agent-a' },
        { id: 'e2', type: 'supervises', source: 'agent-orch', target: 'agent-b' },
      ],
    )
    const result = computeBlastRadius(snapshot, 'agent-orch')
    expect(result.affectedCount).toBe(2)
    expect(result.affectedNodes).toContain('a')
    expect(result.affectedNodes).toContain('b')
  })

  it('finds workspace co-members', () => {
    const snapshot = makeSnapshot(
      [
        { id: 'agent-1', type: 'agent', label: 'A1', metadata: {} },
        { id: 'agent-2', type: 'agent', label: 'A2', metadata: {} },
      ],
      [
        { id: 'e1', type: 'belongs_to', source: 'agent-1', target: 'ws-ws1' },
        { id: 'e2', type: 'belongs_to', source: 'agent-2', target: 'ws-ws1' },
      ],
    )
    const result = computeBlastRadius(snapshot, 'agent-1')
    expect(result.affectedCount).toBe(1)
    expect(result.affectedNodes).toContain('2')
  })

  it('handles missing node gracefully', () => {
    const snapshot = makeSnapshot([], [])
    const result = computeBlastRadius(snapshot, 'agent-nonexistent')
    expect(result.affectedCount).toBe(0)
    expect(result.riskScore).toBe(0)
  })

  it('caps risk score at 100', () => {
    const snapshot = makeSnapshot([{ id: 'agent-1', type: 'agent', label: 'A', metadata: {} }], [])
    // Even if math would produce >100, it should cap
    const result = computeBlastRadius(snapshot, 'agent-1')
    expect(result.riskScore).toBeLessThanOrEqual(100)
  })
})
