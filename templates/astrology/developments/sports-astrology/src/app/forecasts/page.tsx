'use client';

import { useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────
type DateType = 'favorable' | 'challenging' | 'neutral';

interface KeyDate {
  date: string;
  type: DateType;
  transit: string;
  description: string;
}

interface MonthBreakdown {
  month: string;
  outlook: 'excellent' | 'good' | 'mixed' | 'difficult';
  transitHighlights: string[];
  hotStreak: string | null;
  coldSpell: string | null;
  summary: string;
}

interface SeasonForecast {
  teamId: number;
  teamName: string;
  sport: string;
  season: string;
  overallOutlook: string;
  strongestMonths: string[];
  weakestMonths: string[];
  keyDates: KeyDate[];
  monthlyBreakdown: MonthBreakdown[];
}

// ── Mock Data ─────────────────────────────────────────────────────────────────
const FORECASTS: SeasonForecast[] = [
  {
    teamId: 1,
    teamName: 'New York Yankees',
    sport: 'MLB',
    season: '2026',
    overallOutlook:
      'A powerhouse season with Jupiter transiting the natal 2nd house through August, amplifying resources and momentum. Two Saturn-driven discipline windows in May and September will be particularly productive. The team faces its greatest challenge in late July when Mars opposes natal Saturn, creating friction and potential injury risk.',
    strongestMonths: ['April', 'June', 'September'],
    weakestMonths: ['July', 'August'],
    keyDates: [
      { date: 'Apr 3, 2026', type: 'favorable', transit: 'Jupiter trine natal Sun', description: 'Season-opening energy surge; dominant early performance expected.' },
      { date: 'Apr 18, 2026', type: 'favorable', transit: 'Venus conjunct natal Jupiter', description: 'Public favor and morale at their peak for the month.' },
      { date: 'May 11, 2026', type: 'challenging', transit: 'Saturn square natal Mars', description: 'Physical strain; risk of key player fatigue or minor injuries.' },
      { date: 'Jun 7, 2026', type: 'favorable', transit: 'Mars trine natal Venus', description: 'Team chemistry peaks; clutch performances likely.' },
      { date: 'Jun 22, 2026', type: 'favorable', transit: 'Sun conjunct natal Midheaven', description: 'Public visibility and reputation at seasonal high.' },
      { date: 'Jul 14, 2026', type: 'challenging', transit: 'Mars opposite natal Saturn', description: 'Potential losing streak; internal conflicts may surface.' },
      { date: 'Jul 28, 2026', type: 'challenging', transit: 'Neptune square natal Sun', description: 'Inconsistency and lack of focus; avoid major roster decisions.' },
      { date: 'Aug 5, 2026', type: 'neutral', transit: 'Mercury trine natal Moon', description: 'Tactical communication improves; coaching adjustments land well.' },
      { date: 'Sep 3, 2026', type: 'favorable', transit: 'Saturn sextile natal Sun', description: 'Discipline and structure pay off; prime playoff push window.' },
      { date: 'Sep 20, 2026', type: 'favorable', transit: 'Jupiter sextile natal Mars', description: 'Physical stamina and competitive drive reinvigorated.' },
    ],
    monthlyBreakdown: [
      { month: 'March', outlook: 'good', transitHighlights: ['Mercury direct in Pisces', 'Venus trine natal Moon'], hotStreak: 'Mar 15–22', coldSpell: null, summary: 'Solid start; early-season cohesion builds. Communication flows well and early wins establish confidence.' },
      { month: 'April', outlook: 'excellent', transitHighlights: ['Jupiter trine natal Sun', 'Venus conjunct natal Jupiter', 'Mars enters Aries'], hotStreak: 'Apr 3–22', coldSpell: null, summary: 'Peak performance window. Jupiter energy amplifies confidence and results. Best month of the first half.' },
      { month: 'May', outlook: 'mixed', transitHighlights: ['Saturn square natal Mars', 'Sun trine natal Saturn'], hotStreak: 'May 1–8', coldSpell: 'May 11–18', summary: 'Starts strong but mid-month Saturn friction creates challenges. Manage player workloads carefully.' },
      { month: 'June', outlook: 'excellent', transitHighlights: ['Mars trine natal Venus', 'Sun conjunct natal Midheaven', 'Jupiter sextile natal Moon'], hotStreak: 'Jun 5–25', coldSpell: null, summary: 'Second peak period. Team chemistry and public momentum align perfectly. Critical win streak window.' },
      { month: 'July', outlook: 'difficult', transitHighlights: ['Mars opposite natal Saturn', 'Neptune square natal Sun', 'Chiron conjunct natal Mars'], hotStreak: null, coldSpell: 'Jul 12–28', summary: 'Most challenging stretch of the season. Minimize risk exposure; conserve key players for September.' },
      { month: 'August', outlook: 'mixed', transitHighlights: ['Mercury trine natal Moon', 'Venus sextile natal Mercury', 'Saturn direct'], hotStreak: 'Aug 18–28', coldSpell: 'Aug 1–10', summary: 'Gradual recovery. Second half improves as Saturn direct brings clarity. End of month sets up playoff push.' },
      { month: 'September', outlook: 'excellent', transitHighlights: ['Saturn sextile natal Sun', 'Jupiter sextile natal Mars', 'Venus trine natal Sun'], hotStreak: 'Sep 3–25', coldSpell: null, summary: 'Finest stretch of the season. Discipline and drive combine for dominant playoff positioning. Championship energy.' },
    ],
  },
  {
    teamId: 2,
    teamName: 'Los Angeles Lakers',
    sport: 'NBA',
    season: '2025-26',
    overallOutlook:
      'A transformative season with Pluto transiting the natal Ascendant, signaling a team identity shift and regeneration. Uranus trines natal Mars in December through February, producing unexpected surges. The eclipse on the natal 4th/10th axis in November brings a pivotal turning point, potentially a coaching change or major trade.',
    strongestMonths: ['December', 'February', 'April'],
    weakestMonths: ['November', 'January'],
    keyDates: [
      { date: 'Nov 5, 2025', type: 'challenging', transit: 'Eclipse opposite natal Sun', description: 'Pivotal disruption; roster or management shifts expected.' },
      { date: 'Nov 19, 2025', type: 'challenging', transit: 'Mars square natal Saturn', description: 'Internal tension peaks; chemistry issues on the court.' },
      { date: 'Dec 8, 2025', type: 'favorable', transit: 'Jupiter trine natal Mars', description: 'Physical energy and competitive spirit rebound strongly.' },
      { date: 'Dec 22, 2025', type: 'favorable', transit: 'Venus conjunct natal Sun', description: 'Fan energy and home court advantage amplified.' },
      { date: 'Jan 14, 2026', type: 'challenging', transit: 'Saturn conjunct natal Moon', description: 'Emotional fatigue; star player may struggle with consistency.' },
      { date: 'Feb 3, 2026', type: 'favorable', transit: 'Uranus trine natal Mars', description: 'Breakthrough performances; unexpected winning runs.' },
      { date: 'Feb 21, 2026', type: 'favorable', transit: 'Jupiter sextile natal Venus', description: 'Team morale and public support surge; potential trade boost.' },
      { date: 'Mar 10, 2026', type: 'neutral', transit: 'Mercury conjunct natal Jupiter', description: 'Strategic clarity; coaching decisions prove insightful.' },
      { date: 'Apr 5, 2026', type: 'favorable', transit: 'Mars conjunct natal Sun', description: 'Peak playoff energy; maximum competitive drive activated.' },
      { date: 'Apr 20, 2026', type: 'favorable', transit: 'Jupiter trine natal Ascendant', description: 'Confidence and identity at their strongest; prime title window.' },
    ],
    monthlyBreakdown: [
      { month: 'October', outlook: 'good', transitHighlights: ['Venus trine natal Mars', 'Mercury sextile natal Sun'], hotStreak: 'Oct 10–20', coldSpell: null, summary: 'Energetic season opener. Early chemistry shows promise with favorable Venus aspects supporting team cohesion.' },
      { month: 'November', outlook: 'difficult', transitHighlights: ['Eclipse opposite natal Sun', 'Mars square natal Saturn', 'Saturn square natal Venus'], hotStreak: null, coldSpell: 'Nov 5–22', summary: 'Eclipse energy creates disruption. Roster or leadership instability. Survival mode; minimize damage.' },
      { month: 'December', outlook: 'excellent', transitHighlights: ['Jupiter trine natal Mars', 'Venus conjunct natal Sun', 'Uranus sextile natal Moon'], hotStreak: 'Dec 5–26', coldSpell: null, summary: 'Powerful rebound. Jupiter and Venus transits inject momentum and public support. Best month of the season.' },
      { month: 'January', outlook: 'mixed', transitHighlights: ['Saturn conjunct natal Moon', 'Sun opposite natal Mars'], hotStreak: 'Jan 1–8', coldSpell: 'Jan 14–24', summary: 'Post-holiday fatigue amplified by Saturn pressure. Physical recovery important; manage star player minutes.' },
      { month: 'February', outlook: 'excellent', transitHighlights: ['Uranus trine natal Mars', 'Jupiter sextile natal Venus', 'Mars direct'], hotStreak: 'Feb 3–24', coldSpell: null, summary: 'Uranus breakthrough energy delivers unexpected winning streaks. Trade deadline boost possible. Momentum builder.' },
      { month: 'March', outlook: 'good', transitHighlights: ['Mercury conjunct natal Jupiter', 'Venus sextile natal Saturn'], hotStreak: 'Mar 5–15', coldSpell: 'Mar 20–27', summary: 'Steady improvement. Tactical intelligence sharpens. Minor dip at month-end but overall positive playoff trajectory.' },
      { month: 'April', outlook: 'excellent', transitHighlights: ['Mars conjunct natal Sun', 'Jupiter trine natal Ascendant', 'Venus conjunct natal Mars'], hotStreak: 'Apr 5–25', coldSpell: null, summary: 'Championship energy peaks. Mars and Jupiter in powerful positions. Ideal playoff timing; deep run expected.' },
    ],
  },
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

const outlookConfig = {
  excellent: { label: 'Excellent', color: SUCCESS, bg: '#0d2b1e' },
  good: { label: 'Good', color: '#86efac', bg: '#0f1f14' },
  mixed: { label: 'Mixed', color: WARNING, bg: '#2d1b00' },
  difficult: { label: 'Difficult', color: DANGER, bg: '#2d0f0f' },
};

const dateTypeConfig: Record<DateType, { color: string; bg: string; label: string }> = {
  favorable: { color: SUCCESS, bg: '#0d2b1e', label: 'Favorable' },
  challenging: { color: DANGER, bg: '#2d0f0f', label: 'Challenging' },
  neutral: { color: MUTED, bg: '#1a1f2e', label: 'Neutral' },
};

function KeyDateItem({ kd }: { kd: KeyDate }) {
  const cfg = dateTypeConfig[kd.type];
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        padding: '10px 14px',
        borderRadius: 8,
        background: cfg.bg,
        border: `1px solid ${cfg.color}30`,
        marginBottom: 8,
      }}
    >
      <div
        style={{
          minWidth: 90,
          color: cfg.color,
          fontSize: 12,
          fontWeight: 700,
          paddingTop: 2,
        }}
      >
        {kd.date}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ color: ACCENT, fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
          {kd.transit}
        </div>
        <div style={{ color: TEXT, fontSize: 12 }}>{kd.description}</div>
      </div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: cfg.color,
          background: `${cfg.color}20`,
          padding: '2px 8px',
          borderRadius: 4,
          whiteSpace: 'nowrap',
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
        }}
      >
        {cfg.label}
      </span>
    </div>
  );
}

function MonthCard({ month }: { month: MonthBreakdown }) {
  const cfg = outlookConfig[month.outlook];
  return (
    <div
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        padding: 18,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>{month.month}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: cfg.color,
            background: `${cfg.color}20`,
            padding: '2px 8px',
            borderRadius: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}
        >
          {cfg.label}
        </span>
      </div>
      <p style={{ color: TEXT, fontSize: 12, margin: '0 0 10px' }}>{month.summary}</p>
      {month.hotStreak && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 4,
          }}
        >
          <span style={{ color: SUCCESS, fontSize: 11, fontWeight: 700 }}>HOT STREAK</span>
          <span style={{ color: SUCCESS, fontSize: 12 }}>{month.hotStreak}</span>
        </div>
      )}
      {month.coldSpell && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ color: DANGER, fontSize: 11, fontWeight: 700 }}>COLD SPELL</span>
          <span style={{ color: DANGER, fontSize: 12 }}>{month.coldSpell}</span>
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        {month.transitHighlights.map((t, i) => (
          <div key={i} style={{ color: MUTED, fontSize: 11, marginBottom: 2 }}>
            · {t}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ForecastsPage() {
  const [selectedTeamId, setSelectedTeamId] = useState<number>(1);
  const forecast = FORECASTS.find((f) => f.teamId === selectedTeamId) ?? FORECASTS[0];

  const favorable = forecast.keyDates.filter((d) => d.type === 'favorable').length;
  const challenging = forecast.keyDates.filter((d) => d.type === 'challenging').length;

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: TEXT }}>Season Forecasts</h1>
          <p style={{ margin: '4px 0 0', color: MUTED, fontSize: 14 }}>
            Full-season astrological transit forecasts and key date timelines
          </p>
        </div>
        <select
          value={selectedTeamId}
          onChange={(e) => setSelectedTeamId(Number(e.target.value))}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            border: `1px solid ${BORDER}`,
            background: CARD,
            color: TEXT,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          {FORECASTS.map((f) => (
            <option key={f.teamId} value={f.teamId}>
              {f.teamName} — {f.season}
            </option>
          ))}
        </select>
      </div>

      {/* Season Summary Card */}
      <div
        style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: 28,
          marginBottom: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT }}>{forecast.teamName}</h2>
          <span
            style={{
              padding: '3px 10px',
              borderRadius: 6,
              background: `${ACCENT}20`,
              color: ACCENT,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {forecast.sport} · {forecast.season}
          </span>
        </div>
        <p style={{ color: TEXT, fontSize: 14, lineHeight: 1.7, margin: '0 0 20px' }}>
          {forecast.overallOutlook}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          <div style={{ background: '#111827', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ color: MUTED, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Strongest Months</div>
            {forecast.strongestMonths.map((m) => (
              <div key={m} style={{ color: SUCCESS, fontSize: 13, fontWeight: 600 }}>{m}</div>
            ))}
          </div>
          <div style={{ background: '#111827', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ color: MUTED, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Weakest Months</div>
            {forecast.weakestMonths.map((m) => (
              <div key={m} style={{ color: DANGER, fontSize: 13, fontWeight: 600 }}>{m}</div>
            ))}
          </div>
          <div style={{ background: '#111827', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ color: MUTED, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Key Dates</div>
            <div style={{ color: SUCCESS, fontSize: 13 }}>{favorable} favorable</div>
            <div style={{ color: DANGER, fontSize: 13 }}>{challenging} challenging</div>
          </div>
        </div>
      </div>

      {/* Key Dates Timeline */}
      <div
        style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: 24,
          marginBottom: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: TEXT }}>Key Dates Timeline</h2>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['favorable', 'challenging', 'neutral'] as DateType[]).map((type) => {
              const cfg = dateTypeConfig[type];
              return (
                <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: cfg.color }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: cfg.color,
                    }}
                  />
                  {cfg.label}
                </span>
              );
            })}
          </div>
        </div>
        <div>
          {forecast.keyDates.map((kd, i) => (
            <KeyDateItem key={i} kd={kd} />
          ))}
        </div>
      </div>

      {/* Monthly Breakdown */}
      <div>
        <h2 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 700, color: TEXT }}>
          Monthly Breakdown
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {forecast.monthlyBreakdown.map((m) => (
            <MonthCard key={m.month} month={m} />
          ))}
        </div>
      </div>
    </div>
  );
}
