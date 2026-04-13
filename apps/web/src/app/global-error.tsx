'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
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
    <html lang="en" className="dark">
      <body
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: 24,
          fontFamily: 'sans-serif',
          color: '#f9fafb',
          background: '#0a0f1a',
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
            A critical error occurred. Our team has been notified.
          </p>
          {error.digest && (
            <p
              style={{ color: '#6b7280', fontSize: 11, marginBottom: 16, fontFamily: 'monospace' }}
            >
              Error ID: {error.digest}
            </p>
          )}
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
        </div>
      </body>
    </html>
  )
}
