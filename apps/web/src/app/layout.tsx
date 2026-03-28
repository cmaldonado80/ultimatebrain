import './globals.css'

import type { Metadata } from 'next'

import AppShell from '../components/app-shell'

export const metadata: Metadata = {
  title: 'Solarc Brain — Central Intelligence Core',
  description: 'The Brain that powers all Solarc applications',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg-deep text-slate-200 antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
