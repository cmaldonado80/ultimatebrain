import { NextResponse } from 'next/server'

import { COOKIE_NAMES } from '../../../../server/auth'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  }
  // Clear both access and refresh tokens
  res.cookies.set(COOKIE_NAMES.access, '', opts)
  res.cookies.set(COOKIE_NAMES.refresh, '', opts)
  return res
}
