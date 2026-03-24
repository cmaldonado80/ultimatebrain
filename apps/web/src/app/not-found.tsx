export default function NotFound() {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.code}>404</div>
        <h1 style={styles.title}>Page not found</h1>
        <p style={styles.subtitle}>The page you're looking for doesn't exist or has been moved.</p>
        <a href="/" style={styles.link}>
          Back to Dashboard
        </a>
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#030712',
    fontFamily: 'sans-serif',
  },
  card: {
    textAlign: 'center' as const,
    padding: 40,
  },
  code: {
    fontSize: 72,
    fontWeight: 800,
    color: '#374151',
    lineHeight: 1,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#f9fafb',
    margin: '0 0 8px',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    margin: '0 0 24px',
  },
  link: {
    fontSize: 14,
    color: '#818cf8',
    textDecoration: 'none',
    fontWeight: 600,
  },
}
