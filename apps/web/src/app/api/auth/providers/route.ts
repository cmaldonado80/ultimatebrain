import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    github: !!process.env.AUTH_GITHUB_ID,
    google: !!process.env.AUTH_GOOGLE_ID,
    credentials: true,
  })
}
