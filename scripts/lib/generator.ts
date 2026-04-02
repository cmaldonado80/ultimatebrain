/**
 * Generator Library — pure functions for brain scaffolding.
 *
 * Extracted for testability. Used by both create-brain.ts CLI
 * and validate-template.ts validation pipeline.
 */

import * as fs from 'fs'
import * as path from 'path'

// ── Hash ──────────────────────────────────────────────────────────────

export function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// ── Token Building ────────────────────────────────────────────────────

export function sanitizeDomain(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function buildTokens(domain: string): Record<string, string> {
  const DOMAIN = sanitizeDomain(domain)
  const DOMAIN_TITLE = DOMAIN.charAt(0).toUpperCase() + DOMAIN.slice(1)
  const PORT = 3100 + (simpleHash(DOMAIN) % 100)

  return {
    '{{DOMAIN}}': DOMAIN,
    '{{DOMAIN_TITLE}}': DOMAIN_TITLE,
    '{{PACKAGE_NAME}}': `@solarc/${DOMAIN}-brain`,
    '{{APP_PACKAGE_NAME}}': `@solarc/${DOMAIN}-app`,
    '{{PORT}}': String(PORT),
    '{{APP_PORT}}': String(PORT + 100),
    '{{ROUTE_PATH}}': `/${DOMAIN}/example`,
    '{{COOKIE_NAME}}': `${DOMAIN.slice(0, 8)}-session`,
    '{{BRAIN_ENV_PREFIX}}': DOMAIN.toUpperCase(),
  }
}

// ── Token Replacement ─────────────────────────────────────────────────

export function replaceTokens(content: string, tokens: Record<string, string>): string {
  let result = content
  for (const [token, value] of Object.entries(tokens)) {
    result = result.split(token).join(value)
  }
  return result
}

// ── Scaffolding ───────────────────────────────────────────────────────

export function scaffoldDir(
  templateDir: string,
  outputDir: string,
  tokens: Record<string, string>,
): number {
  let count = 0

  function walk(dir: string, outDir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const srcPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        const subOut = path.join(outDir, entry.name)
        fs.mkdirSync(subOut, { recursive: true })
        walk(srcPath, subOut)
      } else {
        const isTemplate = entry.name.endsWith('.tmpl')
        const outName = isTemplate ? entry.name.replace('.tmpl', '') : entry.name
        const outPath = path.join(outDir, outName)
        const content = fs.readFileSync(srcPath, 'utf-8')
        fs.mkdirSync(path.dirname(outPath), { recursive: true })
        fs.writeFileSync(outPath, isTemplate ? replaceTokens(content, tokens) : content)
        count++
      }
    }
  }

  fs.mkdirSync(outputDir, { recursive: true })
  walk(templateDir, outputDir)
  return count
}

// ── Expected File Lists ───────────────────────────────────────────────

export const EXPECTED_BRAIN_FILES = [
  'package.json',
  'tsconfig.json',
  'src/index.ts',
  'src/routes/example.ts',
]

export const EXPECTED_APP_FILES = [
  'package.json',
  'tsconfig.json',
  'next.config.ts',
  '.env.local.example',
  'src/middleware.ts',
  'src/app/layout.tsx',
  'src/app/page.tsx',
  'src/app/globals.css',
  'src/app/signin/page.tsx',
  'src/app/api/auth/signin/route.ts',
  'src/app/api/auth/signout/route.ts',
  'src/app/api/domain/route.ts',
  'src/lib/client.ts',
  'src/lib/types.ts',
]

// ── Forbidden Imports (Development apps must NOT import these) ────────

export const FORBIDDEN_DEV_DEPS = [
  '@solarc/brain-sdk',
  '@solarc/db',
  '@solarc/ephemeris',
  '@solarc/mini-brain-server',
  '@solarc/engine-contracts',
]
