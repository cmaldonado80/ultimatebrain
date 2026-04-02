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

import { buildTokens, sanitizeDomain, scaffoldDir } from './lib/generator.js'

const domain = process.argv[2]

if (!domain || domain.startsWith('-')) {
  console.error('Usage: pnpm brain:create <domain>')
  console.error('Example: pnpm brain:create hospitality')
  process.exit(1)
}

const DOMAIN = sanitizeDomain(domain)
const tokens = buildTokens(DOMAIN)
const PORT = tokens['{{PORT}}']
const APP_PORT = tokens['{{APP_PORT}}']

const BRAIN_DIR = path.resolve('apps', `${DOMAIN}-brain`)
const APP_DIR = path.resolve('apps', `${DOMAIN}-app`)

if (fs.existsSync(BRAIN_DIR)) {
  console.error(`Error: ${BRAIN_DIR} already exists`)
  process.exit(1)
}
if (fs.existsSync(APP_DIR)) {
  console.error(`Error: ${APP_DIR} already exists`)
  process.exit(1)
}

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

console.warn(`\nScaffolding ${tokens['{{DOMAIN_TITLE}}']} Mini Brain + Development App...\n`)

const brainFiles = scaffoldDir(brainTemplateDir, BRAIN_DIR, tokens)
const appFiles = scaffoldDir(devTemplateDir, APP_DIR, tokens)

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
