'use client'

/**
 * Placeholder page shown for routes that are not yet implemented.
 */

interface StubPageProps {
  icon: string
  title: string
  description: string
}

export default function StubPage({ icon, title, description }: StubPageProps) {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.icon}>{icon}</div>
        <h1 style={styles.title}>{title}</h1>
        <p style={styles.description}>{description}</p>
        <div style={styles.badge}>Coming Soon</div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    padding: 24,
    fontFamily: 'sans-serif',
  },
  card: {
    textAlign: 'center' as const,
    maxWidth: 400,
  },
  icon: {
    fontSize: 40,
    marginBottom: 16,
    opacity: 0.5,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: '#f9fafb',
  },
  description: {
    margin: '8px 0 20px',
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 1.5,
  },
  badge: {
    display: 'inline-block',
    fontSize: 11,
    fontWeight: 600,
    color: '#818cf8',
    background: '#1e1b4b',
    padding: '4px 12px',
    borderRadius: 20,
    letterSpacing: 0.5,
  },
}
