#!/usr/bin/env tsx
/**
 * Brain Scaffolding CLI
 *
 * Creates a new Mini Brain + Development app from templates.
 *
 * Usage:
 *   pnpm brain:create <domain>
 *   pnpm brain:create hospitality
 *   pnpm brain:create healthcare
 */

import * as fs from 'fs'
import * as path from 'path'

const domain = process.argv[2]

if (!domain || domain.startsWith('-')) {
  console.error('Usage: pnpm brain:create <domain>')
  console.error('Example: pnpm brain:create hospitality')
  process.exit(1)
}

const DOMAIN = domain.toLowerCase().replace(/[^a-z0-9]/g, '')
const DOMAIN_TITLE = DOMAIN.charAt(0).toUpperCase() + DOMAIN.slice(1)

// Deterministic port from domain name hash (3100–3199 for brains, +100 for apps)
function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
const PORT = 3100 + (simpleHash(DOMAIN) % 100)
const APP_PORT = PORT + 100

const BRAIN_DIR = path.resolve('apps', `${DOMAIN}-brain`)
const APP_DIR = path.resolve('apps', `${DOMAIN}-app`)

// Check if already exists
if (fs.existsSync(BRAIN_DIR)) {
  console.error(`Error: ${BRAIN_DIR} already exists`)
  process.exit(1)
}
if (fs.existsSync(APP_DIR)) {
  console.error(`Error: ${APP_DIR} already exists`)
  process.exit(1)
}

// Token map
const tokens: Record<string, string> = {
  '{{DOMAIN}}': DOMAIN,
  '{{DOMAIN_TITLE}}': DOMAIN_TITLE,
  '{{PACKAGE_NAME}}': `@solarc/${DOMAIN}-brain`,
  '{{APP_PACKAGE_NAME}}': `@solarc/${DOMAIN}-app`,
  '{{PORT}}': String(PORT),
  '{{APP_PORT}}': String(APP_PORT),
  '{{ROUTE_PATH}}': `/${DOMAIN}/example`,
  '{{COOKIE_NAME}}': `${DOMAIN.slice(0, 8)}-session`,
  '{{BRAIN_ENV_PREFIX}}': DOMAIN.toUpperCase(),
}

function replaceTokens(content: string): string {
  let result = content
  for (const [token, value] of Object.entries(tokens)) {
    result = result.split(token).join(value)
  }
  return result
}

function scaffoldDir(templateDir: string, outputDir: string): number {
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
        fs.writeFileSync(outPath, isTemplate ? replaceTokens(content) : content)
        count++
      }
    }
  }

  fs.mkdirSync(outputDir, { recursive: true })
  walk(templateDir, outputDir)
  return count
}

// Scaffold
console.warn(`\nScaffolding ${DOMAIN_TITLE} Mini Brain + Development App...\n`)

const brainTemplateDir = path.resolve('templates', 'mini-brain')
const devTemplateDir = path.resolve('templates', 'development')

if (!fs.existsSync(brainTemplateDir)) {
  console.error(`Error: Template directory not found: ${brainTemplateDir}`)
  process.exit(1)
}
if (!fs.existsSync(devTemplateDir)) {
  console.error(`Error: Template directory not found: ${devTemplateDir}`)
  process.exit(1)
}

const brainFiles = scaffoldDir(brainTemplateDir, BRAIN_DIR)
const appFiles = scaffoldDir(devTemplateDir, APP_DIR)

console.warn(`  Created apps/${DOMAIN}-brain/ (${brainFiles} files)`)
console.warn(`  Created apps/${DOMAIN}-app/  (${appFiles} files)`)
console.warn('')
console.warn('Next steps:')
console.warn('')
console.warn(`  1. pnpm install`)
console.warn(`  2. Create entity via SmartCreate (template: '${DOMAIN}')`)
console.warn(`  3. Copy API key to apps/${DOMAIN}-brain/.env.local:`)
console.warn(`       ENTITY_ID=<from SmartCreate>`)
console.warn(`       BRAIN_API_KEY=<from SmartCreate>`)
console.warn(`       APP_SECRET=<generate a shared secret>`)
console.warn(`  4. Configure apps/${DOMAIN}-app/.env.local:`)
console.warn(`       ${DOMAIN.toUpperCase()}_BRAIN_URL=http://localhost:${PORT}`)
console.warn(`       ${DOMAIN.toUpperCase()}_BRAIN_SECRET=<same shared secret>`)
console.warn(`       AUTH_SECRET=<generate a secret>`)
console.warn('')
console.warn('Run:')
console.warn(`  pnpm --filter @solarc/${DOMAIN}-brain dev   # port ${PORT}`)
console.warn(`  pnpm --filter @solarc/${DOMAIN}-app dev     # port ${APP_PORT}`)
console.warn('')
