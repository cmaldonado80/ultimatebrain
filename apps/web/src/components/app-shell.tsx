'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './layout/sidebar'
import Topbar from './layout/topbar'
import LiveCursors from './layout/live-cursors'
import { TRPCProvider } from './trpc-provider'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Auth pages get a bare layout — no sidebar, topbar, or tRPC
  if (pathname.startsWith('/auth/')) {
    return <>{children}</>
  }

  return (
    <TRPCProvider>
      <div className="flex h-screen w-full overflow-hidden bg-bg-deep">
        {/* Desktop sidebar — hidden on mobile */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {/* Mobile sidebar overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          >
            <div className="w-64 h-full" onClick={(e) => e.stopPropagation()}>
              <Sidebar onNavigate={() => setMobileMenuOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Mobile top bar with hamburger */}
          <div className="flex items-center md:hidden px-3 py-2 border-b border-border bg-bg-surface">
            <button
              className="text-slate-400 hover:text-white p-1 mr-2"
              onClick={() => setMobileMenuOpen(true)}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <rect y="3" width="20" height="2" rx="1" />
                <rect y="9" width="20" height="2" rx="1" />
                <rect y="15" width="20" height="2" rx="1" />
              </svg>
            </button>
            <span className="font-orbitron text-xs font-bold text-white tracking-widest">
              SOLARC<span className="text-neon-blue">.</span>BRAIN
            </span>
          </div>

          {/* Desktop topbar — hidden on mobile (replaced by hamburger bar) */}
          <div className="hidden md:block">
            <Topbar />
          </div>

          <main className="flex-1 overflow-auto relative z-10">{children}</main>
        </div>
      </div>
      <LiveCursors currentLocation={pathname} />
    </TRPCProvider>
  )
}
