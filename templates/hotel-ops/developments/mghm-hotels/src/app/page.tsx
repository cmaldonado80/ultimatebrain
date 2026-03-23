'use client';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ActivityItem {
  id: string;
  time: string;
  type: 'check-in' | 'check-out' | 'reservation' | 'complaint' | 'vip' | 'housekeeping';
  message: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const STATS = [
  { label: "Today's Arrivals",   value: 18,      unit: 'guests',  color: '#34d399', bg: '#052e16' },
  { label: "Today's Departures", value: 14,      unit: 'checkouts',color: '#fb923c', bg: '#431407' },
  { label: 'Occupancy',          value: '78.4%', unit: '(80 rooms)',color: '#a78bfa', bg: '#2e1065' },
  { label: 'Revenue Today',      value: '$24,180',unit: 'net',    color: '#fbbf24', bg: '#422006' },
  { label: 'Open Complaints',    value: 2,       unit: 'active',  color: '#f87171', bg: '#450a0a' },
  { label: 'VIP In-House',       value: 6,       unit: 'guests',  color: '#60a5fa', bg: '#172554' },
];

const ACTIVITY: ActivityItem[] = [
  { id: '1', time: '09:42', type: 'check-in',     message: 'Takeshi Nakamura checked in — Penthouse 401 (Diamond VIP)' },
  { id: '2', time: '09:15', type: 'complaint',    message: 'New complaint filed by Edward Hollis — Billing discrepancy (Rm 312)' },
  { id: '3', time: '08:58', type: 'check-out',    message: 'Claire Dubois checked out — Deluxe 214. Rating: ★★★★☆' },
  { id: '4', time: '08:30', type: 'reservation',  message: 'New reservation MGH-2026-00451 — Suite for Apr 4–7, $2,100' },
  { id: '5', time: '07:55', type: 'vip',          message: 'James Whitfield loyalty tier upgraded to Diamond — 84,200 pts' },
];

const ACTIVITY_ICON: Record<ActivityItem['type'], { icon: string; color: string }> = {
  'check-in':    { icon: '→',  color: '#34d399' },
  'check-out':   { icon: '←',  color: '#fb923c' },
  'reservation': { icon: '▦',  color: '#60a5fa' },
  'complaint':   { icon: '!',  color: '#f87171' },
  'vip':         { icon: '★',  color: '#fbbf24' },
  'housekeeping':{ icon: '◎',  color: '#a78bfa' },
};

// ─── Quick Actions ─────────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: 'Check In',        href: '/rooms',   color: '#34d399', bg: '#052e16', border: '#166534' },
  { label: 'Check Out',       href: '/rooms',   color: '#fb923c', bg: '#431407', border: '#7c2d12' },
  { label: 'New Reservation', href: '/rooms',   color: '#60a5fa', bg: '#172554', border: '#1e40af' },
];

// ─── Page Component ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const S = {
    page:    { minHeight: '100vh', background: '#0f172a', color: '#f9fafb', fontFamily: 'system-ui, sans-serif', padding: '28px' } as React.CSSProperties,
    h1:      { fontSize: '24px', fontWeight: 800, marginBottom: '4px' } as React.CSSProperties,
    sub:     { fontSize: '13px', color: '#6b7280', marginBottom: '28px' } as React.CSSProperties,
    section: { marginBottom: '28px' } as React.CSSProperties,
    h2:      { fontSize: '14px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: '14px' },
  };

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div style={S.page}>
      <div style={{ marginBottom: '6px', fontSize: '12px', color: '#6b7280' }}>{today}</div>
      <h1 style={S.h1}>Good morning, Operations Team</h1>
      <p style={S.sub}>Here is your MGHM Hotels overview for today.</p>

      {/* Stat Cards */}
      <div style={{ ...S.section }}>
        <div style={S.h2}>Today at a Glance</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px' }}>
          {STATS.map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}33`, borderRadius: '10px', padding: '18px 20px' }}>
              <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{s.label}</div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: s.color, lineHeight: 1.1 }}>{s.value}</div>
              <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '4px' }}>{s.unit}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div style={S.section}>
        <div style={S.h2}>Quick Actions</div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {QUICK_ACTIONS.map(a => (
            <a
              key={a.label}
              href={a.href}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: a.bg,
                border: `1px solid ${a.border}`,
                color: a.color,
                padding: '10px 20px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              {a.label}
            </a>
          ))}
        </div>
      </div>

      {/* Two-column layout: Activity + Mini Nav */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px', alignItems: 'start' }}>
        {/* Recent Activity */}
        <div>
          <div style={S.h2}>Recent Activity</div>
          <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '10px', overflow: 'hidden' }}>
            {ACTIVITY.map((item, idx) => {
              const { icon, color } = ACTIVITY_ICON[item.type];
              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '14px 18px',
                    borderBottom: idx < ACTIVITY.length - 1 ? '1px solid #374151' : 'none',
                  }}
                >
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: `${color}22`,
                    border: `1px solid ${color}55`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    color,
                    flexShrink: 0,
                    fontWeight: 700,
                  }}>
                    {icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', color: '#e5e7eb', lineHeight: 1.5 }}>{item.message}</div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '3px' }}>{item.time}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section Shortcuts */}
        <div>
          <div style={S.h2}>Navigation</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { label: 'Room Management', href: '/rooms',   desc: '80 rooms · 4 floors',         color: '#a78bfa' },
              { label: 'F&B Operations',  href: '/fb',      desc: '3 alerts · 18 items tracked', color: '#34d399' },
              { label: 'Guest Profiles',  href: '/guests',  desc: '8 profiles · NPS 72',         color: '#60a5fa' },
              { label: 'Revenue',         href: '/revenue', desc: 'ADR $224 · Occ 78.4%',        color: '#fbbf24' },
            ].map(s => (
              <a
                key={s.href}
                href={s.href}
                style={{
                  background: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  textDecoration: 'none',
                  display: 'block',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 600, color: s.color }}>{s.label}</div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '3px' }}>{s.desc}</div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
