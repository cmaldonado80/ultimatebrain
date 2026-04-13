import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

/** API route prefixes exempt from CSRF origin checks */
const CSRF_EXEMPT_PREFIXES = [
  '/api/a2a/',
  '/api/.well-known/',
  '/api/brain/',
  '/api/cron',
  '/api/webhooks',
]

function csrfCheck(req: NextRequest): NextResponse | null {
  // Only check mutation methods
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return null

  const { pathname } = req.nextUrl

  // Only check API routes
  if (!pathname.startsWith('/api/')) return null

  // Skip exempt prefixes
  if (CSRF_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null

  const origin = req.headers.get('origin')
  if (!origin) {
    // No origin header — likely same-origin non-browser request; allow
    return null
  }

  const host = req.headers.get('host')
  try {
    const originHost = new URL(origin).host
    if (originHost === host) return null
  } catch {
    // Malformed origin
  }

  return NextResponse.json({ error: 'Forbidden: origin mismatch' }, { status: 403 })
}

export function middleware(req: NextRequest) {
  // CSRF origin validation for mutating API requests
  const csrfResponse = csrfCheck(req)
  if (csrfResponse) return csrfResponse

  // Skip auth redirect when SKIP_AUTH is set (development mode)
  if (process.env.SKIP_AUTH === 'true') return NextResponse.next()

  const hasSession = req.cookies.has('session-token')

  if (!hasSession && req.nextUrl.pathname !== '/auth/signin') {
    const signInUrl = new URL('/auth/signin', req.nextUrl.origin)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
