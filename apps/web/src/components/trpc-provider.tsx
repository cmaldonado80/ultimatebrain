'use client'

import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import { useRef, useState } from 'react'
import superjson from 'superjson'

import { trpc } from '../lib/trpc'

function getBaseUrl() {
  if (typeof window !== 'undefined') return ''
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000'
}

/** Attempt to refresh the session via /api/auth/refresh. Returns true if successful. */
async function tryRefreshSession(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST' })
    return res.ok
  } catch {
    return false
  }
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const refreshingRef = useRef(false)

  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: async (error) => {
            const trpcError = error as { data?: { code?: string } }
            const isUnauth =
              trpcError?.data?.code === 'UNAUTHORIZED' || error.message === 'Not authenticated'

            if (isUnauth && typeof window !== 'undefined') {
              // Try refreshing the token once before redirecting to signin
              if (!refreshingRef.current) {
                refreshingRef.current = true
                const refreshed = await tryRefreshSession()
                refreshingRef.current = false
                if (refreshed) {
                  // Token refreshed — retry all failed queries
                  queryClient.invalidateQueries()
                  return
                }
              }
              // Refresh failed or already in progress — redirect to signin
              window.location.href = '/auth/signin'
            }
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failureCount, error) => {
              const trpcError = error as { data?: { code?: string } }
              if (
                trpcError?.data?.code === 'UNAUTHORIZED' ||
                trpcError?.data?.code === 'FORBIDDEN'
              ) {
                return false
              }
              return failureCount < 1
            },
          },
        },
      }),
  )

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
        }),
      ],
    }),
  )

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}
