export const dynamic = 'force-dynamic'

import { createDb, type Database } from '@solarc/db'

/** Singleton DB pool — survives across Vercel hot reloads / Lambda reuse */
let _db: Database | undefined
function getDb(): Database {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    _db = createDb(url)
  }
  return _db
}

async function handler(req: Request) {
  const { fetchRequestHandler } = await import('@trpc/server/adapters/fetch')
  const { appRouter } = await import('../../../../server/routers/_app')

  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => ({
      db: getDb(),
      session: null,
    }),
  })
}

export { handler as GET, handler as POST }
