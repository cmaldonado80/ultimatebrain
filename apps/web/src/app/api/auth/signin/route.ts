import type { Database } from '@solarc/db'
import { createDb, waitForSchema } from '@solarc/db'
import { userRoles, users } from '@solarc/db'
import { eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { COOKIE_NAMES, createSession } from '../../../../server/auth'

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

    // Create JWT pair with user UUID as subject (not email)
    const { accessToken, refreshToken } = await createSession(email, user.id)

    const res = NextResponse.json({ ok: true })
    const secure = process.env.NODE_ENV === 'production'
    res.cookies.set(COOKIE_NAMES.access, accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60, // 15 minutes
    })
    res.cookies.set(COOKIE_NAMES.refresh, refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    })
    return res
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
