import type { Database } from '@solarc/db'
import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'

import { sanitizeInput } from './middleware/sanitize'
import { can } from './services/platform/permissions'

export interface TRPCContext {
  db: Database
  session: { userId: string; organizationId: string } | null
  req?: Request
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
})

export const router = t.router
export const publicProcedure = t.procedure
/** Input sanitization — escapes HTML in string inputs to prevent stored XSS. */
const inputSanitization = t.middleware(async ({ next, getRawInput }) => {
  const rawInput = await getRawInput()
  if (rawInput && typeof rawInput === 'object') {
    // Sanitize in-place — tRPC will re-parse through Zod, but strings are now safe
    sanitizeInput(rawInput)
  }
  return next()
})

/** protectedProcedure — enforces authentication + input sanitization. */
export const protectedProcedure = t.procedure
  .use(async ({ ctx, next }) => {
    if (!ctx.session) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
    }
    return next({ ctx: { ...ctx, session: ctx.session } })
  })
  .use(inputSanitization)
export const middleware = t.middleware

/**
 * Workspace access check — verifies user has at least read access to the workspace.
 * Uses real permission system: checks global roles + workspace membership.
 */
const workspaceAccess = middleware(async ({ ctx, input, next }) => {
  const workspaceId = (input as Record<string, unknown>)?.workspaceId
  if (typeof workspaceId === 'string' && ctx.session?.userId) {
    const allowed = await can(ctx.db, ctx.session.userId, 'read', {
      type: 'workspace',
      id: workspaceId,
    })
    if (!allowed) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this workspace' })
    }
  }
  return next({ ctx })
})

export const workspaceProcedure = protectedProcedure.use(workspaceAccess)
