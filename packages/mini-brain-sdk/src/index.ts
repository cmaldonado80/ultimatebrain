// @solarc/mini-brain-sdk — Developments connect UP to Mini Brains
// Auto-generated client from Mini Brain tRPC router types

import { createTRPCClient, httpBatchLink } from '@trpc/client'
import superjson from 'superjson'

export interface MiniBrainClientConfig {
  /** The Mini Brain's base URL (e.g. http://localhost:3100) */
  url: string
  /** API key issued by the Mini Brain Factory */
  apiKey?: string
}

/**
 * Create a tRPC client that connects a Development app to its parent Mini Brain.
 *
 * Usage:
 * ```ts
 * import { createMiniBrainClient } from '@solarc/mini-brain-sdk'
 *
 * const brain = createMiniBrainClient({
 *   url: process.env.BRAIN_ENDPOINT!,
 *   apiKey: process.env.BRAIN_API_KEY,
 * })
 * ```
 */
export function createMiniBrainClient(config: MiniBrainClientConfig) {
  if (!config.url) {
    throw new Error('@solarc/mini-brain-sdk: "url" is required in MiniBrainClientConfig')
  }

  const client = createTRPCClient<any>({
    links: [
      httpBatchLink({
        url: `${config.url}/api/trpc`,
        transformer: superjson,
        headers: config.apiKey
          ? { Authorization: `Bearer ${config.apiKey}` }
          : undefined,
      }),
    ],
  })

  return client
}
