/**
 * Route Protection Middleware
 *
 * Redirects unauthenticated users to /signin.
 * Public routes: /signin, /api/auth/*, /_next/*, /favicon.ico
 */

import { type NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const token = request.cookies.get('session-token')

  // Allow auth routes, static assets, and the signin page
  const { pathname } = request.nextUrl
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

  // Redirect to Brain's signin if no session
  if (!token) {
    const brainUrl = process.env.BRAIN_URL ?? 'http://localhost:3000'
    const signinUrl = `${brainUrl}/signin?callbackUrl=${encodeURIComponent(request.url)}`
    return NextResponse.redirect(signinUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
}
