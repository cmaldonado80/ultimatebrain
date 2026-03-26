'use client'

import { useState } from 'react'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Sign in failed')
        setLoading(false)
        return
      }
      window.location.href = '/'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-deep">
      <div className="cyber-card p-8 w-[380px]">
        <h1 className="font-orbitron text-2xl font-bold text-white text-center tracking-widest mb-1">
          SOLARC<span className="text-neon-blue">.</span>BRAIN
        </h1>
        <p className="text-sm text-slate-500 text-center mb-6">Sign in to continue</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="cyber-input"
          />
          {error && <p className="text-neon-red text-sm m-0">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="cyber-btn-primary w-full disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in with Email'}
          </button>
        </form>
      </div>
    </div>
  )
}
