/**
 * Deterministic test fixtures with fixed UUIDs for reproducible assertions.
 * Field shapes match the Drizzle schemas in @solarc/db.
 */

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'
const AGENT_ID     = '00000000-0000-0000-0000-000000000002'
const TICKET_ID    = '00000000-0000-0000-0000-000000000003'
const MEMORY_ID    = '00000000-0000-0000-0000-000000000004'
const DATASET_ID   = '00000000-0000-0000-0000-000000000005'

const NOW = new Date('2026-01-01T00:00:00.000Z')

export const sampleWorkspace = {
  id: WORKSPACE_ID,
  name: 'Test Workspace',
  ownerId: '00000000-0000-0000-0000-000000000099',
  createdAt: NOW,
  updatedAt: NOW,
}

export const sampleAgent = {
  id: AGENT_ID,
  name: 'Test Agent',
  type: 'executor',
  status: 'idle' as const,
  workspaceId: WORKSPACE_ID,
  createdAt: NOW,
  updatedAt: NOW,
}

export const sampleTicket = {
  id: TICKET_ID,
  title: 'Test Ticket',
  status: 'queued' as const,
  priority: 'medium' as const,
  complexity: 'medium' as const,
  workspaceId: WORKSPACE_ID,
  createdAt: NOW,
  updatedAt: NOW,
}

export const sampleMemory = {
  id: MEMORY_ID,
  key: 'test-fact',
  content: 'The sky is blue',
  tier: 'core' as const,
  confidence: 0.95,
  createdAt: NOW,
  updatedAt: NOW,
}

export const sampleEvalDataset = {
  id: DATASET_ID,
  name: 'Test Dataset',
  version: '1.0',
  createdAt: NOW,
  updatedAt: NOW,
}
