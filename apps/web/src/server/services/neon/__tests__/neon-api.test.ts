import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createNeonBranch,
  deleteNeonBranch,
  getNeonBranchStatus,
  maskConnectionUri,
} from '../neon-api'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('Neon API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createNeonBranch', () => {
    it('should create a branch and return connection info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          branch: { id: 'br-123', name: 'mb-test' },
          endpoints: [{ id: 'ep-456', host: 'ep-456.us-east-2.aws.neon.tech' }],
          connection_uris: [{ connection_uri: 'postgresql://user:pass@host/db' }],
        }),
      })

      const result = await createNeonBranch({
        apiKey: 'test-key',
        projectId: 'proj-1',
        branchName: 'mb-test',
      })

      expect(result.branchId).toBe('br-123')
      expect(result.endpointId).toBe('ep-456')
      expect(result.host).toBe('ep-456.us-east-2.aws.neon.tech')
      expect(result.connectionUri).toBe('postgresql://user:pass@host/db')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/projects/proj-1/branches'),
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      })

      await expect(
        createNeonBranch({ apiKey: 'bad', projectId: 'p', branchName: 'b' }),
      ).rejects.toThrow('Neon API error (401)')
    })
  })

  describe('deleteNeonBranch', () => {
    it('should delete a branch', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

      await deleteNeonBranch({
        apiKey: 'test-key',
        projectId: 'proj-1',
        branchId: 'br-123',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/projects/proj-1/branches/br-123'),
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  describe('getNeonBranchStatus', () => {
    it('should return branch status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          branch: { state: 'ready', name: 'mb-test', created_at: '2026-01-01' },
        }),
      })

      const status = await getNeonBranchStatus({
        apiKey: 'test-key',
        projectId: 'proj-1',
        branchId: 'br-123',
      })

      expect(status.state).toBe('ready')
      expect(status.name).toBe('mb-test')
    })
  })

  describe('maskConnectionUri', () => {
    it('should mask password in connection URI', () => {
      const masked = maskConnectionUri('postgresql://user:secretpass@host.neon.tech:5432/mydb')
      expect(masked).toContain('user:***')
      expect(masked).not.toContain('secretpass')
      expect(masked).toContain('host.neon.tech')
    })

    it('should handle URI without password', () => {
      const masked = maskConnectionUri('postgresql://host.neon.tech/mydb')
      expect(masked).toContain('host.neon.tech')
    })
  })
})
