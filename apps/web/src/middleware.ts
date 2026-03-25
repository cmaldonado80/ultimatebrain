import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
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
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
