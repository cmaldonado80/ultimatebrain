export const dynamic = 'force-dynamic'

import { createDb, type Database, waitForSchema } from '@solarc/db'
import { cookies } from 'next/headers'

import { auth, COOKIE_NAMES, refreshSession } from '../../../../server/auth'
import { resolveActiveOrg } from '../../../../server/services/platform/org-bootstrap'

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

/**
 * Attempt to get a valid session. If the access token is expired but a
 * refresh token exists, silently rotate both tokens before proceeding.
 */
async function getSessionWithRefresh() {
  // Try the access token first
  let session = await auth()
  if (session) return { session, refreshed: false }

  // Access token expired/missing — try refresh
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get(COOKIE_NAMES.refresh)?.value
  if (!refreshToken) return { session: null, refreshed: false }

  const tokens = await refreshSession(refreshToken)
  if (!tokens) return { session: null, refreshed: false }

  // Set new cookies for the response
  const secure = process.env.NODE_ENV === 'production'
  cookieStore.set(COOKIE_NAMES.access, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60,
  })
  cookieStore.set(COOKIE_NAMES.refresh, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })

  // Re-verify with the new access token
  session = await auth()
  return { session, refreshed: true }
}

async function handler(req: Request) {
  const { fetchRequestHandler } = await import('@trpc/server/adapters/fetch')
  const { appRouter } = await import('../../../../server/routers/_app')

  // Ensure all DB tables exist before handling any query
  await waitForSchema()

  const { session } = await getSessionWithRefresh()
  const db = getDb()

  let orgId = ''
  if (session?.user?.id) {
    orgId = await resolveActiveOrg(db, session.user.id, req)
  }

  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => ({
      db,
      session: session?.user?.id ? { userId: session.user.id, organizationId: orgId } : null,
    }),
  })
}

export { handler as GET, handler as POST }
