import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '../../../../server/routers/_app'
import type { TRPCContext } from '../../../../server/trpc'

declare global { var __db: import('@solarc/db').Database }

function createContext(): TRPCContext {
  return {
    db: globalThis.__db,
    session: null,
  }
}

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext,
  })

export { handler as GET, handler as POST }
