/**
 * Shared loading state component for consistent loading indicators.
 */
export function LoadingState({
  label,
  message,
  fullHeight = true,
  className,
}: {
  label?: string
  message?: string
  fullHeight?: boolean
  className?: string
}) {
  const text = label ?? message ?? 'Loading...'

  const content = (
    <div className="text-center">
      <div className="text-lg font-orbitron text-slate-500 mb-1">{text}</div>
      <div className="flex justify-center gap-1 mt-3">
        <div className="w-1.5 h-1.5 rounded-full bg-neon-blue animate-pulse" />
        <div
          className="w-1.5 h-1.5 rounded-full bg-neon-blue animate-pulse"
          style={{ animationDelay: '150ms' }}
        />
        <div
          className="w-1.5 h-1.5 rounded-full bg-neon-blue animate-pulse"
          style={{ animationDelay: '300ms' }}
        />
      </div>
    </div>
  )

  if (fullHeight) {
    return (
      <div className={`flex items-center justify-center min-h-[60vh] ${className ?? ''}`}>
        {content}
      </div>
    )
  }

  return (
    <div className={`py-12 flex items-center justify-center ${className ?? ''}`}>{content}</div>
  )
}
