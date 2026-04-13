import { NextResponse } from 'next/server'

/**
 * GET /api/test-error — Intentionally throws to verify Sentry is capturing errors.
 * Remove this route once Sentry integration is confirmed working.
 */
export function GET() {
  throw new Error('Sentry test error — this is intentional')
}

export function POST() {
  return NextResponse.json({
    message: 'POST to /api/test-error to verify Sentry captures server errors',
    timestamp: new Date().toISOString(),
  })
}
