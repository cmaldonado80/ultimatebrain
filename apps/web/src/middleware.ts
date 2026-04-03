import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

// Routes that require platform_owner role (checked server-side, but middleware
// provides first-line defense by requiring any valid session)
const ADMIN_PATHS = ['/admin']

export function middleware(req: NextRequest) {
  // Skip auth redirect when SKIP_AUTH is set (development mode)
  if (process.env.SKIP_AUTH === 'true') return NextResponse.next()

  const hasSession = req.cookies.has('session-token')
  const pathname = req.nextUrl.pathname

  // Unauthenticated → redirect to signin (except signin page itself)
  if (!hasSession && pathname !== '/auth/signin') {
    const signInUrl = new URL('/auth/signin', req.nextUrl.origin)
    signInUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(signInUrl)
  }

  // Admin routes require session + role (role verified server-side by tRPC,
  // but middleware blocks unauthenticated access early)
  if (ADMIN_PATHS.some((p) => pathname.startsWith(p)) && !hasSession) {
    return NextResponse.redirect(new URL('/auth/signin', req.nextUrl.origin))
  }

  // Pass workspace context via header for server-side access checks
  const response = NextResponse.next()
  const workspaceMatch = pathname.match(/^\/workspaces\/([^/]+)/)
  if (workspaceMatch?.[1]) {
    response.headers.set('x-workspace-id', workspaceMatch[1])
  }

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
