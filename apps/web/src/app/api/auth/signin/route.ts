import type { Database } from '@solarc/db'
import { createDb, waitForSchema } from '@solarc/db'
import { userRoles, users } from '@solarc/db'
import { eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { createSession } from '../../../../server/auth'

const COOKIE_NAME = 'session-token'

let _db: Database | undefined
function getDb(): Database {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    _db = createDb(url)
  }
  return _db
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const email = body.email?.trim().toLowerCase()

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    await waitForSchema()
    const db = getDb()

    // Upsert user record — create if new, update timestamp if existing
    let user = await db.query.users.findFirst({ where: eq(users.email, email) })

    if (!user) {
      const [created] = await db
        .insert(users)
        .values({ email, name: email.split('@')[0] })
        .returning()
      user = created!

      // Check if this is the first user — make them platform_owner
      const userCount = await db.execute(sql`SELECT count(*) as count FROM users`)
      const count = Number((userCount.rows[0] as { count: string })?.count ?? 0)
      if (count <= 1) {
        await db.insert(userRoles).values({ userId: user.id, role: 'platform_owner' })
      }
    } else {
      await db.update(users).set({ updatedAt: new Date() }).where(eq(users.id, user.id))
    }

    // Create JWT with user UUID as subject (not email)
    const token = await createSession(email, user.id)

    const res = NextResponse.json({ ok: true })
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    })
    return res
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
