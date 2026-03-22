import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Solarc Brain — Central Intelligence Core',
  description: 'The Brain that powers all Solarc applications',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-gray-950 text-gray-100 antialiased">
        <div className="flex min-h-screen">
          <aside className="w-[260px] border-r border-gray-800 bg-gray-900/50 p-4">
            <h1 className="mb-6 text-lg font-bold tracking-tight">Solarc Brain</h1>
            <nav className="space-y-1 text-sm">
              <a href="/" className="block rounded px-3 py-2 hover:bg-gray-800">Dashboard</a>
              <a href="/workspaces" className="block rounded px-3 py-2 hover:bg-gray-800">Workspaces</a>
              <a href="/agents" className="block rounded px-3 py-2 hover:bg-gray-800">Agents</a>
              <a href="/tickets" className="block rounded px-3 py-2 hover:bg-gray-800">Tickets</a>
              <a href="/projects" className="block rounded px-3 py-2 hover:bg-gray-800">Projects</a>
              <a href="/chat" className="block rounded px-3 py-2 hover:bg-gray-800">Chat</a>
              <div className="pt-4 text-xs font-semibold uppercase text-gray-500">Ops Center</div>
              <a href="/ops" className="block rounded px-3 py-2 hover:bg-gray-800">Overview</a>
              <a href="/ops/traces" className="block rounded px-3 py-2 hover:bg-gray-800">Traces</a>
              <a href="/ops/evals" className="block rounded px-3 py-2 hover:bg-gray-800">Evals</a>
              <a href="/ops/approvals" className="block rounded px-3 py-2 hover:bg-gray-800">Approvals</a>
              <a href="/ops/gateway" className="block rounded px-3 py-2 hover:bg-gray-800">Gateway</a>
              <div className="pt-4 text-xs font-semibold uppercase text-gray-500">Platform</div>
              <a href="/apps" className="block rounded px-3 py-2 hover:bg-gray-800">Connected Apps</a>
              <a href="/engines" className="block rounded px-3 py-2 hover:bg-gray-800">Engines</a>
              <a href="/skills" className="block rounded px-3 py-2 hover:bg-gray-800">Skills</a>
              <a href="/settings" className="block rounded px-3 py-2 hover:bg-gray-800">Settings</a>
            </nav>
          </aside>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </body>
    </html>
  )
}
