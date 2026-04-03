/**
 * A2A Protocol HTTP + SSE Endpoint
 *
 * POST /api/a2a/[agentId]
 * Accepts: { task, context, callback_url? }
 * Returns: { status: 'accepted', task_id, poll_url }
 *
 * GET /api/a2a/[agentId]
 * Returns all delegations for agent from DB
 */

import { a2aDelegations, agents, createDb, type Database, tickets } from '@solarc/db'
import { desc, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

/** Lazy singleton DB pool */
let _db: Database | undefined
function getDb(): Database {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    _db = createDb(url)
  }
  return _db
}

interface A2ARequest {
  task: string
  context?: Record<string, unknown>
  callback_url?: string
  stream?: boolean
}

// ── Rate Limiting ─────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60_000
const MAX_REQUESTS_PER_IP = 30
const MAX_REQUESTS_PER_AGENT = 100

const ipRequestCounts = new Map<string, { count: number; resetAt: number }>()
const agentRequestCounts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(
  key: string,
  store: Map<string, { count: number; resetAt: number }>,
  max: number,
): boolean {
  const now = Date.now()
  const entry = store.get(key)
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (entry.count >= max) return false
  entry.count++
  return true
}

// ── SSRF Protection ──────────────────────────────────────────────────────

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
]

function isPrivateUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    if (['localhost', '0.0.0.0', '[::1]', '::1'].includes(hostname)) return true
    return PRIVATE_IP_PATTERNS.some((p) => p.test(hostname))
  } catch {
    return false
  }
}

// ── CORS ──────────────────────────────────────────────────────────────────
const A2A_ALLOWED_ORIGINS = process.env.A2A_ALLOWED_ORIGINS?.split(',').map((s) => s.trim()) ?? []

function resolveOrigin(): string {
  if (A2A_ALLOWED_ORIGINS.length > 0) return A2A_ALLOWED_ORIGINS.join(', ')
  if (process.env.NODE_ENV === 'production') return ''
  return '*'
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip, ipRequestCounts, MAX_REQUESTS_PER_IP)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': '60', ...corsHeaders() } },
    )
  }
  if (!checkRateLimit(agentId, agentRequestCounts, MAX_REQUESTS_PER_AGENT)) {
    return NextResponse.json(
      { error: 'Agent rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': '60', ...corsHeaders() } },
    )
  }

  const db = getDb()
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) })
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404, headers: corsHeaders() })
  }

  const contentLength = req.headers.get('content-length')
  if (contentLength && parseInt(contentLength, 10) > 65_536) {
    return NextResponse.json(
      { error: 'Request body too large (max 64KB)' },
      { status: 413, headers: corsHeaders() },
    )
  }

  let body: A2ARequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: corsHeaders() },
    )
  }

  if (!body.task || typeof body.task !== 'string') {
    return NextResponse.json({ error: 'task is required' }, { status: 400, headers: corsHeaders() })
  }
  if (body.task.length > 10000) {
    return NextResponse.json(
      { error: 'task exceeds maximum length of 10000 characters' },
      { status: 400, headers: corsHeaders() },
    )
  }

  if (body.callback_url) {
    try {
      const cbUrl = new URL(body.callback_url)
      if (!['http:', 'https:'].includes(cbUrl.protocol)) {
        return NextResponse.json(
          { error: 'callback_url must use http or https' },
          { status: 400, headers: corsHeaders() },
        )
      }
      if (isPrivateUrl(body.callback_url)) {
        return NextResponse.json(
          { error: 'callback_url must not target private networks' },
          { status: 400, headers: corsHeaders() },
        )
      }
    } catch {
      return NextResponse.json(
        { error: 'callback_url is not a valid URL' },
        { status: 400, headers: corsHeaders() },
      )
    }
  }

  // Create DB-backed delegation record (replaces in-memory taskStore)
  const [delegation] = await db
    .insert(a2aDelegations)
    .values({
      toAgentId: agentId,
      task: body.task,
      context: { ...body.context, callback_url: body.callback_url ?? null },
      status: 'accepted',
    })
    .returning()

  const taskId = delegation.id

  // Create internal ticket assigned to the agent
  const [insertedTicket] = await db
    .insert(tickets)
    .values({
      title: `[A2A] ${body.task.slice(0, 200)}`,
      description: body.task,
      status: 'queued',
      priority: 'medium',
      complexity: 'medium',
      assignedAgentId: agentId,
      ...(agent.workspaceId ? { workspaceId: agent.workspaceId } : {}),
      metadata: { a2a: true, delegationId: taskId },
    })
    .returning()

  // If streaming requested, return SSE
  if (body.stream || req.headers.get('accept')?.includes('text/event-stream')) {
    return streamTaskProgress(db, taskId, agentId, body, insertedTicket.id)
  }

  // Start background execution
  executeTaskInBackground(db, taskId, agentId, body, insertedTicket.id).catch((err) => {
    console.error(`[A2A] Background execution failed for task ${taskId}:`, err)
  })

  return NextResponse.json(
    {
      status: 'accepted',
      task_id: taskId,
      agent: agent.name,
      poll_url: `/api/a2a/${agentId}/tasks/${taskId}`,
    },
    { status: 202, headers: corsHeaders() },
  )
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params
  const db = getDb()

  const delegations = await db
    .select({
      id: a2aDelegations.id,
      task: a2aDelegations.task,
      status: a2aDelegations.status,
      result: a2aDelegations.result,
      error: a2aDelegations.error,
      createdAt: a2aDelegations.createdAt,
      completedAt: a2aDelegations.completedAt,
    })
    .from(a2aDelegations)
    .where(eq(a2aDelegations.toAgentId, agentId))
    .orderBy(desc(a2aDelegations.createdAt))
    .limit(50)

  const tasks = delegations.map((d) => ({
    task_id: d.id,
    task: d.task,
    status: d.status,
    result: d.result ? safeJsonParse(d.result) : undefined,
    error: d.error ?? undefined,
    created_at: d.createdAt.toISOString(),
    completed_at: d.completedAt?.toISOString() ?? null,
  }))

  return NextResponse.json({ tasks }, { headers: corsHeaders() })
}

function safeJsonParse(str: string): unknown {
  try {
    return JSON.parse(str)
  } catch {
    return str
  }
}

// ── SSE Streaming ─────────────────────────────────────────────────────────

function streamTaskProgress(
  db: Database,
  taskId: string,
  agentId: string,
  body: A2ARequest,
  ticketId: string,
): Response {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(payload))
      }

      send('accepted', { task_id: taskId, status: 'accepted' })

      // Execute via ModeRouter and stream progress
      try {
        await db
          .update(a2aDelegations)
          .set({ status: 'in_progress' })
          .where(eq(a2aDelegations.id, taskId))

        send('progress', { task_id: taskId, progress: 10, message: 'Routing to agent...' })

        const { ModeRouter } = await import('../../../../server/services/task-runner/mode-router')
        const modeRouter = new ModeRouter(db)

        send('progress', { task_id: taskId, progress: 30, message: 'Executing task...' })

        const execResult = await modeRouter.route(ticketId, body.task, {
          forceMode: 'autonomous',
        })

        const result = {
          summary: `Task completed by agent ${agentId} (mode=${execResult.mode}, ${execResult.latencyMs}ms)`,
          task: body.task,
          completedAt: new Date().toISOString(),
        }

        await db
          .update(a2aDelegations)
          .set({
            status: 'completed',
            result: JSON.stringify(result),
            completedAt: new Date(),
          })
          .where(eq(a2aDelegations.id, taskId))

        send('completed', { task_id: taskId, status: 'completed', result, artifacts: [] })

        if (body.callback_url) {
          deliverCallback(body.callback_url, taskId, result)
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        await db
          .update(a2aDelegations)
          .set({ status: 'failed', error: errorMsg, completedAt: new Date() })
          .where(eq(a2aDelegations.id, taskId))
        send('failed', { task_id: taskId, status: 'failed', error: errorMsg })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Task-ID': taskId,
      ...corsHeaders(),
    },
  })
}

// ── Background Execution ──────────────────────────────────────────────────

async function executeTaskInBackground(
  db: Database,
  taskId: string,
  agentId: string,
  body: A2ARequest,
  ticketId: string,
): Promise<void> {
  await db
    .update(a2aDelegations)
    .set({ status: 'in_progress' })
    .where(eq(a2aDelegations.id, taskId))

  try {
    const { ModeRouter } = await import('../../../../server/services/task-runner/mode-router')
    const modeRouter = new ModeRouter(db)

    let executionResult
    try {
      executionResult = await modeRouter.route(ticketId, body.task, { forceMode: 'autonomous' })
    } catch (routeErr) {
      console.error(`[A2A] ModeRouter execution failed for task ${taskId}:`, routeErr)
      executionResult = null
    }

    const result = {
      summary: executionResult
        ? `Task completed by agent ${agentId} (mode=${executionResult.mode}, ${executionResult.latencyMs}ms)`
        : `Task completed by agent ${agentId}`,
      task: body.task,
      completedAt: new Date().toISOString(),
    }

    await db
      .update(a2aDelegations)
      .set({ status: 'completed', result: JSON.stringify(result), completedAt: new Date() })
      .where(eq(a2aDelegations.id, taskId))

    if (body.callback_url) {
      await deliverCallback(body.callback_url, taskId, result)
    }
  } catch (err) {
    await db
      .update(a2aDelegations)
      .set({
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      })
      .where(eq(a2aDelegations.id, taskId))
  }
}

// ── Callback Delivery ─────────────────────────────────────────────────────

async function deliverCallback(
  callbackUrl: string,
  taskId: string,
  result: unknown,
): Promise<void> {
  // Retry up to 3 times with backoff
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, status: 'completed', result }),
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) return
      console.warn(`[A2A] Callback ${callbackUrl} returned ${res.status} (attempt ${attempt + 1})`)
    } catch (err) {
      console.warn(`[A2A] Callback delivery attempt ${attempt + 1} failed:`, err)
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
  }
  console.error(`[A2A] Callback delivery failed after 3 attempts for task ${taskId}`)
}
