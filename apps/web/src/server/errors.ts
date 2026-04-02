/**
 * Domain Error Classes
 *
 * Typed error classes that map to TRPCError codes.
 * Use these instead of generic `throw new Error(...)` in routers and services.
 *
 * Usage:
 *   throw new NotFoundError('Agent', agentId)
 *   throw new ValidationError('Name is required')
 *   throw new ServiceError('deployment', 'Failed to provision')
 *   throw new PermissionError('Insufficient role for this action')
 */

import { TRPCError } from '@trpc/server'

// ── Base Class ───────────────────────────────────────────────────────────

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}

// ── Concrete Errors ──────────────────────────────────────────────────────

export class NotFoundError extends DomainError {
  constructor(entity: string, id?: string) {
    super(id ? `${entity} ${id} not found` : `${entity} not found`, 'NOT_FOUND', 404)
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400)
    this.name = 'ValidationError'
  }
}

export class ServiceError extends DomainError {
  constructor(service: string, message: string) {
    super(`[${service}] ${message}`, 'SERVICE_ERROR', 500)
    this.name = 'ServiceError'
  }
}

export class PermissionError extends DomainError {
  constructor(message: string) {
    super(message, 'PERMISSION_ERROR', 403)
    this.name = 'PermissionError'
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409)
    this.name = 'ConflictError'
  }
}

export class RateLimitError extends DomainError {
  constructor(message: string) {
    super(message, 'RATE_LIMITED', 429)
    this.name = 'RateLimitError'
  }
}

// ── TRPCError Conversion ─────────────────────────────────────────────────

const TRPC_CODE_MAP: Record<string, TRPCError['code']> = {
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'BAD_REQUEST',
  SERVICE_ERROR: 'INTERNAL_SERVER_ERROR',
  PERMISSION_ERROR: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'TOO_MANY_REQUESTS',
}

/**
 * Convert a domain error to a TRPCError. If not a domain error,
 * wraps as INTERNAL_SERVER_ERROR.
 */
export function toTRPCError(err: unknown): TRPCError {
  if (err instanceof TRPCError) return err

  if (err instanceof DomainError) {
    return new TRPCError({
      code: TRPC_CODE_MAP[err.code] ?? 'INTERNAL_SERVER_ERROR',
      message: err.message,
    })
  }

  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: err instanceof Error ? err.message : 'An unexpected error occurred',
  })
}

/**
 * Wrap an async function to automatically convert domain errors to TRPCErrors.
 */
export async function withDomainErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    throw toTRPCError(err)
  }
}
