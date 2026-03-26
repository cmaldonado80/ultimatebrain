'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './layout/sidebar'
import Topbar from './layout/topbar'
import LiveCursors from './layout/live-cursors'
import { TRPCProvider } from './trpc-provider'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Auth pages get a bare layout — no sidebar, topbar, or tRPC
  if (pathname.startsWith('/auth/')) {
    return <>{children}</>
  }

  return (
    <TRPCProvider>
      <div className="flex h-screen w-full overflow-hidden bg-bg-deep">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-auto relative z-10">{children}</main>
        </div>
      </div>
      <LiveCursors currentLocation={pathname} />
    </TRPCProvider>
  )
}
