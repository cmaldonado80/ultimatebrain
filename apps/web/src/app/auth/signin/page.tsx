'use client'

import { signIn } from 'next-auth/react'
import { useState, useEffect } from 'react'

interface Providers {
  github: boolean
  google: boolean
  credentials: boolean
}

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [providers, setProviders] = useState<Providers | null>(null)

  useEffect(() => {
    fetch('/api/auth/providers')
      .then((r) => r.json())
      .then(setProviders)
      .catch(() => setProviders({ github: false, google: false, credentials: true }))
  }, [])

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await signIn('credentials', { email, redirect: false })
      if (result?.error || !result?.ok) {
        setError(
          result?.error === 'CredentialsSignin'
            ? 'Invalid email or sign-in failed.'
            : `Sign in failed: ${result?.error || result?.status || 'unknown error'}`,
        )
        setLoading(false)
        return
      }
      // Cookie was set by the response — navigate to dashboard
      window.location.href = '/'
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : 'please try again'}`)
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Solarc Brain</h1>
        <p style={styles.subtitle}>Sign in to continue</p>

        {!providers ? (
          <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 13 }}>Loading...</p>
        ) : (
          <>
            {(providers.github || providers.google) && (
              <div style={styles.providers}>
                {providers.github && (
                  <button
                    onClick={() => signIn('github', { callbackUrl: '/' })}
                    style={styles.oauthBtn}
                  >
                    Sign in with GitHub
                  </button>
                )}
                {providers.google && (
                  <button
                    onClick={() => signIn('google', { callbackUrl: '/' })}
                    style={styles.oauthBtn}
                  >
                    Sign in with Google
                  </button>
                )}
              </div>
            )}

            {(providers.github || providers.google) && (
              <div style={styles.divider}>
                <span style={styles.dividerText}>OR</span>
              </div>
            )}

            <form onSubmit={handleCredentials} style={styles.form}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={styles.input}
              />
              {error && <p style={styles.error}>{error}</p>}
              <button type="submit" disabled={loading} style={styles.submitBtn}>
                {loading ? 'Signing in...' : 'Sign in with Email'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#030712',
  },
  card: {
    width: 380,
    padding: 32,
    background: '#111827',
    borderRadius: 12,
    border: '1px solid #1f2937',
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: '#f9fafb',
    margin: 0,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    margin: '8px 0 24px',
  },
  providers: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  oauthBtn: {
    padding: '10px 16px',
    background: '#1f2937',
    color: '#f9fafb',
    border: '1px solid #374151',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '20px 0',
    borderTop: '1px solid #374151',
    position: 'relative',
  },
  dividerText: {
    position: 'absolute',
    background: '#111827',
    padding: '0 12px',
    fontSize: 11,
    color: '#6b7280',
    fontWeight: 600,
    letterSpacing: 1,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  input: {
    padding: '10px 12px',
    background: '#0f172a',
    border: '1px solid #374151',
    borderRadius: 8,
    color: '#f9fafb',
    fontSize: 14,
    outline: 'none',
  },
  error: {
    color: '#ef4444',
    fontSize: 13,
    margin: 0,
  },
  submitBtn: {
    padding: '10px 16px',
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
}
