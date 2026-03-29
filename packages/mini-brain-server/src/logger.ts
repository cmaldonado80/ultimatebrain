/**
 * Structured JSON Logger — consistent logging across all Mini Brains.
 *
 * Outputs JSON to stderr (console.warn/error) so it's parseable by
 * Fly.io, Vercel, CloudWatch, Datadog, and any log aggregator.
 *
 * Uses console.warn for info/warn (not console.log which is blocked by ESLint).
 */

export interface Logger {
  info: (message: string, data?: Record<string, unknown>) => void
  warn: (message: string, data?: Record<string, unknown>) => void
  error: (message: string, data?: Record<string, unknown>) => void
}

export function createLogger(service: string): Logger {
  const emit = (level: string, message: string, data?: Record<string, unknown>) => {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service,
      message,
      ...data,
    }
    if (level === 'error') {
      console.error(JSON.stringify(entry))
    } else {
      console.warn(JSON.stringify(entry))
    }
  }

  return {
    info: (message: string, data?: Record<string, unknown>) => emit('info', message, data),
    warn: (message: string, data?: Record<string, unknown>) => emit('warn', message, data),
    error: (message: string, data?: Record<string, unknown>) => emit('error', message, data),
  }
}
