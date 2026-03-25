import type { Metadata } from 'next'
import './globals.css'
import AppShell from '../components/app-shell'

export const metadata: Metadata = {
  title: 'Solarc Brain — Central Intelligence Core',
  description: 'The Brain that powers all Solarc applications',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-gray-950 text-gray-100 antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
