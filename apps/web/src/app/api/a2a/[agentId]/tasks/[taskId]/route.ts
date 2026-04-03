/**
 * A2A Task Polling Endpoint
 *
 * GET /api/a2a/[agentId]/tasks/[taskId]
 * Returns current task status from a2aDelegations table.
 */

import { a2aDelegations, createDb, type Database } from '@solarc/db'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

let _db: Database | undefined
function getDb(): Database {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    _db = createDb(url)
  }
  return _db
}

const A2A_ALLOWED_ORIGINS = process.env.A2A_ALLOWED_ORIGINS?.split(',').map((s) => s.trim()) ?? []

function corsHeaders(): Record<string, string> {
  const origin =
    A2A_ALLOWED_ORIGINS.length > 0
      ? A2A_ALLOWED_ORIGINS.join(', ')
      : process.env.NODE_ENV === 'production'
        ? ''
        : '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string; taskId: string }> },
) {
  const { taskId } = await params
  const db = getDb()

  const delegation = await db.query.a2aDelegations.findFirst({
    where: eq(a2aDelegations.id, taskId),
  })

  if (!delegation) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404, headers: corsHeaders() })
  }

  let parsedResult: unknown = undefined
  if (delegation.result) {
    try {
      parsedResult = JSON.parse(delegation.result)
    } catch {
      parsedResult = delegation.result
    }
  }

  return NextResponse.json(
    {
      task_id: delegation.id,
      status: delegation.status,
      task: delegation.task,
      result: parsedResult,
      error: delegation.error ?? undefined,
      created_at: delegation.createdAt.toISOString(),
      completed_at: delegation.completedAt?.toISOString() ?? null,
    },
    { headers: corsHeaders() },
  )
}
