import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Lightweight middleware that checks for the NextAuth session cookie.
 * We avoid importing `auth` here because the Drizzle adapter pulls in `pg`,
 * which is incompatible with the Edge Runtime.
 *
 * The real session validation happens server-side in the tRPC context
 * (via `auth()` in the route handler). This middleware only redirects
 * users who clearly have no session cookie to the sign-in page.
 */
export function middleware(req: NextRequest) {
  // NextAuth v5 with JWT strategy sets a cookie named __Secure-authjs.session-token
  // (or authjs.session-token in dev over http)
  const hasSession =
    req.cookies.has('authjs.session-token') || req.cookies.has('__Secure-authjs.session-token')

  if (!hasSession && req.nextUrl.pathname !== '/auth/signin') {
    const signInUrl = new URL('/auth/signin', req.nextUrl.origin)
    signInUrl.searchParams.set('callbackUrl', req.nextUrl.pathname)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api/auth|api/trpc|_next/static|_next/image|favicon.ico).*)'],
}
