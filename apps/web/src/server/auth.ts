import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { createDb } from '@solarc/db'

function getDb() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return createDb(url)
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(getDb()),
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
    // Dev-only credentials provider for local development / testing
    ...(process.env.NODE_ENV !== 'production'
      ? [
          Credentials({
            name: 'Dev Login',
            credentials: {
              email: { label: 'Email', type: 'email', placeholder: 'dev@solarc.dev' },
            },
            async authorize(credentials) {
              const email = credentials?.email as string | undefined
              if (!email) return null
              // In development, auto-create or return a user by email
              const db = getDb()
              const existing = await db.query.users.findFirst({
                where: (users, { eq }) => eq(users.email, email),
              })
              if (existing) return { id: existing.id, email: existing.email, name: existing.name }
              // Auto-provision dev user
              const { users } = await import('@solarc/db')
              const [created] = await db
                .insert(users)
                .values({ email, name: email.split('@')[0] })
                .returning()
              return created ? { id: created.id, email: created.email, name: created.name } : null
            },
          }),
        ]
      : []),
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
