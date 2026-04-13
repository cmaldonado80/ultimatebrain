export default function ChatLoading() {
  return (
    <div className="flex flex-col gap-4 p-6 min-h-[60vh]">
      {/* Incoming message skeleton */}
      <div className="flex items-start gap-3 max-w-[70%]">
        <div className="w-8 h-8 rounded-full bg-slate-700 animate-pulse shrink-0" />
        <div className="flex flex-col gap-2">
          <div className="h-4 w-48 rounded bg-slate-700 animate-pulse" />
          <div
            className="h-4 w-36 rounded bg-slate-700 animate-pulse"
            style={{ animationDelay: '75ms' }}
          />
        </div>
      </div>

      {/* Outgoing message skeleton */}
      <div className="flex items-start gap-3 max-w-[70%] self-end flex-row-reverse">
        <div className="w-8 h-8 rounded-full bg-slate-700 animate-pulse shrink-0" />
        <div className="flex flex-col gap-2 items-end">
          <div
            className="h-4 w-40 rounded bg-neon-blue/20 animate-pulse"
            style={{ animationDelay: '100ms' }}
          />
          <div
            className="h-4 w-56 rounded bg-neon-blue/20 animate-pulse"
            style={{ animationDelay: '175ms' }}
          />
        </div>
      </div>

      {/* Incoming message skeleton */}
      <div className="flex items-start gap-3 max-w-[70%]">
        <div className="w-8 h-8 rounded-full bg-slate-700 animate-pulse shrink-0" />
        <div className="flex flex-col gap-2">
          <div
            className="h-4 w-52 rounded bg-slate-700 animate-pulse"
            style={{ animationDelay: '150ms' }}
          />
          <div
            className="h-4 w-44 rounded bg-slate-700 animate-pulse"
            style={{ animationDelay: '225ms' }}
          />
          <div
            className="h-4 w-28 rounded bg-slate-700 animate-pulse"
            style={{ animationDelay: '300ms' }}
          />
        </div>
      </div>

      {/* Typing indicator */}
      <div className="flex items-center gap-3 mt-auto">
        <div className="w-8 h-8 rounded-full bg-slate-700 animate-pulse shrink-0" />
        <div className="flex gap-1">
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
