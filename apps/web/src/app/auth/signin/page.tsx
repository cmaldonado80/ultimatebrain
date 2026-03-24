'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const isDev = process.env.NODE_ENV !== 'production'

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Solarc Brain</h1>
        <p style={styles.subtitle}>Sign in to continue</p>

        <div style={styles.providers}>
          <button onClick={() => signIn('github', { callbackUrl: '/' })} style={styles.oauthBtn}>
            Sign in with GitHub
          </button>
          <button onClick={() => signIn('google', { callbackUrl: '/' })} style={styles.oauthBtn}>
            Sign in with Google
          </button>
        </div>

        {isDev && (
          <>
            <div style={styles.divider}>
              <span style={styles.dividerText}>DEV ONLY</span>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                signIn('credentials', { email, callbackUrl: '/' })
              }}
              style={styles.devForm}
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dev@solarc.dev"
                required
                style={styles.input}
              />
              <button type="submit" style={styles.devBtn}>
                Dev Login
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
    color: '#f59e0b',
    fontWeight: 600,
    letterSpacing: 1,
  },
  devForm: {
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
  },
  devBtn: {
    padding: '10px 16px',
    background: '#f59e0b',
    color: '#0f172a',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
}
