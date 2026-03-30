import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { COOKIE_NAMES, refreshSession } from '../../../../server/auth'

/**
 * POST /api/auth/refresh — rotate access + refresh tokens.
 * Reads the refresh-token cookie, validates it, and issues new pair.
 */
export async function POST() {
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get(COOKIE_NAMES.refresh)?.value

  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 })
  }

  const tokens = await refreshSession(refreshToken)
  if (!tokens) {
    return NextResponse.json({ error: 'Invalid or expired refresh token' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  const secure = process.env.NODE_ENV === 'production'

  res.cookies.set(COOKIE_NAMES.access, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60,
  })
  res.cookies.set(COOKIE_NAMES.refresh, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })

  return res
}
