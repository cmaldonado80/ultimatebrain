'use client';

// ── Types ──────────────────────────────────────────────────────────────────────
interface StatCard {
  label: string;
  value: string | number;
  subtext: string;
  color: string;
  icon: string;
}

interface TransitAspect {
  planets: string;
  aspect: string;
  orb: string;
  influence: 'harmonious' | 'challenging' | 'neutral';
  description: string;
}

interface UpcomingMatch {
  id: number;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  date: string;
  predictability: 'High' | 'Medium' | 'Low';
}

interface RecentResult {
  id: number;
  date: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  prediction: string;
  correct: boolean;
  confidence: number;
}

// ── Mock Data ─────────────────────────────────────────────────────────────────
const TODAY_TRANSITS: TransitAspect[] = [
  {
    planets: 'Jupiter — natal Sun (Yankees)',
    aspect: 'Trine',
    orb: '0°22\'',
    influence: 'harmonious',
    description: 'Expansive momentum for NY Yankees; competitive advantage today.',
  },
  {
    planets: 'Saturn — natal Mars (Lakers)',
    aspect: 'Square',
    orb: '1°08\'',
    influence: 'challenging',
    description: 'Physical strain on LA Lakers; risk of under-performance.',
  },
  {
    planets: 'Venus — natal Moon (Man Utd)',
    aspect: 'Sextile',
    orb: '0°44\'',
    influence: 'harmonious',
    description: 'Manchester United fans strongly supportive; home energy elevated.',
  },
  {
    planets: 'Neptune — natal Sun (Cowboys)',
    aspect: 'Opposition',
    orb: '1°31\'',
    influence: 'challenging',
    description: 'Dallas Cowboys facing clarity issues; avoid over-reliance on them today.',
  },
  {
    planets: 'Mars — natal Jupiter (Canadiens)',
    aspect: 'Conjunction',
    orb: '0°11\'',
    influence: 'harmonious',
    description: 'Montreal Canadiens physical drive peaks; excellent day for a win.',
  },
];

const UPCOMING_MATCHES: UpcomingMatch[] = [
  { id: 1, homeTeam: 'NY Yankees', awayTeam: 'Boston Red Sox', sport: 'MLB', date: 'Mar 25, 2026', predictability: 'High' },
  { id: 2, homeTeam: 'LA Lakers', awayTeam: 'Golden State Warriors', sport: 'NBA', date: 'Mar 26, 2026', predictability: 'Medium' },
  { id: 3, homeTeam: 'Manchester United', awayTeam: 'Arsenal', sport: 'Soccer', date: 'Mar 28, 2026', predictability: 'High' },
];

const RECENT_RESULTS: RecentResult[] = [
  { id: 1, date: 'Mar 22', homeTeam: 'NY Yankees', awayTeam: 'LA Dodgers', sport: 'MLB', prediction: 'NY Yankees', correct: true, confidence: 72 },
  { id: 2, date: 'Mar 20', homeTeam: 'LA Lakers', awayTeam: 'Boston Celtics', sport: 'NBA', prediction: 'Boston Celtics', correct: false, confidence: 65 },
  { id: 3, date: 'Mar 18', homeTeam: 'Kansas City Chiefs', awayTeam: 'Dallas Cowboys', sport: 'NFL', prediction: 'Kansas City Chiefs', correct: true, confidence: 68 },
  { id: 4, date: 'Mar 15', homeTeam: 'Real Madrid', awayTeam: 'Barcelona', sport: 'Soccer', prediction: 'Real Madrid', correct: true, confidence: 74 },
  { id: 5, date: 'Mar 12', homeTeam: 'Montreal Canadiens', awayTeam: 'Toronto', sport: 'NHL', prediction: 'Montreal Canadiens', correct: false, confidence: 58 },
];

// ── Styles ─────────────────────────────────────────────────────────────────────
const BG = '#0f172a';
const CARD = '#1f2937';
const BORDER = '#374151';
const TEXT = '#f9fafb';
const MUTED = '#6b7280';
const ACCENT = '#818cf8';
const SUCCESS = '#34d399';
const DANGER = '#ef4444';
const WARNING = '#fbbf24';

const sportColors: Record<string, string> = {
  MLB: '#ef4444',
  NBA: '#f97316',
  NFL: '#22c55e',
  NHL: '#3b82f6',
  Soccer: '#a855f7',
};

const STAT_CARDS: StatCard[] = [
  { label: 'Teams Tracked', value: 6, subtext: '4 with full charts', color: ACCENT, icon: '◈' },
  { label: 'Total Predictions', value: 10, subtext: 'All time', color: '#60a5fa', icon: '◎' },
  { label: 'Accuracy Rate', value: '65%', subtext: '↑ 3% vs last month', color: SUCCESS, icon: '◷' },
  { label: 'Active Streak', value: '3 correct', subtext: 'Current run', color: WARNING, icon: '◆' },
  { label: 'Upcoming Matches', value: 3, subtext: 'Next 7 days', color: '#f472b6', icon: '◉' },
];

// ── Sub-components ────────────────────────────────────────────────────────────
function TransitRow({ t }: { t: TransitAspect }) {
  const colors = {
    harmonious: { dot: SUCCESS, badge: SUCCESS, badgeBg: '#0d2b1e' },
    challenging: { dot: DANGER, badge: DANGER, badgeBg: '#2d0f0f' },
    neutral: { dot: MUTED, badge: MUTED, badgeBg: '#1a1f2e' },
  }[t.influence];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 0',
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: colors.dot,
          flexShrink: 0,
          marginTop: 4,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
          <span style={{ color: TEXT, fontWeight: 600, fontSize: 13 }}>{t.planets}</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: ACCENT,
              background: `${ACCENT}15`,
              padding: '1px 7px',
              borderRadius: 4,
            }}
          >
            {t.aspect}
          </span>
          <span style={{ color: MUTED, fontSize: 11, fontFamily: 'monospace' }}>orb {t.orb}</span>
        </div>
        <div style={{ color: MUTED, fontSize: 12 }}>{t.description}</div>
      </div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: colors.badge,
          background: colors.badgeBg,
          padding: '2px 8px',
          borderRadius: 4,
          textTransform: 'capitalize',
          whiteSpace: 'nowrap',
          letterSpacing: '0.05em',
        }}
      >
        {t.influence}
      </span>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: TEXT }}>Dashboard</h1>
        <p style={{ margin: '4px 0 0', color: MUTED, fontSize: 14 }}>
          Monday, March 23, 2026 · Transits active now
        </p>
      </div>

      {/* Stat Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
          gap: 14,
          marginBottom: 32,
        }}
      >
        {STAT_CARDS.map((card) => (
          <div
            key={card.label}
            style={{
              background: CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: '16px 18px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <span style={{ color: MUTED, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
                {card.label}
              </span>
              <span style={{ color: card.color, fontSize: 16 }}>{card.icon}</span>
            </div>
            <div style={{ color: card.color, fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
              {card.value}
            </div>
            <div style={{ color: MUTED, fontSize: 12 }}>{card.subtext}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        {/* Today's Transits */}
        <div
          style={{
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: 24,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT }}>
              Today's Active Transits
            </h2>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: SUCCESS,
                background: '#0d2b1e',
                padding: '3px 8px',
                borderRadius: 4,
              }}
            >
              LIVE
            </span>
          </div>
          <div>
            {TODAY_TRANSITS.map((t, i) => (
              <TransitRow key={i} t={t} />
            ))}
          </div>
        </div>

        {/* Upcoming Predictions */}
        <div
          style={{
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: 24,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT }}>
              Upcoming Matches to Predict
            </h2>
            <a
              href="/predictions"
              style={{
                fontSize: 12,
                color: ACCENT,
                fontWeight: 600,
              }}
            >
              View all →
            </a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {UPCOMING_MATCHES.map((m) => (
              <div
                key={m.id}
                style={{
                  background: '#111827',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ color: TEXT, fontWeight: 600, fontSize: 13, marginBottom: 3 }}>
                    {m.homeTeam}
                    <span style={{ color: MUTED, fontWeight: 400 }}> vs </span>
                    {m.awayTeam}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        background: sportColors[m.sport] ?? MUTED,
                        color: '#fff',
                        padding: '1px 6px',
                        borderRadius: 3,
                      }}
                    >
                      {m.sport}
                    </span>
                    <span style={{ color: MUTED, fontSize: 12 }}>{m.date}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color:
                        m.predictability === 'High'
                          ? SUCCESS
                          : m.predictability === 'Medium'
                          ? WARNING
                          : DANGER,
                    }}
                  >
                    {m.predictability}
                  </div>
                  <div style={{ color: MUTED, fontSize: 10 }}>Predictability</div>
                </div>
              </div>
            ))}
          </div>
          <button
            style={{
              marginTop: 16,
              width: '100%',
              padding: '10px 0',
              borderRadius: 8,
              border: `1px solid ${ACCENT}`,
              background: 'transparent',
              color: ACCENT,
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            + New Prediction
          </button>
        </div>
      </div>

      {/* Recent Results */}
      <div
        style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT }}>Recent Results</h2>
          <a href="/predictions" style={{ fontSize: 12, color: ACCENT, fontWeight: 600 }}>
            Full history →
          </a>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Date', 'Matchup', 'Sport', 'Prediction', 'Confidence', 'Result'].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '7px 12px',
                      borderBottom: `1px solid ${BORDER}`,
                      color: MUTED,
                      fontWeight: 600,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.07em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RECENT_RESULTS.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td style={{ padding: '10px 12px', color: MUTED, whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td style={{ padding: '10px 12px', color: TEXT }}>
                    <span style={{ fontWeight: 600 }}>{r.homeTeam}</span>
                    <span style={{ color: MUTED }}> vs </span>
                    {r.awayTeam}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      style={{
                        padding: '2px 7px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        background: sportColors[r.sport] ?? MUTED,
                        color: '#fff',
                      }}
                    >
                      {r.sport}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: ACCENT }}>{r.prediction}</td>
                  <td style={{ padding: '10px 12px', color: WARNING, fontFamily: 'monospace' }}>
                    {r.confidence}%
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {r.correct ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color: SUCCESS,
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        ✓ Correct
                      </span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color: DANGER,
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        ✗ Incorrect
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
