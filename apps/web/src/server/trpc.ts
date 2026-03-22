import { initTRPC } from '@trpc/server'
import superjson from 'superjson'
import type { Database } from '@solarc/db'

export interface TRPCContext {
  db: Database
  session: { userId: string } | null
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
})

export const router = t.router
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session) {
    throw new Error('UNAUTHORIZED')
  }
  return next({ ctx: { ...ctx, session: ctx.session } })
})
export const middleware = t.middleware
