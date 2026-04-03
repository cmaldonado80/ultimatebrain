export default function DashboardLoading() {
  return (
    <div className="p-6 text-slate-50 animate-pulse">
      <div className="h-8 bg-bg-elevated rounded w-64 mb-2" />
      <div className="h-4 bg-bg-elevated rounded w-96 mb-8" />
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-bg-elevated rounded-lg" />
        ))}
      </div>
      <div className="space-y-4">
        <div className="h-40 bg-bg-elevated rounded-lg" />
        <div className="h-40 bg-bg-elevated rounded-lg" />
      </div>
    </div>
  )
}
