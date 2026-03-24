import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { createDb, type Database } from '@solarc/db'

let _db: Database | undefined
function getDb() {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    _db = createDb(url)
  }
  return _db
}

/**
 * Adapter is only used for OAuth providers (account linking, user creation).
 * Credentials sign-in bypasses the adapter — user lookup/creation happens
 * directly in the authorize callback. With JWT strategy, session storage
 * is cookie-based and does not need the adapter at all.
 */
const adapter = process.env.DATABASE_URL ? DrizzleAdapter(getDb()) : undefined

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Only attach adapter when OAuth providers are active — Credentials-only
  // setups work better without it as the adapter can interfere with JWT creation.
  adapter: process.env.AUTH_GITHUB_ID || process.env.AUTH_GOOGLE_ID ? adapter : undefined,
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/auth/signin',
  },
  providers: [
    // OAuth providers — configured via env vars; auto-disabled if vars are missing
    ...(process.env.AUTH_GITHUB_ID
      ? [
          GitHub({
            clientId: process.env.AUTH_GITHUB_ID,
            clientSecret: process.env.AUTH_GITHUB_SECRET!,
          }),
        ]
      : []),
    ...(process.env.AUTH_GOOGLE_ID
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET!,
          }),
        ]
      : []),
    // Email credentials — always available as a fallback sign-in method
    Credentials({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'you@example.com' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined
        if (!email) return null

        // Try DB lookup/creation, fall back to email-based identity if DB is unavailable.
        // With JWT strategy the session lives in the cookie, so DB is not required.
        try {
          if (process.env.DATABASE_URL) {
            const db = getDb()
            const existing = await db.query.users.findFirst({
              where: (users, { eq }) => eq(users.email, email),
            })
            if (existing) return { id: existing.id, email: existing.email, name: existing.name }
            // Auto-provision user on first sign-in
            const { users } = await import('@solarc/db')
            const [created] = await db
              .insert(users)
              .values({ email, name: email.split('@')[0] })
              .returning()
            if (created) return { id: created.id, email: created.email, name: created.name }
          }
        } catch {
          // DB unavailable — fall through to email-based identity
        }

        // Fallback: use email as identity (works without DB)
        return { id: email, email, name: email.split('@')[0] }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.userId = user.id
      if (user?.email) token.email = user.email
      return token
    },
    session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string
      return session
    },
  },
})
