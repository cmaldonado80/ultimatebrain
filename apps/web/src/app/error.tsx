'use client'

import { useEffect } from 'react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to structured logger (server-side errors have digest, client errors have message)
    // In production this could be wired to Sentry.captureException(error)
    console.error('[ErrorBoundary]', error.digest ?? error.name, error.message)
  }, [error])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: 24,
        fontFamily: 'sans-serif',
        color: '#f9fafb',
      }}
    >
      <div
        style={{
          background: '#1f2937',
          border: '1px solid #374151',
          borderRadius: 12,
          padding: 32,
          maxWidth: 480,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 12 }}>Something went wrong</div>
        <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
          An unexpected error occurred. Please try again.
        </p>
        {error.digest && (
          <p style={{ color: '#6b7280', fontSize: 11, marginBottom: 16, fontFamily: 'monospace' }}>
            Reference: {error.digest}
          </p>
        )}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={reset}
            style={{
              background: '#818cf8',
              color: '#f9fafb',
              border: 'none',
              borderRadius: 8,
              padding: '10px 24px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
          <button
            onClick={() => (window.location.href = '/')}
            style={{
              background: 'transparent',
              color: '#9ca3af',
              border: '1px solid #4b5563',
              borderRadius: 8,
              padding: '10px 24px',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Go Home
          </button>
        </div>
      </div>
    </div>
  )
}
