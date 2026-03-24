import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import type { Database } from '@solarc/db'
import { workspaces } from '@solarc/db'
import { eq } from 'drizzle-orm'

export interface TRPCContext {
  db: Database
  session: { userId: string } | null
  req?: Request
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
})

export const router = t.router
export const publicProcedure = t.procedure
/** protectedProcedure — enforces authentication via JWT session. */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
  }
  return next({ ctx: { ...ctx, session: ctx.session } })
})
export const middleware = t.middleware

const workspaceAccess = middleware(async ({ ctx, input, next }) => {
  const workspaceId = (input as Record<string, unknown>)?.workspaceId
  if (typeof workspaceId === 'string' && ctx.session?.userId) {
    const membership = await ctx.db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    })
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this workspace' })
    }
  }
  return next({ ctx })
})

export const workspaceProcedure = protectedProcedure.use(workspaceAccess)
