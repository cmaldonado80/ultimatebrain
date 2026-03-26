import type { Metadata } from 'next'
import { Inter, JetBrains_Mono, Orbitron } from 'next/font/google'
import './globals.css'
import AppShell from '../components/app-shell'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
  weight: ['400', '500', '700'],
})

const orbitron = Orbitron({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-orbitron-loaded',
  weight: ['500', '700', '900'],
})

export const metadata: Metadata = {
  title: 'Solarc Brain — Central Intelligence Core',
  description: 'The Brain that powers all Solarc applications',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${jetbrainsMono.variable} ${orbitron.variable}`}
      style={
        {
          '--font-sans': 'var(--font-inter), system-ui, sans-serif',
          '--font-mono': 'var(--font-jetbrains-mono), monospace',
          '--font-orbitron': 'var(--font-orbitron-loaded), sans-serif',
        } as React.CSSProperties
      }
    >
      <body className="bg-bg-deep text-slate-200 antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
