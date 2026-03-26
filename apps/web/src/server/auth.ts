import { SignJWT, jwtVerify } from 'jose'
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

/** Create a signed JWT for the given user and set it as an HTTP-only cookie. */
export async function createSession(email: string): Promise<string> {
  const name = email.split('@')[0]
  const token = await new SignJWT({ email, name, sub: email })
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
    return { user: { id: 'dev-user', email: 'dev@ultimatebrain.local', name: 'Developer' } }
  }

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, SECRET)
    const email = payload.email as string
    if (!email) return null
    return {
      user: {
        id: payload.sub || email,
        email,
        name: (payload.name as string) || email.split('@')[0],
      },
    }
  } catch {
    return null
  }
}
