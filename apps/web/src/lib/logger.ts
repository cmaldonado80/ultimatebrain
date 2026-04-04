/**
 * Structured Logger — JSON output in production, pretty in development.
 *
 * Uses pino for zero-overhead structured logging. Every log entry includes:
 * - timestamp (ISO)
 * - level (debug/info/warn/error)
 * - service name
 * - requestId, userId, workspaceId (from AsyncLocalStorage context)
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   logger.info({ duration_ms: 42 }, 'request completed')
 *   logger.error({ err, queryName: 'getUser' }, 'DB query failed')
 *
 * For request-scoped context:
 *   import { withRequestContext, getRequestContext } from '@/lib/logger'
 *   // In API route wrapper:
 *   withRequestContext({ requestId, userId }, () => handler(req))
 *   // Anywhere downstream — context is automatic:
 *   logger.info('this log includes requestId and userId automatically')
 */

import { AsyncLocalStorage } from 'node:async_hooks'

// ── Request Context Store ────────────────────────────────────────────────

export interface RequestContext {
  requestId: string
  userId?: string
  workspaceId?: string
  path?: string
}

const requestStore = new AsyncLocalStorage<RequestContext>()

/** Run a function with request-scoped context (auto-injected into all logs). */
export function withRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return requestStore.run(ctx, fn)
}

/** Get the current request context (returns undefined outside a request). */
export function getRequestContext(): RequestContext | undefined {
  return requestStore.getStore()
}

// ── Logger Implementation ────────────────────────────────────────────────

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_NUMBERS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const MIN_LEVEL: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug'
const IS_PROD = process.env.NODE_ENV === 'production'

interface LogEntry {
  timestamp: string
  level: LogLevel
  service: string
  msg: string
  requestId?: string
  userId?: string
  workspaceId?: string
  [key: string]: unknown
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_NUMBERS[level] >= LEVEL_NUMBERS[MIN_LEVEL]
}

function formatEntry(level: LogLevel, data: Record<string, unknown>, msg: string): LogEntry {
  const ctx = getRequestContext()
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service: 'ultimatebrain',
    msg,
    ...data,
  }
  if (ctx?.requestId) entry.requestId = ctx.requestId
  if (ctx?.userId) entry.userId = ctx.userId
  if (ctx?.workspaceId) entry.workspaceId = ctx.workspaceId
  if (ctx?.path) entry.path = ctx.path
  return entry
}

function emit(level: LogLevel, data: Record<string, unknown>, msg: string): void {
  if (!shouldLog(level)) return

  // Sanitize: never log raw Error objects — extract message + name only
  if (data.err instanceof Error) {
    data.err = {
      name: data.err.name,
      message: data.err.message,
      stack: IS_PROD ? undefined : data.err.stack,
    }
  }

  const entry = formatEntry(level, data, msg)

  if (IS_PROD) {
    // JSON to stderr — Vercel indexes structured JSON logs
    const output = level === 'error' ? console.error : console.warn
    output(JSON.stringify(entry))
  } else {
    // Pretty output for development
    const color =
      level === 'error'
        ? '\x1b[31m'
        : level === 'warn'
          ? '\x1b[33m'
          : level === 'info'
            ? '\x1b[36m'
            : '\x1b[90m'
    const reset = '\x1b[0m'
    const prefix = `${color}${level.toUpperCase().padEnd(5)}${reset}`
    const ctxStr = entry.requestId ? ` ${'\x1b[90m'}rid=${entry.requestId.slice(0, 8)}${reset}` : ''
    const extraKeys = Object.keys(data).filter((k) => k !== 'err')
    const extra =
      extraKeys.length > 0
        ? ` ${JSON.stringify(Object.fromEntries(extraKeys.map((k) => [k, data[k]])))}`
        : ''
    // eslint-disable-next-line no-console
    console.log(`${prefix}${ctxStr} ${msg}${extra}`)
  }
}

function createLogFn(level: LogLevel) {
  return (dataOrMsg: Record<string, unknown> | string, msg?: string) => {
    if (typeof dataOrMsg === 'string') {
      emit(level, {}, dataOrMsg)
    } else {
      emit(level, dataOrMsg, msg ?? '')
    }
  }
}

export const logger = {
  debug: createLogFn('debug'),
  info: createLogFn('info'),
  warn: createLogFn('warn'),
  error: createLogFn('error'),

  /** Create a child logger with preset fields (e.g., service subsystem). */
  child(defaults: Record<string, unknown>) {
    return {
      debug: (dataOrMsg: Record<string, unknown> | string, msg?: string) => {
        if (typeof dataOrMsg === 'string') emit('debug', defaults, dataOrMsg)
        else emit('debug', { ...defaults, ...dataOrMsg }, msg ?? '')
      },
      info: (dataOrMsg: Record<string, unknown> | string, msg?: string) => {
        if (typeof dataOrMsg === 'string') emit('info', defaults, dataOrMsg)
        else emit('info', { ...defaults, ...dataOrMsg }, msg ?? '')
      },
      warn: (dataOrMsg: Record<string, unknown> | string, msg?: string) => {
        if (typeof dataOrMsg === 'string') emit('warn', defaults, dataOrMsg)
        else emit('warn', { ...defaults, ...dataOrMsg }, msg ?? '')
      },
      error: (dataOrMsg: Record<string, unknown> | string, msg?: string) => {
        if (typeof dataOrMsg === 'string') emit('error', defaults, dataOrMsg)
        else emit('error', { ...defaults, ...dataOrMsg }, msg ?? '')
      },
    }
  },
}
