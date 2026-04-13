import { jwtVerify, SignJWT } from 'jose'
import { cookies } from 'next/headers'

const ACCESS_COOKIE = 'session-token'
const REFRESH_COOKIE = 'refresh-token'

/** Lazy-initialised JWT secret — deferred to runtime so Next.js can
 *  collect page data at build time without requiring AUTH_SECRET. */
let _secret: Uint8Array | undefined
function getSecret(): Uint8Array {
  if (!_secret) {
    const raw = process.env.AUTH_SECRET
    if (!raw && process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_SECRET environment variable is required in production')
    }
    _secret = new TextEncoder().encode(raw || 'dev-secret-change-me')
  }
  return _secret
}

export interface Session {
  user: { id: string; email: string; name: string }
}

/**
 * Create signed access + refresh tokens.
 * Access token: 15 minutes. Refresh token: 7 days.
 */
export async function createSession(
  email: string,
  userId?: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const name = email.split('@')[0]
  const sub = userId ?? email

  const accessToken = await new SignJWT({ email, name, sub, userId, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret())

  const refreshToken = await new SignJWT({ email, sub, userId, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret())

  return { accessToken, refreshToken }
}

/**
 * Verify a refresh token and issue new access + refresh pair.
 * Returns null if the refresh token is invalid or expired.
 */
export async function refreshSession(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  try {
    const { payload } = await jwtVerify(refreshToken, getSecret())
    if (payload.type !== 'refresh') return null
    const email = payload.email as string
    const userId = payload.userId as string | undefined
    if (!email) return null
    return createSession(email, userId)
  } catch {
    return null
  }
}

/** Read and verify the session cookie. Returns null if invalid/missing. */
export async function auth(): Promise<Session | null> {
  // Dev mode only: return mock session when SKIP_AUTH is set
  if (process.env.SKIP_AUTH === 'true' && process.env.NODE_ENV !== 'production') {
    console.warn('[Auth] SKIP_AUTH active — returning dev session')
    return { user: { id: 'dev-user', email: 'dev@ultimatebrain.local', name: 'Developer' } }
  }

  const cookieStore = await cookies()
  const token = cookieStore.get(ACCESS_COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getSecret())
    const email = payload.email as string
    if (!email) return null
    // Prefer userId claim (UUID) over sub (which may be email for old tokens)
    const id = (payload.userId as string) ?? payload.sub ?? email
    return {
      user: {
        id,
        email,
        name: (payload.name as string) || email.split('@')[0],
      },
    }
  } catch {
    return null
  }
}

/** Cookie names for external consumers (signin/signout routes). */
export const COOKIE_NAMES = { access: ACCESS_COOKIE, refresh: REFRESH_COOKIE } as const
