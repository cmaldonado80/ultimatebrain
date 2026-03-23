import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '../components/layout/sidebar'
import Topbar from '../components/layout/topbar'

export const metadata: Metadata = {
  title: 'Solarc Brain — Central Intelligence Core',
  description: 'The Brain that powers all Solarc applications',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-gray-950 text-gray-100 antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex flex-1 flex-col">
            <Topbar />
            <main className="flex-1 overflow-auto">{children}</main>
          </div>
        </div>
      </body>
    </html>
  )
}
