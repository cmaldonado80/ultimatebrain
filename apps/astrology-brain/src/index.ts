/**
 * Astrology Mini Brain — first real Mini Brain service
 *
 * Proves the three-tier architecture:
 *   Development app → Astrology Mini Brain → Brain core services
 *
 * Starts a Hono server with:
 * - natal chart computation via @solarc/ephemeris (local domain engine)
 * - Brain SDK connection for shared services (LLM, memory)
 * - health + info endpoints
 * - proxy endpoints for Development apps
 */

import { createMiniBrainServer } from '@solarc/mini-brain-server'

import { natalSummaryRoute } from './routes/natal-summary.js'
import { reportRoute } from './routes/report.js'
import { synastryRoute } from './routes/synastry.js'
import { timelineRoute } from './routes/timeline.js'
import { transitsRoute } from './routes/transits.js'

// ── Config from environment ───────────────────────────────────────────

const entityId = process.env.ENTITY_ID ?? 'astrology-dev'
const domain = 'astrology'
const brainUrl = process.env.BRAIN_URL ?? 'http://localhost:3000/api/brain'
const brainApiKey = process.env.BRAIN_API_KEY ?? ''
const port = Number(process.env.PORT ?? 3100)

if (!brainApiKey) {
  console.warn('[AstrologyBrain] BRAIN_API_KEY not set — Brain SDK calls will fail')
}

// ── Create + start server ─────────────────────────────────────────────

const server = createMiniBrainServer({ entityId, domain, brainUrl, brainApiKey, port }, [
  natalSummaryRoute,
  reportRoute,
  transitsRoute,
  timelineRoute,
  synastryRoute,
])

server.start(port)

console.warn(`[AstrologyBrain] Domain endpoints:`)
console.warn(`  POST /astrology/natal-summary`)
console.warn(`  POST /astrology/report`)
console.warn(`  POST /astrology/transits`)
console.warn(`  POST /astrology/timeline`)
console.warn(`  POST /astrology/synastry`)
console.warn(`  GET  /health`)
console.warn(`  GET  /info`)
