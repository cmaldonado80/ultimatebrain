/**
 * ATLAS Freshness Scanner — detects undocumented files in the codebase
 * and creates tickets for documentation updates.
 *
 * Runs as a weekly cron job. Scans routers, services, pages, and API routes
 * against the ATLAS.md and BRAIN-ARCHITECTURE.md to find "dark matter" files
 * that aren't referenced in any documentation.
 */

import * as fs from 'fs'
import * as path from 'path'
import type { Database } from '@solarc/db'
import { tickets } from '@solarc/db'

export interface FreshnessScanResult {
  scannedAt: Date
  totalFiles: number
  coveredFiles: number
  uncoveredFiles: string[]
  newRouters: string[]
  newServices: string[]
  newPages: string[]
  newApiRoutes: string[]
}

/** Directories to scan, relative to the web app src */
const SCAN_TARGETS = [
  { dir: 'server/routers', pattern: /\.ts$/, category: 'newRouters' as const },
  { dir: 'server/services', pattern: null, category: 'newServices' as const }, // scan subdirectories
  { dir: 'app', pattern: /page\.tsx$/, category: 'newPages' as const },
  { dir: 'app/api', pattern: /route\.ts$/, category: 'newApiRoutes' as const },
]

/** Files/dirs to always ignore */
const IGNORE_PATTERNS = [
  '__tests__',
  '.test.',
  '.spec.',
  'node_modules',
  '.next',
  'index.ts', // barrel exports
]

/**
 * Recursively list files in a directory matching a pattern.
 */
function listFiles(dir: string, pattern: RegExp | null, depth = 0): string[] {
  const results: string[] = []

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (IGNORE_PATTERNS.some((p) => entry.name.includes(p))) continue

      if (entry.isDirectory()) {
        if (pattern === null && depth === 0) {
          // For services, collect directory names at depth 0
          results.push(entry.name)
        } else {
          results.push(...listFiles(fullPath, pattern, depth + 1))
        }
      } else if (pattern && pattern.test(entry.name)) {
        results.push(entry.name.replace(/\.(ts|tsx)$/, ''))
      }
    }
  } catch {
    // Directory doesn't exist — skip
  }

  return results
}

/**
 * Load all documentation files and build a combined text to search against.
 */
function loadDocumentationText(): string {
  const docFiles = [
    path.resolve(process.cwd(), 'BRAIN-ARCHITECTURE.md'),
    path.join(__dirname, 'ATLAS.md'),
  ]

  const parts: string[] = []
  for (const filePath of docFiles) {
    try {
      parts.push(fs.readFileSync(filePath, 'utf-8'))
    } catch {
      // File not found — skip
    }
  }

  return parts.join('\n')
}

/**
 * Check if a filename is mentioned in the documentation text.
 */
function isCovered(name: string, docText: string): boolean {
  // Check exact name, with common variations
  const variations = [
    name, // e.g. "agents"
    `${name}.ts`,
    `${name}.tsx`,
    `${name}/`,
    `/${name}`,
    name.replace(/-/g, ' '), // kebab to words
  ]

  return variations.some((v) => docText.toLowerCase().includes(v.toLowerCase()))
}

export class AtlasFreshnessScanner {
  constructor(private db: Database) {}

  /**
   * Scan the codebase and check coverage against documentation.
   */
  async scan(): Promise<FreshnessScanResult> {
    const srcDir = path.resolve(__dirname, '../../..')
    const docText = loadDocumentationText()

    const result: FreshnessScanResult = {
      scannedAt: new Date(),
      totalFiles: 0,
      coveredFiles: 0,
      uncoveredFiles: [],
      newRouters: [],
      newServices: [],
      newPages: [],
      newApiRoutes: [],
    }

    for (const target of SCAN_TARGETS) {
      const targetDir = path.join(srcDir, target.dir)
      const files = listFiles(targetDir, target.pattern)

      for (const file of files) {
        result.totalFiles++
        if (isCovered(file, docText)) {
          result.coveredFiles++
        } else {
          result.uncoveredFiles.push(`${target.dir}/${file}`)
          result[target.category].push(file)
        }
      }
    }

    return result
  }

  /**
   * Create documentation tickets for uncovered files.
   * Groups related files into a single ticket to avoid ticket spam.
   */
  async createDiscoveryTickets(scanResult: FreshnessScanResult): Promise<number> {
    let ticketsCreated = 0

    const groups: Array<{ title: string; files: string[] }> = []

    if (scanResult.newRouters.length > 0) {
      groups.push({
        title: 'Document new tRPC routers in ATLAS',
        files: scanResult.newRouters.map((f) => `server/routers/${f}.ts`),
      })
    }

    if (scanResult.newServices.length > 0) {
      groups.push({
        title: 'Document new services in ATLAS',
        files: scanResult.newServices.map((f) => `server/services/${f}/`),
      })
    }

    if (scanResult.newPages.length > 0) {
      groups.push({
        title: 'Document new UI pages in ATLAS',
        files: scanResult.newPages.map((f) => `app/${f}/page.tsx`),
      })
    }

    if (scanResult.newApiRoutes.length > 0) {
      groups.push({
        title: 'Document new API routes in ATLAS',
        files: scanResult.newApiRoutes.map((f) => `app/api/${f}/route.ts`),
      })
    }

    for (const group of groups) {
      const description = [
        `ATLAS freshness scan detected undocumented files (${scanResult.scannedAt.toISOString()}).`,
        '',
        'Undocumented files:',
        ...group.files.map((f) => `- \`${f}\``),
        '',
        'Action: Update ATLAS.md and/or BRAIN-ARCHITECTURE.md to include these files.',
        `Coverage: ${scanResult.coveredFiles}/${scanResult.totalFiles} files documented.`,
      ].join('\n')

      try {
        await this.db.insert(tickets).values({
          title: group.title,
          description,
          priority: 'low',
          complexity: 'easy',
          executionMode: 'quick',
        })
        ticketsCreated++
      } catch (err) {
        console.warn('[ATLAS] Failed to create ticket:', err)
      }
    }

    return ticketsCreated
  }
}
