'use client'

/**
 * Shared error banner for database/query errors.
 * Differentiates between missing tables, connection errors, and runtime errors.
 */
export function DbErrorBanner({
  error,
  onRetry,
}: {
  error: { message: string }
  onRetry?: () => void
}) {
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
    <div className="cyber-card flex items-center gap-2 p-3 mb-4 border-neon-purple/30">
      <span
        className={`text-sm font-semibold ${isTableMissing || isAuthError ? 'text-neon-purple' : 'text-neon-red'}`}
      >
        {title}
      </span>
      {isAuthError ? (
        <a href="/auth/signin" className="text-neon-purple text-xs underline">
          Please sign in again.
        </a>
      ) : (
        <span className="text-slate-500 text-xs">{detail}</span>
      )}
      {onRetry && (
        <button onClick={onRetry} className="cyber-btn-secondary cyber-btn-sm ml-auto">
          Retry
        </button>
      )}
    </div>
  )
}
