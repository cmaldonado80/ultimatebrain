'use client'

/**
 * Shared error banner for database/query errors.
 * Differentiates between missing tables, connection errors, and runtime errors.
 */
export function DbErrorBanner({ error }: { error: { message: string } }) {
  const msg = error.message ?? ''
  const isTableMissing = msg.includes('relation') && msg.includes('does not exist')
  const isConnectionError =
    msg.includes('ECONNREFUSED') ||
    msg.includes('Connection terminated') ||
    msg.includes('connect ETIMEDOUT')
  const isAuthError = msg.includes('Not authenticated') || msg.includes('UNAUTHORIZED')

  const title = isTableMissing
    ? 'Database tables not yet provisioned.'
    : isConnectionError
      ? 'Cannot connect to database.'
      : isAuthError
        ? 'Session expired.'
        : 'Failed to load data.'

  const detail = isTableMissing
    ? 'Run: npx tsx packages/db/src/migrate.ts'
    : isConnectionError
      ? 'Check that PostgreSQL is running (docker compose up postgres).'
      : isAuthError
        ? null
        : msg

  return (
    <div
      style={{
        background: '#1e1b4b',
        border: '1px solid #4338ca',
        borderRadius: 8,
        padding: '10px 16px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span
        style={{
          color: isTableMissing || isAuthError ? '#818cf8' : '#fca5a5',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {title}
      </span>
      {isAuthError ? (
        <a
          href="/auth/signin"
          style={{ color: '#818cf8', fontSize: 12, textDecoration: 'underline' }}
        >
          Please sign in again.
        </a>
      ) : (
        <span style={{ color: '#6b7280', fontSize: 12 }}>{detail}</span>
      )}
    </div>
  )
}
