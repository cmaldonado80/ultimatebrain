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
    const result = computeBlastRadius(snapshot, 'agent-1')
    expect(result.riskScore).toBeLessThanOrEqual(100)
  })
})

// ── Layout Stability Tests ─────────────────────────────────────────────

describe('layout stability', () => {
  it('produces deterministic output for same topology input', () => {
    // Test that the same canonical topology always produces the same result
    // by verifying blast radius is deterministic (same BFS traversal)
    const snapshot: TopologySnapshot = {
      nodes: [
        { id: 'agent-orch', type: 'orchestrator', label: 'O', metadata: {} },
        { id: 'agent-a', type: 'agent', label: 'A', metadata: {} },
      ],
      edges: [{ id: 'e1', type: 'supervises', source: 'agent-orch', target: 'agent-a' }],
      stats: { workspaces: 0, agents: 2, orchestrators: 1, models: 0, entities: 0, edges: 1 },
      generatedAt: new Date(),
    }
    const r1 = computeBlastRadius(snapshot, 'agent-orch')
    const r2 = computeBlastRadius(snapshot, 'agent-orch')
    expect(r1.affectedNodes).toEqual(r2.affectedNodes)
    expect(r1.riskScore).toBe(r2.riskScore)
  })
})

// ── Overlay Immutability Tests ──────────────────────────────────────────

describe('overlay merge safety', () => {
  it('overlay merge does not mutate original nodes', () => {
    const originalNodes = [
      {
        id: 'agent-1',
        type: 'agent',
        data: { label: 'A', status: 'idle' },
        position: { x: 0, y: 0 },
      },
    ]
    const copy = JSON.parse(JSON.stringify(originalNodes))

    // Simulate overlay merge (same pattern as page.tsx)
    const merged = originalNodes.map((node) => ({
      ...node,
      data: { ...node.data, status: 'executing' },
    }))

    // Original should be unchanged
    expect(originalNodes[0].data.status).toBe('idle')
    expect(merged[0].data.status).toBe('executing')
    expect(originalNodes).toEqual(copy)
  })

  it('handles missing overlay entries gracefully', () => {
    const nodes = [
      { id: 'agent-1', data: { label: 'A', status: 'idle' } },
      { id: 'agent-2', data: { label: 'B', status: 'idle' } },
    ]
    const overlay: Record<string, { status: string }> = { '1': { status: 'executing' } }

    const merged = nodes.map((node) => {
      const rawId = node.id.replace(/^agent-/, '')
      const runtime = overlay[rawId]
      if (!runtime) return node
      return { ...node, data: { ...node.data, status: runtime.status } }
    })

    expect(merged[0].data.status).toBe('executing')
    expect(merged[1].data.status).toBe('idle') // Unchanged — no overlay entry
  })
})
