'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="cyber-card p-6 max-w-md text-center">
        <div className="text-neon-red text-lg font-orbitron mb-2">Something went wrong</div>
        <p className="text-sm text-slate-400 mb-4">{error.message}</p>
        <button className="cyber-btn-primary" onClick={reset}>
          Try Again
        </button>
      </div>
    </div>
  )
}
