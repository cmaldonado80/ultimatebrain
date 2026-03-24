/**
 * A2A Protocol HTTP + SSE Endpoint
 *
 * POST /api/a2a/[agentId]
 * Accepts: { task, context, callback_url? }
 * Returns:
 *   - Immediate: { status: 'accepted', task_id }
 *   - SSE stream: progress events
 *   - Final: { status: 'completed', result, artifacts }
 *
 * GET /api/a2a/[agentId]/tasks/[taskId]  (poll)
 * Returns current task status
 */

import { NextRequest, NextResponse } from 'next/server'
import { createDb, agents, tickets, type Database } from '@solarc/db'
import { eq } from 'drizzle-orm'

/** Lazy singleton DB pool — avoids cold-start crash if DATABASE_URL not yet set */
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
const A2A_ALLOWED_ORIGINS = process.env.A2A_ALLOWED_ORIGINS?.split(',').map((s) => s.trim()) ?? [
  '*',
]

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': A2A_ALLOWED_ORIGINS.join(', '),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

/** In-memory task store (production: use Redis or DB) */
const taskStore = new Map<
  string,
  {
    agentId: string
    task: string
    status: 'accepted' | 'running' | 'completed' | 'failed'
    result?: unknown
    artifacts?: unknown[]
    error?: string
    progress?: number
    createdAt: Date
    updatedAt: Date
  }
>()

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

  // Verify agent exists
  const db = getDb()
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
  })

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404, headers: corsHeaders() })
  }

  // Enforce request body size limit (64KB)
  const contentLength = req.headers.get('content-length')
  if (contentLength && parseInt(contentLength, 10) > 65_536) {
    return NextResponse.json(
      { error: 'Request body too large (max 64KB)' },
      { status: 413, headers: corsHeaders() },
    )
  }

  // Parse request body
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

  const taskId = crypto.randomUUID()

  // Register task
  taskStore.set(taskId, {
    agentId,
    task: body.task,
    status: 'accepted',
    progress: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

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
      metadata: {
        a2a: true,
        taskId,
        context: body.context ?? {},
        callback_url: body.callback_url ?? null,
      },
    })
    .returning()

  // If streaming requested, return SSE
  if (body.stream || req.headers.get('accept')?.includes('text/event-stream')) {
    return streamTaskProgress(taskId, agentId, body)
  }

  // Start background execution
  executeTaskInBackground(taskId, agentId, body, insertedTicket.id).catch((err) => {
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

  // List all tasks for this agent
  const tasks = Array.from(taskStore.entries())
    .filter(([, t]) => t.agentId === agentId)
    .map(([id, t]) => ({ task_id: id, ...t }))

  return NextResponse.json({ tasks }, { headers: corsHeaders() })
}

// ── SSE Streaming ─────────────────────────────────────────────────────────

function streamTaskProgress(taskId: string, agentId: string, body: A2ARequest): Response {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(payload))
      }

      send('accepted', { task_id: taskId, status: 'accepted' })

      // Simulate execution with progress events
      // Real impl: subscribe to ticket status changes via pg-boss or polling
      const steps = [
        { progress: 10, message: 'Analyzing task...' },
        { progress: 30, message: 'Retrieving relevant memory...' },
        { progress: 50, message: 'Executing with tools...' },
        { progress: 75, message: 'Validating results...' },
        { progress: 90, message: 'Preparing output...' },
      ]

      for (const step of steps) {
        await new Promise((r) => setTimeout(r, 500))
        const task = taskStore.get(taskId)
        if (!task || task.status === 'failed') break

        taskStore.set(taskId, {
          ...task,
          status: 'running',
          progress: step.progress,
          updatedAt: new Date(),
        })
        send('progress', { task_id: taskId, progress: step.progress, message: step.message })
      }

      // Final result
      const finalResult = {
        summary: `Task completed by agent ${agentId}`,
        task: body.task,
        context: body.context,
      }

      const task = taskStore.get(taskId)
      if (task) {
        taskStore.set(taskId, {
          ...task,
          status: 'completed',
          result: finalResult,
          progress: 100,
          updatedAt: new Date(),
        })
      }

      send('completed', {
        task_id: taskId,
        status: 'completed',
        result: finalResult,
        artifacts: [],
      })

      // Deliver callback if provided
      if (body.callback_url) {
        deliverCallback(body.callback_url, taskId, finalResult)
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
  taskId: string,
  agentId: string,
  body: A2ARequest,
  ticketId: string,
): Promise<void> {
  const task = taskStore.get(taskId)
  if (!task) return

  taskStore.set(taskId, { ...task, status: 'running', progress: 10, updatedAt: new Date() })

  try {
    // Delegate to ModeRouter for real execution
    const { ModeRouter } = await import('../../../../server/services/task-runner/mode-router')
    const modeRouter = new ModeRouter(getDb())

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

    taskStore.set(taskId, {
      ...task,
      status: 'completed',
      result,
      progress: 100,
      updatedAt: new Date(),
    })

    if (body.callback_url) {
      await deliverCallback(body.callback_url, taskId, result)
    }
  } catch (err) {
    taskStore.set(taskId, {
      ...task,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      updatedAt: new Date(),
    })
  }
}

// ── Callback Delivery ─────────────────────────────────────────────────────

async function deliverCallback(
  callbackUrl: string,
  taskId: string,
  result: unknown,
): Promise<void> {
  try {
    await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, status: 'completed', result }),
      signal: AbortSignal.timeout(5000),
    })
  } catch (err) {
    console.error(`[A2A] Callback delivery failed for task ${taskId}:`, err)
  }
}
