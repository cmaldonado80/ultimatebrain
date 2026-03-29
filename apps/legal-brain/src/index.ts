/**
 * Legal Mini Brain
 *
 * Three-tier architecture:
 *   Development app → Legal Mini Brain → Brain core services
 */

import { createMiniBrainServer } from '@solarc/mini-brain-server'

import { contractReviewRoute } from './routes/contract-review.js'

const entityId = process.env.ENTITY_ID ?? 'legal-dev'
const domain = 'legal'
const brainUrl = process.env.BRAIN_URL ?? 'http://localhost:3000/api/brain'
const brainApiKey = process.env.BRAIN_API_KEY ?? ''
const appSecret = process.env.APP_SECRET ?? ''
const port = Number(process.env.PORT ?? 3157)

if (!brainApiKey) {
  console.warn('[LegalBrain] BRAIN_API_KEY not set — Brain SDK calls will fail')
}

const server = createMiniBrainServer({ entityId, domain, brainUrl, brainApiKey, appSecret, port }, [
  contractReviewRoute,
])

server.start(port)

console.warn(`[LegalBrain] Domain endpoints:`)
console.warn(`  POST /legal/contract-review`)
console.warn(`  GET  /health`)
console.warn(`  GET  /info`)
