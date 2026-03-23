export const dynamic = 'force-dynamic'

declare global { var __db: import('@solarc/db').Database }

async function handler(req: Request) {
  const { fetchRequestHandler } = await import('@trpc/server/adapters/fetch')
  const { appRouter } = await import('../../../../server/routers/_app')

  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => ({
      db: globalThis.__db,
      session: null,
    }),
  })
}

export { handler as GET, handler as POST }
