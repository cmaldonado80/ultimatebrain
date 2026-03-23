'use client';

// ─── Types ────────────────────────────────────────────────────────────────────
interface DayData {
  date: string;
  day: string;
  occupancy: number; // percent
  adr: number;       // Average Daily Rate $
  revpar: number;    // = occupancy/100 * adr
}

interface Channel {
  name: string;
  revenue: number;
  bookings: number;
  color: string;
}

interface RateRecommendation {
  roomType: string;
  currentRate: number;
  suggestedRate: number;
  confidence: number; // 0–100
  reason: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const KPI = {
  occupancy:    78.4,   // %
  adr:          224.50, // $
  revpar:       176.01, // $
  totalRevenue: 892400, // $ 30-day
  prevOccupancy: 74.1,
  prevAdr:       218.00,
  prevRevpar:    161.54,
  prevRevenue:   854200,
};

const SEVEN_DAYS: DayData[] = [
  { date: '2026-03-17', day: 'Mon', occupancy: 72, adr: 198, revpar: 142.56 },
  { date: '2026-03-18', day: 'Tue', occupancy: 75, adr: 204, revpar: 153.00 },
  { date: '2026-03-19', day: 'Wed', occupancy: 80, adr: 218, revpar: 174.40 },
  { date: '2026-03-20', day: 'Thu', occupancy: 83, adr: 231, revpar: 191.73 },
  { date: '2026-03-21', day: 'Fri', occupancy: 91, adr: 268, revpar: 243.88 },
  { date: '2026-03-22', day: 'Sat', occupancy: 94, adr: 284, revpar: 266.96 },
  { date: '2026-03-23', day: 'Sun', occupancy: 76, adr: 210, revpar: 159.60 },
];

const CHANNELS: Channel[] = [
  { name: 'Direct Bookings',   revenue: 312400, bookings: 680,  color: '#7c3aed' },
  { name: 'Booking.com (OTA)', revenue: 248600, bookings: 512,  color: '#2563eb' },
  { name: 'Expedia (OTA)',     revenue: 178900, bookings: 368,  color: '#0891b2' },
  { name: 'Corporate Accounts',revenue: 104800, bookings: 214,  color: '#059669' },
  { name: 'Walk-ins',          revenue: 47700,  bookings: 98,   color: '#d97706' },
];

const RATE_RECOMMENDATIONS: RateRecommendation[] = [
  { roomType: 'Standard',   currentRate: 185, suggestedRate: 195, confidence: 88, reason: 'High demand Thu–Sat; local events this weekend' },
  { roomType: 'Deluxe',     currentRate: 240, suggestedRate: 255, confidence: 82, reason: 'Comp set pricing +8%; opportunity to narrow gap' },
  { roomType: 'Suite',      currentRate: 420, suggestedRate: 410, confidence: 74, reason: 'Suite occupancy 58%; small reduction may stimulate demand' },
  { roomType: 'Penthouse',  currentRate: 950, suggestedRate: 950, confidence: 91, reason: 'Penthouse fully booked next 5 nights; hold rate' },
];

const MARKET_COMP = {
  ourAdr:     224.50,
  marketAvg:  210.80,
  marketLow:  182.00,
  marketHigh: 268.00,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number, dec = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const pctChange = (curr: number, prev: number) => {
  const diff = ((curr - prev) / prev) * 100;
  return { val: diff.toFixed(1), up: diff >= 0 };
};

// ─── Page Component ───────────────────────────────────────────────────────────
export default function RevenuePage() {
  const totalRevAllChannels = CHANNELS.reduce((a, c) => a + c.revenue, 0);

  const S = {
    page:     { minHeight: '100vh', background: '#0f172a', color: '#f9fafb', fontFamily: 'system-ui, sans-serif', padding: '24px' } as React.CSSProperties,
    h1:       { fontSize: '22px', fontWeight: 700, marginBottom: '4px' } as React.CSSProperties,
    sub:      { fontSize: '13px', color: '#6b7280', marginBottom: '28px' } as React.CSSProperties,
    section:  { marginBottom: '32px' } as React.CSSProperties,
    h2:       { fontSize: '15px', fontWeight: 600, color: '#e5e7eb', marginBottom: '16px', borderBottom: '1px solid #374151', paddingBottom: '8px' } as React.CSSProperties,
    kpiGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' } as React.CSSProperties,
    kpiCard:  { background: '#1f2937', border: '1px solid #374151', borderRadius: '10px', padding: '18px 20px' } as React.CSSProperties,
    kpiLabel: { fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.06em' },
    kpiVal:   { fontSize: '30px', fontWeight: 800, marginTop: '4px' } as React.CSSProperties,
    kpiChg:   (up: boolean) => ({ fontSize: '12px', marginTop: '4px', color: up ? '#4ade80' : '#f87171' } as React.CSSProperties),
    card:     { background: '#1f2937', border: '1px solid #374151', borderRadius: '10px', padding: '20px' } as React.CSSProperties,
  };

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Revenue Dashboard</h1>
      <p style={S.sub}>Performance metrics, channel mix and rate intelligence — last 30 days</p>

      {/* KPI Cards */}
      <div style={{ ...S.section }}>
        <h2 style={S.h2}>Key Performance Indicators</h2>
        <div style={S.kpiGrid}>
          {[
            { label: 'Occupancy Rate',    val: `${KPI.occupancy}%`,       color: '#a78bfa', change: pctChange(KPI.occupancy, KPI.prevOccupancy) },
            { label: 'ADR',               val: `$${fmt(KPI.adr, 2)}`,     color: '#34d399', change: pctChange(KPI.adr, KPI.prevAdr) },
            { label: 'RevPAR',            val: `$${fmt(KPI.revpar, 2)}`,  color: '#60a5fa', change: pctChange(KPI.revpar, KPI.prevRevpar) },
            { label: 'Total Revenue (30d)',val: `$${fmt(KPI.totalRevenue)}`, color: '#fbbf24', change: pctChange(KPI.totalRevenue, KPI.prevRevenue) },
          ].map(k => (
            <div key={k.label} style={S.kpiCard}>
              <div style={S.kpiLabel}>{k.label}</div>
              <div style={{ ...S.kpiVal, color: k.color }}>{k.val}</div>
              <div style={S.kpiChg(k.change.up)}>
                {k.change.up ? '▲' : '▼'} {k.change.val}% vs prior period
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue by Channel */}
      <div style={S.section}>
        <h2 style={S.h2}>Revenue by Channel</h2>
        <div style={S.card}>
          {CHANNELS.map(ch => {
            const pct = (ch.revenue / totalRevAllChannels) * 100;
            return (
              <div key={ch.name} style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', color: '#e5e7eb', fontWeight: 500 }}>{ch.name}</span>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>{ch.bookings} bookings</span>
                    <span style={{ fontSize: '13px', color: ch.color, fontWeight: 700 }}>${fmt(ch.revenue)}</span>
                    <span style={{ fontSize: '13px', color: '#9ca3af', minWidth: '40px', textAlign: 'right' }}>{pct.toFixed(1)}%</span>
                  </div>
                </div>
                <div style={{ height: '10px', background: '#374151', borderRadius: '5px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: ch.color, borderRadius: '5px', transition: 'width 0.3s ease' }} />
                </div>
              </div>
            );
          })}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #374151' }}>
            <div style={{ fontSize: '13px', color: '#6b7280' }}>
              Total &nbsp;
              <span style={{ color: '#f9fafb', fontWeight: 700 }}>${fmt(totalRevAllChannels)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 7-Day Trend */}
      <div style={S.section}>
        <h2 style={S.h2}>7-Day Trend</h2>
        <div style={S.card}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  {['Day', 'Date', 'Occupancy', 'Occ. Bar', 'ADR', 'RevPAR'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Occ. Bar' ? 'left' : 'right', padding: '8px 12px', color: '#6b7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #374151', ...(h === 'Day' ? { textAlign: 'left' } : {}) }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SEVEN_DAYS.map((d, i) => {
                  const isToday = i === SEVEN_DAYS.length - 1;
                  const occColor = d.occupancy >= 85 ? '#4ade80' : d.occupancy >= 70 ? '#fbbf24' : '#f87171';
                  return (
                    <tr key={d.date} style={{ background: isToday ? '#172554' : 'transparent' }}>
                      <td style={{ padding: '10px 12px', fontWeight: isToday ? 700 : 400, color: isToday ? '#93c5fd' : '#e5e7eb', borderBottom: '1px solid #1f2937' }}>
                        {d.day} {isToday ? '(today)' : ''}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', borderBottom: '1px solid #1f2937' }}>{d.date}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: occColor, borderBottom: '1px solid #1f2937' }}>{d.occupancy}%</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #1f2937', minWidth: '120px' }}>
                        <div style={{ height: '8px', background: '#374151', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${d.occupancy}%`, background: occColor, borderRadius: '4px' }} />
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#34d399', fontWeight: 600, borderBottom: '1px solid #1f2937' }}>${fmt(d.adr, 2)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#a78bfa', fontWeight: 600, borderBottom: '1px solid #1f2937' }}>${fmt(d.revpar, 2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Rate Recommendations */}
      <div style={S.section}>
        <h2 style={S.h2}>Rate Recommendations</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
          {RATE_RECOMMENDATIONS.map(rec => {
            const diff = rec.suggestedRate - rec.currentRate;
            const diffPct = ((diff / rec.currentRate) * 100).toFixed(1);
            const isUp = diff > 0;
            const isFlat = diff === 0;
            return (
              <div key={rec.roomType} style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '10px', padding: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <span style={{ fontWeight: 700, fontSize: '15px', color: '#f9fafb' }}>{rec.roomType}</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: '#6b7280' }}>Confidence</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: rec.confidence >= 85 ? '#4ade80' : rec.confidence >= 70 ? '#fbbf24' : '#f87171' }}>
                      {rec.confidence}%
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>Current</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#e5e7eb' }}>${rec.currentRate}</div>
                  </div>
                  <div style={{ fontSize: '20px', color: '#6b7280', alignSelf: 'flex-end', marginBottom: '2px' }}>→</div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>Suggested</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: isFlat ? '#e5e7eb' : isUp ? '#4ade80' : '#f87171' }}>
                      ${rec.suggestedRate}
                    </div>
                  </div>
                  {!isFlat && (
                    <div style={{ alignSelf: 'flex-end', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: isUp ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                        {isUp ? '▲' : '▼'} {Math.abs(Number(diffPct))}%
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: '#9ca3af', lineHeight: 1.5 }}>{rec.reason}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Competitive Set Positioning */}
      <div style={S.section}>
        <h2 style={S.h2}>Competitive Set ADR Positioning</h2>
        <div style={S.card}>
          <div style={{ position: 'relative', height: '80px', marginBottom: '8px' }}>
            {/* Range bar */}
            <div style={{ position: 'absolute', top: '34px', left: 0, right: 0, height: '12px', background: '#374151', borderRadius: '6px' }} />
            {/* Market range fill */}
            {(() => {
              const range = MARKET_COMP.marketHigh - MARKET_COMP.marketLow;
              const lowPct = 0;
              const highPct = 100;
              const avgPct = ((MARKET_COMP.marketAvg - MARKET_COMP.marketLow) / range) * 100;
              const ourPct = ((MARKET_COMP.ourAdr - MARKET_COMP.marketLow) / range) * 100;
              return (
                <>
                  <div style={{ position: 'absolute', top: '34px', left: `${lowPct}%`, width: `${highPct - lowPct}%`, height: '12px', background: '#1e3a5f', borderRadius: '6px' }} />
                  {/* Market avg marker */}
                  <div style={{ position: 'absolute', top: '24px', left: `calc(${avgPct}% - 1px)`, width: '2px', height: '32px', background: '#6b7280' }} />
                  <div style={{ position: 'absolute', top: '8px', left: `calc(${avgPct}% - 20px)`, fontSize: '10px', color: '#6b7280', textAlign: 'center', width: '40px' }}>Mkt avg</div>
                  {/* Our ADR marker */}
                  <div style={{ position: 'absolute', top: '20px', left: `calc(${ourPct}% - 1px)`, width: '3px', height: '40px', background: '#34d399' }} />
                  <div style={{ position: 'absolute', top: '4px', left: `calc(${ourPct}% - 16px)`, fontSize: '10px', color: '#34d399', fontWeight: 700, textAlign: 'center', width: '32px' }}>MGHM</div>
                </>
              );
            })()}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
            <span>Market Low: ${MARKET_COMP.marketLow}</span>
            <span style={{ color: '#6b7280' }}>Market Avg: <span style={{ color: '#e5e7eb', fontWeight: 600 }}>${MARKET_COMP.marketAvg}</span></span>
            <span>Market High: ${MARKET_COMP.marketHigh}</span>
          </div>
          <div style={{ marginTop: '16px', padding: '12px 16px', background: '#0f172a', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>MGHM ADR vs Market Average</span>
            <span style={{ fontSize: '16px', fontWeight: 700, color: '#34d399' }}>
              +${(MARKET_COMP.ourAdr - MARKET_COMP.marketAvg).toFixed(2)} &nbsp;
              <span style={{ fontSize: '12px', color: '#4ade80' }}>
                (+{(((MARKET_COMP.ourAdr - MARKET_COMP.marketAvg) / MARKET_COMP.marketAvg) * 100).toFixed(1)}%)
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
