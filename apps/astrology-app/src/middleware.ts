/**
 * Route Protection Middleware
 *
 * Redirects unauthenticated users to /signin.
 * Public routes: /signin, /api/auth/*, /_next/*, /favicon.ico
 */

import { type NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const token = req.cookies.get('astro-session')

  // Allow auth routes, static assets, and the signin page
  const { pathname } = req.nextUrl
  if (
    pathname.startsWith('/signin') ||
    pathname.startsWith('/share') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/share') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  // Redirect to signin if no session
  if (!token) {
    return NextResponse.redirect(new URL('/signin', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
}
