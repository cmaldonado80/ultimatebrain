import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MGHM Hotels — Operations Portal',
  description: 'MGHM Hotels development app — Solarc Brain Hospitality Mini Brain',
};

// ─── Nav Items ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { label: 'Dashboard',      href: '/',        icon: '⌂' },
  { label: 'Rooms',          href: '/rooms',   icon: '▦' },
  { label: 'F&B Operations', href: '/fb',      icon: '◎' },
  { label: 'Guests',         href: '/guests',  icon: '♟' },
  { label: 'Revenue',        href: '/revenue', icon: '↗' },
  { label: 'Settings',       href: '/settings',icon: '⚙' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style>{`.nav-link:hover { background: #1f2937 !important; color: #f9fafb !important; }`}</style>
      </head>
      <body style={{ margin: 0, padding: 0, background: '#0f172a', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          {/* Sidebar */}
          <aside style={{
            width: '220px',
            background: '#111827',
            borderRight: '1px solid #1f2937',
            display: 'flex',
            flexDirection: 'column',
            position: 'fixed',
            top: 0,
            left: 0,
            height: '100vh',
            zIndex: 50,
          }}>
            {/* Logo */}
            <div style={{
              padding: '24px 20px 20px',
              borderBottom: '1px solid #1f2937',
            }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#f9fafb', letterSpacing: '-0.02em' }}>
                MGHM Hotels
              </div>
              <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Operations Portal
              </div>
            </div>

            {/* Mini Brain Badge */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid #1f2937' }}>
              <div style={{ background: '#1e3a5f', border: '1px solid #2563eb', borderRadius: '6px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399' }} />
                <span style={{ fontSize: '11px', color: '#93c5fd', fontWeight: 600 }}>Hospitality Mini Brain</span>
              </div>
            </div>

            {/* Nav */}
            <nav style={{ flex: 1, padding: '12px 0' }}>
              {NAV_ITEMS.map(item => (
                <a
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 20px',
                    color: '#9ca3af',
                    textDecoration: 'none',
                    fontSize: '14px',
                    fontWeight: 500,
                    transition: 'background 0.15s, color 0.15s',
                  }}
                  className="nav-link"
                >
                  <span style={{ fontSize: '16px', width: '20px', textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                  {item.label}
                </a>
              ))}
            </nav>

            {/* Footer */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid #1f2937' }}>
              <div style={{ fontSize: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                Solarc Brain Platform
              </div>
              <div style={{ fontSize: '11px', color: '#4b5563' }}>Phase 19B · Development</div>
            </div>
          </aside>

          {/* Main content */}
          <main style={{ marginLeft: '220px', flex: 1, minHeight: '100vh' }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
