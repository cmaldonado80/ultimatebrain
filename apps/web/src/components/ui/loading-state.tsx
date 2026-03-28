/**
 * Shared loading state component for consistent loading indicators.
 */
export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="text-lg font-orbitron text-slate-500 mb-1">{label}</div>
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
    </div>
  )
}
