'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function SigninPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError((data as { error?: string }).error ?? 'Signin failed')
        return
      }
      router.push('/')
      router.refresh()
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#06090f] text-slate-200 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1
          className="text-xl font-bold text-center mb-6"
          style={{ fontFamily: "'Orbitron', sans-serif" }}
        >
          Solarc Legal
        </h1>
        {error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-4 text-sm text-red-300">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full bg-[#111827] border border-white/10 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white rounded py-2.5 text-sm font-medium transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </main>
  )
}
