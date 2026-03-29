/**
 * Signin — email-based JWT session
 *
 * POST /api/auth/signin { email }
 * Sets HTTP-only session cookie.
 */

import { SignJWT } from 'jose'
import { NextResponse } from 'next/server'

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-astro-secret')
const COOKIE_NAME = 'astro-session'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const email = (body.email as string)?.trim().toLowerCase()

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    const token = await new SignJWT({ email, name: email.split('@')[0], sub: email })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(SECRET)

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
      { error: err instanceof Error ? err.message : 'Signin failed' },
      { status: 500 },
    )
  }
}
