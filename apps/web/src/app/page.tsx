export default function DashboardPage() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Brain Dashboard</h2>
        <p className="text-sm text-gray-400">Central Intelligence Core — Solarc v4</p>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Active Agents" value="0" />
        <StatCard label="Open Tickets" value="0" />
        <StatCard label="LLM Calls (24h)" value="0" />
        <StatCard label="Cost (24h)" value="$0.00" />
      </div>
      <div className="mt-8 grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
          <h3 className="mb-2 font-semibold">Recent Tickets</h3>
          <p className="text-sm text-gray-500">No tickets yet. Create one to get started.</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
          <h3 className="mb-2 font-semibold">Entity Topology</h3>
          <p className="text-sm text-gray-500">Brain → Mini Brains → Developments</p>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  )
}
