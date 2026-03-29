import { jwtVerify, SignJWT } from 'jose'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'session-token'
const AUTH_SECRET = process.env.AUTH_SECRET
if (!AUTH_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('AUTH_SECRET environment variable is required in production')
}
const SECRET = new TextEncoder().encode(AUTH_SECRET || 'dev-secret-change-me')

export interface Session {
  user: { id: string; email: string; name: string }
}

/**
 * Create a signed JWT.
 * If userId is provided (UUID), it becomes the subject.
 * Otherwise falls back to email as subject (backward compat).
 */
export async function createSession(email: string, userId?: string): Promise<string> {
  const name = email.split('@')[0]
  const token = await new SignJWT({ email, name, sub: userId ?? email, userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(SECRET)
  return token
}

/** Read and verify the session cookie. Returns null if invalid/missing. */
export async function auth(): Promise<Session | null> {
  // Dev mode only: return mock session when SKIP_AUTH is set
  if (process.env.SKIP_AUTH === 'true' && process.env.NODE_ENV !== 'production') {
    console.warn('[Auth] SKIP_AUTH active — returning dev session')
    return { user: { id: 'dev-user', email: 'dev@ultimatebrain.local', name: 'Developer' } }
  }

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, SECRET)
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
