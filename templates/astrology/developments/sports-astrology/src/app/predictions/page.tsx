'use client';

import { useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────
interface TransitInfluence {
  transit: string;
  type: 'favorable' | 'unfavorable' | 'neutral';
  description: string;
}

interface PredictionRecord {
  id: number;
  date: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  prediction: string;
  confidence: number;
  outcome: string | null;
  correct: boolean | null;
}

// ── Mock Data ─────────────────────────────────────────────────────────────────
const TEAMS = [
  'New York Yankees',
  'Los Angeles Dodgers',
  'Los Angeles Lakers',
  'Boston Celtics',
  'Dallas Cowboys',
  'Kansas City Chiefs',
  'Manchester United',
  'Real Madrid',
  'Montreal Canadiens',
  'Toronto Maple Leafs',
];

const PAST_PREDICTIONS: PredictionRecord[] = [
  { id: 1, date: 'Mar 10, 2026', homeTeam: 'NY Yankees', awayTeam: 'LA Dodgers', sport: 'MLB', prediction: 'NY Yankees', confidence: 72, outcome: 'NY Yankees', correct: true },
  { id: 2, date: 'Mar 8, 2026', homeTeam: 'LA Lakers', awayTeam: 'Boston Celtics', sport: 'NBA', prediction: 'Boston Celtics', confidence: 65, outcome: 'LA Lakers', correct: false },
  { id: 3, date: 'Mar 5, 2026', homeTeam: 'Dallas Cowboys', awayTeam: 'Kansas City Chiefs', sport: 'NFL', prediction: 'Kansas City Chiefs', confidence: 68, outcome: 'Kansas City Chiefs', correct: true },
  { id: 4, date: 'Mar 2, 2026', homeTeam: 'Manchester United', awayTeam: 'Real Madrid', sport: 'Soccer', prediction: 'Real Madrid', confidence: 74, outcome: 'Real Madrid', correct: true },
  { id: 5, date: 'Feb 28, 2026', homeTeam: 'Montreal Canadiens', awayTeam: 'Toronto Maple Leafs', sport: 'NHL', prediction: 'Montreal Canadiens', confidence: 58, outcome: 'Toronto Maple Leafs', correct: false },
  { id: 6, date: 'Feb 25, 2026', homeTeam: 'NY Yankees', awayTeam: 'Boston Red Sox', sport: 'MLB', prediction: 'NY Yankees', confidence: 70, outcome: 'NY Yankees', correct: true },
  { id: 7, date: 'Feb 22, 2026', homeTeam: 'LA Lakers', awayTeam: 'Golden State Warriors', sport: 'NBA', prediction: 'LA Lakers', confidence: 63, outcome: 'LA Lakers', correct: true },
  { id: 8, date: 'Feb 19, 2026', homeTeam: 'Real Madrid', awayTeam: 'Barcelona', sport: 'Soccer', prediction: 'Real Madrid', confidence: 69, outcome: 'Barcelona', correct: false },
  { id: 9, date: 'Feb 15, 2026', homeTeam: 'Kansas City Chiefs', awayTeam: 'Dallas Cowboys', sport: 'NFL', prediction: 'Kansas City Chiefs', confidence: 77, outcome: 'Kansas City Chiefs', correct: true },
  { id: 10, date: 'Feb 12, 2026', homeTeam: 'Toronto Maple Leafs', awayTeam: 'Montreal Canadiens', sport: 'NHL', prediction: 'Toronto Maple Leafs', confidence: 61, outcome: 'Toronto Maple Leafs', correct: true },
];

const HOME_TRANSITS: TransitInfluence[] = [
  { transit: 'Jupiter trine natal Sun', type: 'favorable', description: 'Strong fortune and momentum in home environment.' },
  { transit: 'Mars conjunct natal Mars', type: 'favorable', description: 'Peak competitive drive and physical energy.' },
  { transit: 'Saturn square natal Moon', type: 'unfavorable', description: 'Emotional pressure and fatigue may hinder performance.' },
];

const AWAY_TRANSITS: TransitInfluence[] = [
  { transit: 'Venus sextile natal Jupiter', type: 'favorable', description: 'Positive public reception; morale elevated.' },
  { transit: 'Neptune opposite natal Sun', type: 'unfavorable', description: 'Lack of focus; poor decision-making under pressure.' },
  { transit: 'Mercury trine natal Mercury', type: 'neutral', description: 'Clear tactical communication; strategic advantage.' },
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

function TransitCard({ transit }: { transit: TransitInfluence }) {
  const colors = {
    favorable: { bg: '#0d2b1e', border: `${SUCCESS}40`, badge: SUCCESS },
    unfavorable: { bg: '#2d0f0f', border: `${DANGER}40`, badge: DANGER },
    neutral: { bg: '#1a1f2e', border: `${MUTED}40`, badge: MUTED },
  }[transit.type];
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 8,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: colors.badge,
            flexShrink: 0,
          }}
        />
        <span style={{ color: ACCENT, fontSize: 12, fontWeight: 600 }}>{transit.transit}</span>
      </div>
      <p style={{ margin: 0, color: TEXT, fontSize: 12 }}>{transit.description}</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PredictionsPage() {
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [matchDate, setMatchDate] = useState('');
  const [showResult, setShowResult] = useState(false);

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    background: '#111827',
    color: TEXT,
    fontSize: 14,
  };

  const totalPredictions = PAST_PREDICTIONS.length;
  const correctPredictions = PAST_PREDICTIONS.filter((p) => p.correct).length;
  const accuracy = Math.round((correctPredictions / totalPredictions) * 100);

  // Accuracy by sport
  const sports = [...new Set(PAST_PREDICTIONS.map((p) => p.sport))];
  const accuracyBySport = sports.map((sport) => {
    const sportPreds = PAST_PREDICTIONS.filter((p) => p.sport === sport);
    const correct = sportPreds.filter((p) => p.correct).length;
    return { sport, accuracy: Math.round((correct / sportPreds.length) * 100), total: sportPreds.length };
  });

  // Current streak
  let streak = 0;
  for (const p of PAST_PREDICTIONS) {
    if (p.correct === true) streak++;
    else break;
  }

  const handlePredict = () => {
    if (!homeTeam || !awayTeam || !matchDate) return;
    setShowResult(true);
  };

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: TEXT }}>Match Predictions</h1>
        <p style={{ margin: '4px 0 0', color: MUTED, fontSize: 14 }}>
          Astrological transit analysis for upcoming match outcomes
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
        {/* New Prediction Form */}
        <div
          style={{
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: 24,
          }}
        >
          <h2 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 700, color: TEXT }}>
            New Prediction
          </h2>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: MUTED, fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Home Team
            </label>
            <select value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} style={selectStyle}>
              <option value="">Select home team…</option>
              {TEAMS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: MUTED, fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Away Team
            </label>
            <select value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} style={selectStyle}>
              <option value="">Select away team…</option>
              {TEAMS.filter((t) => t !== homeTeam).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', color: MUTED, fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Match Date
            </label>
            <input
              type="date"
              value={matchDate}
              onChange={(e) => setMatchDate(e.target.value)}
              style={{ ...selectStyle, colorScheme: 'dark' }}
            />
          </div>
          <button
            onClick={handlePredict}
            disabled={!homeTeam || !awayTeam || !matchDate}
            style={{
              width: '100%',
              padding: '12px 0',
              borderRadius: 8,
              border: 'none',
              background: homeTeam && awayTeam && matchDate ? ACCENT : BORDER,
              color: homeTeam && awayTeam && matchDate ? '#fff' : MUTED,
              fontWeight: 700,
              fontSize: 14,
              cursor: homeTeam && awayTeam && matchDate ? 'pointer' : 'not-allowed',
            }}
          >
            Generate Prediction
          </button>
        </div>

        {/* Accuracy Stats */}
        <div
          style={{
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: 24,
          }}
        >
          <h2 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 700, color: TEXT }}>
            Accuracy Statistics
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Overall Accuracy', value: `${accuracy}%`, color: SUCCESS },
              { label: 'Win Streak', value: `${streak} correct`, color: WARNING },
              { label: 'Total Predictions', value: totalPredictions, color: ACCENT },
              { label: 'Correct', value: correctPredictions, color: SUCCESS },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  background: '#111827',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: '12px 14px',
                }}
              >
                <div style={{ color: MUTED, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                  {stat.label}
                </div>
                <div style={{ color: stat.color, fontSize: 20, fontWeight: 700 }}>{stat.value}</div>
              </div>
            ))}
          </div>
          <div>
            <div style={{ color: MUTED, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
              Accuracy by Sport
            </div>
            {accuracyBySport.map((s) => (
              <div key={s.sport} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: TEXT, fontSize: 13 }}>{s.sport}</span>
                  <span style={{ color: MUTED, fontSize: 13 }}>{s.accuracy}% ({s.total} games)</span>
                </div>
                <div style={{ height: 4, background: BORDER, borderRadius: 2 }}>
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 2,
                      background: s.accuracy >= 70 ? SUCCESS : s.accuracy >= 50 ? WARNING : DANGER,
                      width: `${s.accuracy}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Prediction Result Card */}
      {showResult && homeTeam && awayTeam && (
        <div
          style={{
            background: CARD,
            border: `1px solid ${ACCENT}`,
            borderRadius: 12,
            padding: 28,
            marginBottom: 32,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                background: `${ACCENT}20`,
                color: ACCENT,
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
              }}
            >
              Prediction Result
            </div>
            <span style={{ color: MUTED, fontSize: 13 }}>{matchDate}</span>
          </div>

          <div
            style={{
              background: '#111827',
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: '20px 24px',
              marginBottom: 24,
              textAlign: 'center',
            }}
          >
            <div style={{ color: MUTED, fontSize: 13, marginBottom: 8 }}>
              {homeTeam} vs {awayTeam}
            </div>
            <div style={{ color: SUCCESS, fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
              {homeTeam} to Win
            </div>
            <div style={{ color: MUTED, fontSize: 14 }}>
              Confidence:{' '}
              <span style={{ color: WARNING, fontWeight: 700 }}>72%</span>
            </div>
          </div>

          {/* Transit Comparison */}
          <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 15, marginBottom: 16 }}>
            Transit Comparison
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div
                style={{
                  color: TEXT,
                  fontWeight: 700,
                  fontSize: 14,
                  marginBottom: 12,
                  paddingBottom: 8,
                  borderBottom: `1px solid ${BORDER}`,
                }}
              >
                {homeTeam} <span style={{ color: SUCCESS, fontSize: 12 }}>(Home)</span>
              </div>
              {HOME_TRANSITS.map((t, i) => (
                <TransitCard key={i} transit={t} />
              ))}
            </div>
            <div>
              <div
                style={{
                  color: TEXT,
                  fontWeight: 700,
                  fontSize: 14,
                  marginBottom: 12,
                  paddingBottom: 8,
                  borderBottom: `1px solid ${BORDER}`,
                }}
              >
                {awayTeam} <span style={{ color: ACCENT, fontSize: 12 }}>(Away)</span>
              </div>
              {AWAY_TRANSITS.map((t, i) => (
                <TransitCard key={i} transit={t} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Prediction History Table */}
      <div
        style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: 24,
        }}
      >
        <h2 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 700, color: TEXT }}>
          Prediction History
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Date', 'Matchup', 'Sport', 'Prediction', 'Confidence', 'Outcome', 'Result'].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
                        padding: '8px 12px',
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
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {PAST_PREDICTIONS.map((p) => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td style={{ padding: '10px 12px', color: MUTED, whiteSpace: 'nowrap' }}>{p.date}</td>
                  <td style={{ padding: '10px 12px', color: TEXT }}>
                    <span style={{ fontWeight: 600 }}>{p.homeTeam}</span>
                    <span style={{ color: MUTED }}> vs </span>
                    {p.awayTeam}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      style={{
                        padding: '2px 7px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        background: sportColors[p.sport] ?? MUTED,
                        color: '#fff',
                      }}
                    >
                      {p.sport}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: ACCENT }}>{p.prediction}</td>
                  <td style={{ padding: '10px 12px', color: WARNING, fontFamily: 'monospace' }}>
                    {p.confidence}%
                  </td>
                  <td style={{ padding: '10px 12px', color: TEXT }}>{p.outcome ?? '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {p.correct === null ? (
                      <span style={{ color: MUTED }}>Pending</span>
                    ) : p.correct ? (
                      <span style={{ color: SUCCESS, fontWeight: 700, fontSize: 16 }}>✓</span>
                    ) : (
                      <span style={{ color: DANGER, fontWeight: 700, fontSize: 16 }}>✗</span>
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
