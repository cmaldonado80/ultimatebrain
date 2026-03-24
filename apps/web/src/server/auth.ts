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
 * Lazy adapter — returns undefined during Next.js static page collection
 * when DATABASE_URL is not yet available. NextAuth works without an adapter
 * for JWT-only sessions; the adapter is only needed for DB-backed user lookup.
 */
const adapter = process.env.DATABASE_URL ? DrizzleAdapter(getDb()) : undefined

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
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
        return created ? { id: created.id, email: created.email, name: created.name } : null
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.userId = user.id
      return token
    },
    session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string
      return session
    },
  },
})
