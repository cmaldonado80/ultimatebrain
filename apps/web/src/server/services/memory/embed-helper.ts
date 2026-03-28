/**
 * Shared embed function factory — creates an embedding function backed by the
 * GatewayRouter. Used by MemoryService, RecallFlow, and ContextPipeline to
 * avoid duplicating the embed wiring across routers.
 */

import type { Database } from '@solarc/db'

import { GatewayRouter } from '../gateway'

let _gateway: GatewayRouter | null = null

function getGateway(db: Database): GatewayRouter {
  return (_gateway ??= new GatewayRouter(db))
}

/**
 * Create an embedding function that uses the gateway's embed capability.
 * Returns a 1536-dim zero vector as fallback if embedding fails.
 */
export function createEmbedFn(db: Database): (text: string) => Promise<number[]> {
  return async (text: string): Promise<number[]> => {
    try {
      const result = await getGateway(db).embed(text)
      return result.embedding
    } catch (err) {
      console.warn('[EmbedHelper] Embedding failed, using zero vector:', err)
      return Array(1536).fill(0)
    }
  }
}
