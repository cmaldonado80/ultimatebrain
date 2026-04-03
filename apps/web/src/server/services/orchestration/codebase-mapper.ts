/**
 * Codebase Mapper — gives agents a structured understanding of the project.
 *
 * Scans the project directory, categorizes files by subsystem, and produces
 * a map that agents can use to create review tickets for the right specialists.
 *
 * Categories:
 *   ui       → pages, components, styles (Design department)
 *   api      → tRPC routers, API routes (Engineering)
 *   services → business logic, engines (Engineering)
 *   db       → schema, migrations (Engineering)
 *   config   → package.json, tsconfig, etc. (Engineering)
 *   tests    → test files (QA)
 */

import * as fs from 'fs'
import * as path from 'path'

// ── Types ────────────────────────────────────────────────────────────────

export interface CodebaseFile {
  path: string
  category: FileCategory
  lines: number
  sizeBytes: number
}

export type FileCategory = 'ui' | 'api' | 'services' | 'db' | 'config' | 'tests' | 'other'

export interface CodebaseSubsystem {
  name: string
  category: FileCategory
  department: 'engineering' | 'design' | 'qa'
  files: CodebaseFile[]
  totalLines: number
  totalFiles: number
  description: string
}

export interface CodebaseMap {
  scannedAt: Date
  rootDir: string
  totalFiles: number
  totalLines: number
  subsystems: CodebaseSubsystem[]
}

export interface ReviewTicket {
  title: string
  description: string
  department: 'engineering' | 'design' | 'qa'
  subsystem: string
  files: string[]
  priority: 'low' | 'medium' | 'high'
}

// ── Classification ───────────────────────────────────────────────────────

function categorizeFile(filePath: string): FileCategory {
  if (filePath.includes('__tests__') || filePath.includes('.test.') || filePath.includes('.spec.'))
    return 'tests'
  if (filePath.includes('/app/') && filePath.endsWith('.tsx')) return 'ui'
  if (filePath.includes('/components/')) return 'ui'
  if (filePath.includes('/hooks/')) return 'ui'
  if (filePath.includes('/routers/')) return 'api'
  if (filePath.includes('/app/api/')) return 'api'
  if (filePath.includes('/services/')) return 'services'
  if (filePath.includes('/schema/') || filePath.includes('/db/')) return 'db'
  if (
    filePath.endsWith('.json') ||
    filePath.endsWith('.config.ts') ||
    filePath.endsWith('.config.js')
  )
    return 'config'
  return 'other'
}

function departmentForCategory(cat: FileCategory): 'engineering' | 'design' | 'qa' {
  switch (cat) {
    case 'ui':
      return 'design'
    case 'tests':
      return 'qa'
    default:
      return 'engineering'
  }
}

// ── Scanner ──────────────────────────────────────────────────────────────

const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', 'dist', '.turbo', '.generated-test'])
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.css'])

function scanDir(dir: string, rootDir: string): CodebaseFile[] {
  const files: CodebaseFile[] = []

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env.local.example') continue
      if (IGNORE_DIRS.has(entry.name)) continue

      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...scanDir(fullPath, rootDir))
      } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
        try {
          const stat = fs.statSync(fullPath)
          const content = fs.readFileSync(fullPath, 'utf-8')
          const relativePath = path.relative(rootDir, fullPath)
          files.push({
            path: relativePath,
            category: categorizeFile(relativePath),
            lines: content.split('\n').length,
            sizeBytes: stat.size,
          })
        } catch {
          // Skip unreadable files
        }
      }
    }
  } catch {
    // Skip unreadable dirs
  }

  return files
}

// ── Mapper ───────────────────────────────────────────────────────────────

export class CodebaseMapper {
  /**
   * Scan the project and produce a structured map.
   */
  scan(rootDir: string): CodebaseMap {
    const files = scanDir(rootDir, rootDir)

    // Group files into subsystems by directory
    const subsystemMap = new Map<string, CodebaseFile[]>()
    for (const file of files) {
      // Extract subsystem from path (e.g., "apps/web/src/server/services/healing" → "healing")
      const parts = file.path.split('/')
      let subsystemName: string

      if (file.path.includes('/services/')) {
        const idx = parts.indexOf('services')
        subsystemName = parts[idx + 1] ?? 'services'
      } else if (file.path.includes('/routers/')) {
        subsystemName = 'routers'
      } else if (file.path.includes('/components/')) {
        const idx = parts.indexOf('components')
        subsystemName = `components/${parts[idx + 1] ?? 'ui'}`
      } else if (file.path.includes('/app/')) {
        // Group pages by top-level route
        const appIdx = parts.indexOf('app')
        const routePart = parts[appIdx + 1] ?? 'root'
        subsystemName = `pages/${routePart.replace('(dashboard)', 'dashboard')}`
      } else if (file.path.includes('/schema/')) {
        subsystemName = 'database'
      } else if (file.path.includes('/packages/')) {
        const pkgIdx = parts.indexOf('packages')
        subsystemName = `pkg/${parts[pkgIdx + 1] ?? 'unknown'}`
      } else {
        subsystemName = 'root'
      }

      const existing = subsystemMap.get(subsystemName) ?? []
      existing.push(file)
      subsystemMap.set(subsystemName, existing)
    }

    // Build subsystems
    const subsystems: CodebaseSubsystem[] = []
    for (const [name, subFiles] of subsystemMap) {
      // Determine primary category by majority
      const catCounts = new Map<FileCategory, number>()
      for (const f of subFiles) {
        catCounts.set(f.category, (catCounts.get(f.category) ?? 0) + 1)
      }
      let primaryCat: FileCategory = 'other'
      let maxCount = 0
      for (const [cat, count] of catCounts) {
        if (count > maxCount) {
          primaryCat = cat
          maxCount = count
        }
      }

      const totalLines = subFiles.reduce((a, f) => a + f.lines, 0)

      subsystems.push({
        name,
        category: primaryCat,
        department: departmentForCategory(primaryCat),
        files: subFiles,
        totalLines,
        totalFiles: subFiles.length,
        description: `${name}: ${subFiles.length} files, ${totalLines} lines (${primaryCat})`,
      })
    }

    // Sort by size descending
    subsystems.sort((a, b) => b.totalLines - a.totalLines)

    return {
      scannedAt: new Date(),
      rootDir,
      totalFiles: files.length,
      totalLines: files.reduce((a, f) => a + f.lines, 0),
      subsystems,
    }
  }

  /**
   * Generate review tickets from a codebase map.
   */
  generateReviewTickets(map: CodebaseMap): ReviewTicket[] {
    const tickets: ReviewTicket[] = []

    for (const sub of map.subsystems) {
      if (sub.totalFiles < 2) continue // skip tiny subsystems

      const priority = sub.totalLines > 2000 ? 'high' : sub.totalLines > 500 ? 'medium' : 'low'

      if (sub.department === 'design') {
        tickets.push({
          title: `[UI Review] ${sub.name}`,
          description: `Review UI/UX for ${sub.name}:\n- ${sub.totalFiles} files, ${sub.totalLines} lines\n- Check layout consistency, color usage, accessibility, responsive design\n- Files: ${sub.files
            .slice(0, 5)
            .map((f) => f.path)
            .join(', ')}${sub.files.length > 5 ? ` (+${sub.files.length - 5} more)` : ''}`,
          department: 'design',
          subsystem: sub.name,
          files: sub.files.map((f) => f.path),
          priority,
        })
      } else if (sub.department === 'qa') {
        tickets.push({
          title: `[Test Review] ${sub.name}`,
          description: `Review test coverage for ${sub.name}:\n- ${sub.totalFiles} test files, ${sub.totalLines} lines\n- Check coverage completeness, edge cases, mock quality\n- Files: ${sub.files
            .slice(0, 5)
            .map((f) => f.path)
            .join(', ')}`,
          department: 'qa',
          subsystem: sub.name,
          files: sub.files.map((f) => f.path),
          priority,
        })
      } else {
        tickets.push({
          title: `[Architecture Review] ${sub.name}`,
          description: `Review architecture for ${sub.name}:\n- ${sub.totalFiles} files, ${sub.totalLines} lines\n- Check error handling, type safety, performance, security\n- Verify integration with other subsystems\n- Files: ${sub.files
            .slice(0, 5)
            .map((f) => f.path)
            .join(', ')}${sub.files.length > 5 ? ` (+${sub.files.length - 5} more)` : ''}`,
          department: 'engineering',
          subsystem: sub.name,
          files: sub.files.map((f) => f.path),
          priority,
        })
      }
    }

    return tickets
  }
}
