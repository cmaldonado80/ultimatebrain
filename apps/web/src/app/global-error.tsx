'use client'

/**
 * Global Error Boundary — catches errors in the root layout.
 * Must render its own <html>/<body> since the root layout failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: '#0f172a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily: 'system-ui, sans-serif',
          color: '#f9fafb',
        }}
      >
        <div style={{ textAlign: 'center', padding: 32, maxWidth: 480 }}>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: 16 }}>
            A critical error occurred. Please try refreshing the page.
          </p>
          {error.digest && (
            <p
              style={{ color: '#6b7280', fontSize: 11, marginBottom: 16, fontFamily: 'monospace' }}
            >
              Reference: {error.digest}
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
            Refresh
          </button>
        </div>
      </body>
    </html>
  )
}
