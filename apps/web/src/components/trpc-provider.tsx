'use client'

import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import { useState } from 'react'
import superjson from 'superjson'

import { trpc } from '../utils/trpc'

function getBaseUrl() {
  if (typeof window !== 'undefined') return ''
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000'
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            const trpcError = error as { data?: { code?: string } }
            if (trpcError?.data?.code === 'UNAUTHORIZED' || error.message === 'Not authenticated') {
              if (typeof window !== 'undefined') window.location.href = '/auth/signin'
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
