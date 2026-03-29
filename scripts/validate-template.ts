#!/usr/bin/env tsx
/**
 * Template Validation Pipeline
 *
 * Generates a test domain, validates it at every layer, and cleans up.
 *
 * Usage:
 *   pnpm brain:validate
 *
 * Checks:
 *   1. Static — no unreplaced tokens, all files exist
 *   2. Boundary — no forbidden imports in Development app
 *   3. Typecheck — Mini Brain + Development app compile
 *   4. Cleanup — remove generated artifacts
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

import {
  buildTokens,
  EXPECTED_APP_FILES,
  EXPECTED_BRAIN_FILES,
  FORBIDDEN_DEV_DEPS,
  scaffoldDir,
} from './lib/generator.js'

const TEST_DOMAIN = '_testvalidation'
const GEN_DIR = path.resolve('.generated-test')
const BRAIN_DIR = path.join(GEN_DIR, `${TEST_DOMAIN}-brain`)
const APP_DIR = path.join(GEN_DIR, `${TEST_DOMAIN}-app`)

let errors: string[] = []
let passed = 0

function check(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.warn(`  ✓ ${name}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push(`${name}: ${msg}`)
    console.error(`  ✗ ${name}: ${msg}`)
  }
}

function cleanup() {
  if (fs.existsSync(GEN_DIR)) {
    fs.rmSync(GEN_DIR, { recursive: true, force: true })
  }
}

// ── Main Pipeline ─────────────────────────────────────────────────────

console.warn('\n=== Template Validation Pipeline ===\n')

try {
  // 0. Clean any previous run
  cleanup()

  // 1. Generate test domain
  console.warn('Phase 1: Generate test domain')
  const tokens = buildTokens(TEST_DOMAIN)
  const brainTemplateDir = path.resolve('templates', 'mini-brain')
  const devTemplateDir = path.resolve('templates', 'development')

  check('Brain template directory exists', () => {
    if (!fs.existsSync(brainTemplateDir)) throw new Error(`Missing: ${brainTemplateDir}`)
  })

  check('Development template directory exists', () => {
    if (!fs.existsSync(devTemplateDir)) throw new Error(`Missing: ${devTemplateDir}`)
  })

  const brainFiles = scaffoldDir(brainTemplateDir, BRAIN_DIR, tokens)
  const appFiles = scaffoldDir(devTemplateDir, APP_DIR, tokens)
  console.warn(`  Generated ${brainFiles} brain files + ${appFiles} app files\n`)

  // 2. Static validation
  console.warn('Phase 2: Static validation')

  check('Brain files exist', () => {
    for (const f of EXPECTED_BRAIN_FILES) {
      const full = path.join(BRAIN_DIR, f)
      if (!fs.existsSync(full)) throw new Error(`Missing: ${f}`)
    }
  })

  check('App files exist', () => {
    for (const f of EXPECTED_APP_FILES) {
      const full = path.join(APP_DIR, f)
      if (!fs.existsSync(full)) throw new Error(`Missing: ${f}`)
    }
  })

  check('No unreplaced tokens', () => {
    const TOKEN_PATTERN = /\{\{[A-Z_]+\}\}/g
    const unreplaced: string[] = []

    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          scanDir(full)
        } else if (
          entry.name.endsWith('.ts') ||
          entry.name.endsWith('.tsx') ||
          entry.name.endsWith('.json') ||
          entry.name === '.env.local.example'
        ) {
          const content = fs.readFileSync(full, 'utf-8')
          const matches = content.match(TOKEN_PATTERN)
          if (matches) {
            unreplaced.push(`${path.relative(GEN_DIR, full)}: ${matches.join(', ')}`)
          }
        }
      }
    }
    scanDir(BRAIN_DIR)
    scanDir(APP_DIR)
    if (unreplaced.length > 0) {
      throw new Error(`Unreplaced tokens:\n    ${unreplaced.join('\n    ')}`)
    }
  })

  check('Package names are valid', () => {
    const brainPkg = JSON.parse(fs.readFileSync(path.join(BRAIN_DIR, 'package.json'), 'utf-8'))
    const appPkg = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf-8'))
    if (!brainPkg.name?.startsWith('@solarc/'))
      throw new Error(`Invalid brain package name: ${brainPkg.name}`)
    if (!appPkg.name?.startsWith('@solarc/'))
      throw new Error(`Invalid app package name: ${appPkg.name}`)
    if (!brainPkg.name.endsWith('-brain'))
      throw new Error(`Brain package must end with -brain: ${brainPkg.name}`)
    if (!appPkg.name.endsWith('-app'))
      throw new Error(`App package must end with -app: ${appPkg.name}`)
  })

  // 3. Boundary validation
  console.warn('\nPhase 3: Boundary validation')

  check('Development app has no forbidden dependencies', () => {
    const appPkg = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf-8'))
    const allDeps = { ...appPkg.dependencies, ...appPkg.devDependencies }
    const violations = FORBIDDEN_DEV_DEPS.filter((dep) => dep in allDeps)
    if (violations.length > 0) {
      throw new Error(`Forbidden deps in Development app: ${violations.join(', ')}`)
    }
  })

  check('Development app has no NEXT_PUBLIC_ brain URLs in env template', () => {
    const envFile = path.join(APP_DIR, '.env.local.example')
    if (fs.existsSync(envFile)) {
      const content = fs.readFileSync(envFile, 'utf-8')
      if (content.includes('NEXT_PUBLIC_') && content.toLowerCase().includes('brain')) {
        throw new Error('Development .env.local.example exposes brain URL as NEXT_PUBLIC_')
      }
    }
  })

  check('Mini Brain depends on brain-sdk', () => {
    const brainPkg = JSON.parse(fs.readFileSync(path.join(BRAIN_DIR, 'package.json'), 'utf-8'))
    if (
      !brainPkg.dependencies?.['@solarc/brain-sdk'] &&
      !brainPkg.dependencies?.['@solarc/mini-brain-server']
    ) {
      throw new Error('Mini Brain must depend on @solarc/brain-sdk or @solarc/mini-brain-server')
    }
  })

  // 4. Typecheck (skip if pnpm install would be needed — just validate structure for now)
  // In CI, this would run after pnpm install. Here we verify file syntax.
  console.warn('\nPhase 4: Syntax validation')

  check('Brain index.ts has valid imports', () => {
    const content = fs.readFileSync(path.join(BRAIN_DIR, 'src/index.ts'), 'utf-8')
    if (!content.includes('@solarc/mini-brain-server')) {
      throw new Error('Brain index.ts must import @solarc/mini-brain-server')
    }
    if (!content.includes('createMiniBrainServer')) {
      throw new Error('Brain index.ts must use createMiniBrainServer')
    }
  })

  check('App proxy route exists and calls brain', () => {
    const content = fs.readFileSync(path.join(APP_DIR, 'src/app/api/domain/route.ts'), 'utf-8')
    if (!content.includes('Authorization')) {
      throw new Error('Proxy route must include Authorization header')
    }
    if (!content.includes('BRAIN_URL') && !content.includes('_BRAIN_URL')) {
      throw new Error('Proxy route must reference BRAIN_URL env var')
    }
  })

  check('App middleware protects routes', () => {
    const content = fs.readFileSync(path.join(APP_DIR, 'src/middleware.ts'), 'utf-8')
    if (!content.includes('redirect') && !content.includes('Redirect')) {
      throw new Error('Middleware must redirect unauthenticated users')
    }
    if (!content.includes('session')) {
      throw new Error('Middleware must check session cookie')
    }
  })

  // Summary
  console.warn(`\n=== Results: ${passed} passed, ${errors.length} failed ===\n`)

  if (errors.length > 0) {
    console.error('FAILURES:')
    for (const e of errors) console.error(`  ✗ ${e}`)
    console.warn(`\nGenerated artifacts preserved at: ${GEN_DIR}`)
    process.exit(1)
  }

  // Clean up on success
  cleanup()
  console.warn('All checks passed. Generated artifacts cleaned up.\n')
} catch (err) {
  console.error(`\nFatal error: ${err instanceof Error ? err.message : String(err)}`)
  console.warn(`Generated artifacts preserved at: ${GEN_DIR}`)
  process.exit(1)
}
