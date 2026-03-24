'use client'

import { useState, useEffect } from 'react'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [csrfToken, setCsrfToken] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Fetch CSRF token required by NextAuth
    fetch('/api/auth/csrf')
      .then((r) => r.json())
      .then((data) => setCsrfToken(data.csrfToken))
      .catch(() => setError('Failed to load. Please refresh.'))

    // Show error from URL params (NextAuth redirects here with ?error= on failure)
    const err = new URLSearchParams(window.location.search).get('error')
    if (err) setError(err === 'CredentialsSignin' ? 'Sign in failed.' : `Error: ${err}`)
  }, [])

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Solarc Brain</h1>
        <p style={styles.subtitle}>Sign in to continue</p>

        {/*
          Direct form POST to NextAuth callback endpoint.
          This is more reliable than the signIn() client function because
          the browser handles the Set-Cookie headers natively from the redirect.
        */}
        <form
          method="post"
          action="/api/auth/callback/credentials"
          style={styles.form}
          onSubmit={() => setLoading(true)}
        >
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <input type="hidden" name="callbackUrl" value="/" />
          <input
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            style={styles.input}
          />
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" disabled={loading || !csrfToken} style={styles.submitBtn}>
            {loading ? 'Signing in...' : 'Sign in with Email'}
          </button>
        </form>
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
