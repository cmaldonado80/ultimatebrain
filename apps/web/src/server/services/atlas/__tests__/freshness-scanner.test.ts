import { describe, expect, it } from 'vitest'

import { AtlasFreshnessScanner } from '../freshness-scanner'

// Provide a fake DB — scan() doesn't use it, only createDiscoveryTickets does
const fakeDb = {} as Parameters<
  typeof AtlasFreshnessScanner extends new (db: infer D) => unknown ? D : never
>[0]

describe('AtlasFreshnessScanner', () => {
  const scanner = new AtlasFreshnessScanner(fakeDb as never)

  describe('scan()', () => {
    it('should return a FreshnessScanResult with expected shape', async () => {
      const result = await scanner.scan()
      expect(result).toHaveProperty('scannedAt')
      expect(result.scannedAt).toBeInstanceOf(Date)
      expect(typeof result.totalFiles).toBe('number')
      expect(typeof result.coveredFiles).toBe('number')
      expect(Array.isArray(result.uncoveredFiles)).toBe(true)
      expect(Array.isArray(result.newRouters)).toBe(true)
      expect(Array.isArray(result.newServices)).toBe(true)
      expect(Array.isArray(result.newPages)).toBe(true)
      expect(Array.isArray(result.newApiRoutes)).toBe(true)
    })

    it('should find routers, services, and pages', async () => {
      const result = await scanner.scan()
      // The project has 34+ routers, 20+ services, 30+ pages — should find some
      expect(result.totalFiles).toBeGreaterThan(10)
    })

    it('should have covered + uncovered = total', async () => {
      const result = await scanner.scan()
      expect(result.coveredFiles + result.uncoveredFiles.length).toBe(result.totalFiles)
    })

    it('should have some covered files (docs exist)', async () => {
      const result = await scanner.scan()
      expect(result.coveredFiles).toBeGreaterThan(0)
    })

    it('should categorize uncovered files', async () => {
      const result = await scanner.scan()
      const categorized =
        result.newRouters.length +
        result.newServices.length +
        result.newPages.length +
        result.newApiRoutes.length
      expect(categorized).toBe(result.uncoveredFiles.length)
    })
  })
})
