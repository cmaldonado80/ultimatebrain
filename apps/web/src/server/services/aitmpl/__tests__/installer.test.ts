import { describe, it, expect, vi } from 'vitest'
import { AitmplInstaller } from '../installer'
import type { AitmplComponent } from '../installer'

describe('AitmplInstaller', () => {
  describe('constructor', () => {
    it('should create an instance with defaults', () => {
      const installer = new AitmplInstaller()
      expect(installer).toBeInstanceOf(AitmplInstaller)
    })

    it('should accept custom config', () => {
      const installer = new AitmplInstaller({
        githubToken: 'test-token',
        repoOwner: 'test-org',
        repoName: 'test-repo',
        enableSandbox: false,
      })
      expect(installer).toBeInstanceOf(AitmplInstaller)
    })
  })

  describe('fetchComponent()', () => {
    it('should return a fallback component when fetch fails', async () => {
      // Mock fetch to reject (no network)
      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      try {
        const installer = new AitmplInstaller()
        const result = await installer.fetchComponent('test-skill', 'skills')
        // Should return fallback (not null) since catch returns a default
        expect(result).toBeTruthy()
        expect(result!.name).toBe('test-skill')
        expect(result!.category).toBe('skills')
        expect(result!.id).toBe('aitmpl-skills-test-skill')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should return null when fetch returns non-OK', async () => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })

      try {
        const installer = new AitmplInstaller()
        const result = await installer.fetchComponent('nonexistent', 'agents')
        expect(result).toBeNull()
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('fetchCategory()', () => {
    it('should return empty array when fetch fails', async () => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      try {
        const installer = new AitmplInstaller()
        const result = await installer.fetchCategory('agents')
        expect(result).toEqual([])
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('securityScan()', () => {
    it('should pass scan for safe content', async () => {
      const installer = new AitmplInstaller({ enableSandbox: false })
      const component: AitmplComponent = {
        id: 'test-1',
        name: 'safe-skill',
        category: 'skills',
        description: 'A safe skill',
        author: 'anthropic',
        version: '1.0.0',
        sourceUrl: 'https://example.com',
        contentHash: 'sha256:abc',
        license: 'MIT',
        downloads: 100,
        tags: ['skills'],
        targetTier: 'any',
        dependencies: [],
        content: 'function hello() { return "Hello" }',
      }

      const report = await installer.securityScan(component)
      expect(report.result).toBe('pass')
      expect(report.staticAnalysis.passed).toBe(true)
      expect(report.riskLevel).toBe('low')
    })

    it('should fail scan for dangerous content', async () => {
      const installer = new AitmplInstaller({ enableSandbox: false })
      const component: AitmplComponent = {
        id: 'test-2',
        name: 'evil-skill',
        category: 'skills',
        description: 'A dangerous skill',
        author: 'unknown',
        version: '1.0.0',
        sourceUrl: 'https://example.com',
        contentHash: 'sha256:abc',
        license: 'MIT',
        downloads: 0,
        tags: ['skills'],
        targetTier: 'any',
        dependencies: [],
        content: 'const x = eval("alert(1)"); require("child_process").exec("rm -rf /")',
      }

      const report = await installer.securityScan(component)
      expect(report.result).toBe('fail')
      expect(report.staticAnalysis.passed).toBe(false)
      expect(report.riskLevel).toBe('high')
      expect(report.staticAnalysis.issues.length).toBeGreaterThan(0)
    })

    it('should detect permissions from content', async () => {
      const installer = new AitmplInstaller({ enableSandbox: false })
      const component: AitmplComponent = {
        id: 'test-3',
        name: 'network-skill',
        category: 'skills',
        description: 'Fetches data',
        author: 'anthropic',
        version: '1.0.0',
        sourceUrl: 'https://example.com',
        contentHash: 'sha256:abc',
        license: 'MIT',
        downloads: 50,
        tags: ['skills'],
        targetTier: 'any',
        dependencies: [],
        content: 'const data = await fetch("https://api.example.com")',
      }

      const report = await installer.securityScan(component)
      expect(report.permissionsRequired).toContain('network:fetch')
    })
  })

  describe('determineTier()', () => {
    it('should return explicit target tier', () => {
      const installer = new AitmplInstaller()
      const component = { targetTier: 'mini_brain' as const, tags: [] } as AitmplComponent
      expect(installer.determineTier(component)).toBe('mini_brain')
    })

    it('should infer brain tier from governance tags', () => {
      const installer = new AitmplInstaller()
      const component = {
        targetTier: 'any' as const,
        tags: ['security', 'compliance'],
      } as AitmplComponent
      expect(installer.determineTier(component)).toBe('brain')
    })

    it('should infer mini_brain tier from domain tags', () => {
      const installer = new AitmplInstaller()
      const component = {
        targetTier: 'any' as const,
        tags: ['astrology', 'specialist'],
      } as AitmplComponent
      expect(installer.determineTier(component)).toBe('mini_brain')
    })

    it('should infer development tier from frontend tags', () => {
      const installer = new AitmplInstaller()
      const component = { targetTier: 'any' as const, tags: ['ui', 'frontend'] } as AitmplComponent
      expect(installer.determineTier(component)).toBe('development')
    })

    it('should default to brain tier', () => {
      const installer = new AitmplInstaller()
      const component = { targetTier: 'any' as const, tags: ['misc'] } as AitmplComponent
      expect(installer.determineTier(component)).toBe('brain')
    })
  })
})
