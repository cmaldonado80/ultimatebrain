import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sports Astrology — Solarc Brain',
  description: 'Astrological transit analysis for sports predictions, team profiles, and season forecasts.',
};

// ── Styles (inline CSS-in-JS via style tag) ────────────────────────────────────
const BG = '#0f172a';
const SIDEBAR_BG = '#111827';
const BORDER = '#374151';
const TEXT = '#f9fafb';
const MUTED = '#6b7280';
const ACCENT = '#818cf8';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: '⊞' },
  { href: '/teams', label: 'Teams', icon: '◈' },
  { href: '/predictions', label: 'Predictions', icon: '◎' },
  { href: '/forecasts', label: 'Season Forecasts', icon: '◷' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { height: 100%; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: ${BG};
            color: ${TEXT};
            -webkit-font-smoothing: antialiased;
          }
          a { color: inherit; text-decoration: none; }
          select, input, button { font-family: inherit; }
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-track { background: ${BG}; }
          ::-webkit-scrollbar-thumb { background: ${BORDER}; border-radius: 3px; }
          ::-webkit-scrollbar-thumb:hover { background: ${MUTED}; }
          .nav-link {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            color: ${MUTED};
            transition: background 0.15s, color 0.15s;
            cursor: pointer;
          }
          .nav-link:hover {
            background: rgba(129, 140, 248, 0.1);
            color: ${TEXT};
          }
          .nav-link.active {
            background: rgba(129, 140, 248, 0.15);
            color: ${ACCENT};
          }
        `}</style>
      </head>
      <body>
        <div
          style={{
            display: 'flex',
            minHeight: '100vh',
          }}
        >
          {/* Sidebar */}
          <aside
            style={{
              width: 240,
              minWidth: 240,
              background: SIDEBAR_BG,
              borderRight: `1px solid ${BORDER}`,
              display: 'flex',
              flexDirection: 'column',
              position: 'sticky',
              top: 0,
              height: '100vh',
              overflowY: 'auto',
            }}
          >
            {/* Logo */}
            <div
              style={{
                padding: '22px 20px',
                borderBottom: `1px solid ${BORDER}`,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: `${ACCENT}20`,
                  fontSize: 18,
                  flexShrink: 0,
                }}
              >
                ★
              </span>
              <div>
                <div style={{ color: TEXT, fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>
                  Sports Astrology
                </div>
                <div style={{ color: MUTED, fontSize: 11, marginTop: 1 }}>Solarc Brain · Dev Tier</div>
              </div>
            </div>

            {/* Navigation */}
            <nav
              style={{
                flex: 1,
                padding: '14px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <div
                style={{
                  color: MUTED,
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  fontWeight: 600,
                  padding: '6px 14px 8px',
                }}
              >
                Main
              </div>
              {NAV_ITEMS.map((item) => (
                <a key={item.href} href={item.href} className="nav-link">
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 20,
                      height: 20,
                      fontSize: 14,
                      flexShrink: 0,
                      color: ACCENT,
                    }}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </a>
              ))}
            </nav>

            {/* Footer */}
            <div
              style={{
                padding: '14px 20px',
                borderTop: `1px solid ${BORDER}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: `${ACCENT}30`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: ACCENT,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  U
                </div>
                <div>
                  <div style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>User</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: ACCENT,
                      background: `${ACCENT}15`,
                      padding: '1px 6px',
                      borderRadius: 3,
                      display: 'inline-block',
                      marginTop: 1,
                    }}
                  >
                    Pro
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
