export const dynamic = 'force-dynamic'

import { createDb, type Database, waitForSchema } from '@solarc/db'

import { auth } from '../../../../server/auth'

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

  // Ensure all DB tables exist before handling any query
  await waitForSchema()

  const session = await auth()

  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => ({
      db: getDb(),
      session: session?.user?.id ? { userId: session.user.id } : null,
    }),
  })
}

export { handler as GET, handler as POST }
