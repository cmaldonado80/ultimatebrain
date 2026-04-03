/**
 * Signin — redirects to Brain's signin flow
 *
 * POST /api/auth/signin
 * The Brain handles authentication and sets the session-token cookie.
 */

import { NextResponse } from 'next/server'

const BRAIN_URL = process.env.BRAIN_URL ?? 'http://localhost:3000'

export async function POST(req: Request) {
  const url = new URL(req.url)
  const callbackUrl = url.searchParams.get('callbackUrl') ?? url.origin
  const signinUrl = `${BRAIN_URL}/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`
  return NextResponse.redirect(signinUrl, 303)
}
