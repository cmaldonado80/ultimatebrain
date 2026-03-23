'use client';

import { useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────
interface PlanetPosition {
  planet: string;
  sign: string;
  degree: string;
  house: number;
}

interface Aspect {
  planets: string;
  aspect: string;
  orb: string;
  nature: 'harmonious' | 'challenging' | 'neutral';
}

interface FavorablePeriod {
  startDate: string;
  endDate: string;
  transit: string;
  description: string;
}

interface TeamData {
  id: number;
  teamName: string;
  sport: string;
  foundingDate: string;
  foundingPlace: string;
  chartComputed: boolean;
  ascendant: string;
  sunSign: string;
  moonSign: string;
  dominantElement: string;
  planetaryPositions: PlanetPosition[];
  strongestAspects: Aspect[];
  favorablePeriods: FavorablePeriod[];
}

// ── Mock Data ─────────────────────────────────────────────────────────────────
const MOCK_TEAMS: TeamData[] = [
  {
    id: 1,
    teamName: 'New York Yankees',
    sport: 'MLB',
    foundingDate: 'March 12, 1903',
    foundingPlace: 'New York, NY, USA',
    chartComputed: true,
    ascendant: 'Capricorn',
    sunSign: 'Pisces',
    moonSign: 'Scorpio',
    dominantElement: 'Water',
    planetaryPositions: [
      { planet: 'Sun', sign: 'Pisces', degree: '21°14\'', house: 2 },
      { planet: 'Moon', sign: 'Scorpio', degree: '08°47\'', house: 10 },
      { planet: 'Mercury', sign: 'Pisces', degree: '05°32\'', house: 2 },
      { planet: 'Venus', sign: 'Aries', degree: '14°59\'', house: 3 },
      { planet: 'Mars', sign: 'Capricorn', degree: '29°01\'', house: 1 },
      { planet: 'Jupiter', sign: 'Pisces', degree: '03°22\'', house: 2 },
      { planet: 'Saturn', sign: 'Aquarius', degree: '17°44\'', house: 1 },
    ],
    strongestAspects: [
      { planets: 'Sun–Jupiter', aspect: 'Conjunction', orb: '0°08\'', nature: 'harmonious' },
      { planets: 'Moon–Mars', aspect: 'Sextile', orb: '0°14\'', nature: 'harmonious' },
      { planets: 'Mars–Saturn', aspect: 'Square', orb: '1°17\'', nature: 'challenging' },
    ],
    favorablePeriods: [
      { startDate: 'Apr 1, 2026', endDate: 'Apr 22, 2026', transit: 'Jupiter trine natal Sun', description: 'Exceptional performance window; luck favors bold plays.' },
      { startDate: 'May 5, 2026', endDate: 'May 18, 2026', transit: 'Venus conjunct natal Mars', description: 'Team cohesion peaks; home-field advantage amplified.' },
    ],
  },
  {
    id: 2,
    teamName: 'Los Angeles Lakers',
    sport: 'NBA',
    foundingDate: 'January 1, 1947',
    foundingPlace: 'Minneapolis, MN, USA',
    chartComputed: true,
    ascendant: 'Libra',
    sunSign: 'Capricorn',
    moonSign: 'Gemini',
    dominantElement: 'Air',
    planetaryPositions: [
      { planet: 'Sun', sign: 'Capricorn', degree: '10°00\'', house: 4 },
      { planet: 'Moon', sign: 'Gemini', degree: '22°33\'', house: 9 },
      { planet: 'Mercury', sign: 'Capricorn', degree: '28°15\'', house: 4 },
      { planet: 'Venus', sign: 'Aquarius', degree: '07°49\'', house: 5 },
      { planet: 'Mars', sign: 'Scorpio', degree: '16°02\'', house: 2 },
      { planet: 'Jupiter', sign: 'Scorpio', degree: '24°11\'', house: 2 },
      { planet: 'Saturn', sign: 'Leo', degree: '08°37\'', house: 11 },
    ],
    strongestAspects: [
      { planets: 'Mars–Jupiter', aspect: 'Conjunction', orb: '0°51\'', nature: 'harmonious' },
      { planets: 'Sun–Saturn', aspect: 'Trine', orb: '1°23\'', nature: 'harmonious' },
      { planets: 'Moon–Mercury', aspect: 'Opposition', orb: '0°42\'', nature: 'challenging' },
    ],
    favorablePeriods: [
      { startDate: 'Mar 28, 2026', endDate: 'Apr 10, 2026', transit: 'Mars trine natal Mars', description: 'Competitive drive at peak; ideal playoff push timing.' },
      { startDate: 'May 20, 2026', endDate: 'Jun 4, 2026', transit: 'Jupiter conjunct natal Venus', description: 'Momentum and public favor strongly support the team.' },
    ],
  },
  {
    id: 3,
    teamName: 'Manchester United',
    sport: 'Soccer',
    foundingDate: 'March 5, 1878',
    foundingPlace: 'Newton Heath, Manchester, England',
    chartComputed: true,
    ascendant: 'Sagittarius',
    sunSign: 'Pisces',
    moonSign: 'Virgo',
    dominantElement: 'Mutable',
    planetaryPositions: [
      { planet: 'Sun', sign: 'Pisces', degree: '14°28\'', house: 3 },
      { planet: 'Moon', sign: 'Virgo', degree: '01°55\'', house: 9 },
      { planet: 'Mercury', sign: 'Aquarius', degree: '27°19\'', house: 2 },
      { planet: 'Venus', sign: 'Aries', degree: '09°44\'', house: 4 },
      { planet: 'Mars', sign: 'Taurus', degree: '03°31\'', house: 5 },
      { planet: 'Jupiter', sign: 'Aquarius', degree: '11°08\'', house: 2 },
      { planet: 'Saturn', sign: 'Aries', degree: '22°16\'', house: 4 },
    ],
    strongestAspects: [
      { planets: 'Sun–Moon', aspect: 'Opposition', orb: '0°33\'', nature: 'challenging' },
      { planets: 'Jupiter–Mercury', aspect: 'Conjunction', orb: '1°09\'', nature: 'harmonious' },
      { planets: 'Venus–Mars', aspect: 'Sextile', orb: '0°47\'', nature: 'harmonious' },
    ],
    favorablePeriods: [
      { startDate: 'Apr 15, 2026', endDate: 'May 1, 2026', transit: 'Saturn sextile natal Sun', description: 'Disciplined team structure rewards consistent effort.' },
      { startDate: 'Jun 10, 2026', endDate: 'Jun 30, 2026', transit: 'Jupiter trine natal Jupiter', description: 'Expansive confidence; strong showing in finals.' },
    ],
  },
  {
    id: 4,
    teamName: 'Dallas Cowboys',
    sport: 'NFL',
    foundingDate: 'January 28, 1960',
    foundingPlace: 'Dallas, TX, USA',
    chartComputed: true,
    ascendant: 'Aries',
    sunSign: 'Aquarius',
    moonSign: 'Capricorn',
    dominantElement: 'Earth',
    planetaryPositions: [
      { planet: 'Sun', sign: 'Aquarius', degree: '07°52\'', house: 10 },
      { planet: 'Moon', sign: 'Capricorn', degree: '19°04\'', house: 9 },
      { planet: 'Mercury', sign: 'Aquarius', degree: '24°37\'', house: 11 },
      { planet: 'Venus', sign: 'Pisces', degree: '13°21\'', house: 12 },
      { planet: 'Mars', sign: 'Sagittarius', degree: '05°48\'', house: 8 },
      { planet: 'Jupiter', sign: 'Sagittarius', degree: '28°59\'', house: 8 },
      { planet: 'Saturn', sign: 'Capricorn', degree: '14°11\'', house: 9 },
    ],
    strongestAspects: [
      { planets: 'Sun–Mercury', aspect: 'Conjunction', orb: '0°45\'', nature: 'harmonious' },
      { planets: 'Mars–Jupiter', aspect: 'Conjunction', orb: '0°29\'', nature: 'harmonious' },
      { planets: 'Venus–Saturn', aspect: 'Square', orb: '0°50\'', nature: 'challenging' },
    ],
    favorablePeriods: [
      { startDate: 'Sep 5, 2026', endDate: 'Sep 20, 2026', transit: 'Jupiter conjunct natal Sun', description: 'Season opener energy peaks; dominant start predicted.' },
      { startDate: 'Nov 1, 2026', endDate: 'Nov 15, 2026', transit: 'Mars trine natal Saturn', description: 'Strategic discipline pays dividends during critical games.' },
    ],
  },
  {
    id: 5,
    teamName: 'Montreal Canadiens',
    sport: 'NHL',
    foundingDate: 'December 4, 1909',
    foundingPlace: 'Montreal, QC, Canada',
    chartComputed: true,
    ascendant: 'Scorpio',
    sunSign: 'Sagittarius',
    moonSign: 'Pisces',
    dominantElement: 'Water',
    planetaryPositions: [
      { planet: 'Sun', sign: 'Sagittarius', degree: '11°48\'', house: 2 },
      { planet: 'Moon', sign: 'Pisces', degree: '27°14\'', house: 4 },
      { planet: 'Mercury', sign: 'Sagittarius', degree: '29°02\'', house: 2 },
      { planet: 'Venus', sign: 'Capricorn', degree: '06°33\'', house: 3 },
      { planet: 'Mars', sign: 'Pisces', degree: '18°55\'', house: 4 },
      { planet: 'Jupiter', sign: 'Virgo', degree: '14°07\'', house: 11 },
      { planet: 'Saturn', sign: 'Aries', degree: '07°29\'', house: 5 },
    ],
    strongestAspects: [
      { planets: 'Moon–Mars', aspect: 'Conjunction', orb: '0°19\'', nature: 'harmonious' },
      { planets: 'Sun–Jupiter', aspect: 'Opposition', orb: '0°19\'', nature: 'neutral' },
      { planets: 'Mercury–Saturn', aspect: 'Square', orb: '1°27\'', nature: 'challenging' },
    ],
    favorablePeriods: [
      { startDate: 'Mar 10, 2026', endDate: 'Mar 28, 2026', transit: 'Neptune trine natal Moon', description: 'Intuitive, fluid play style reaches peak effectiveness.' },
      { startDate: 'Apr 20, 2026', endDate: 'May 5, 2026', transit: 'Jupiter sextile natal Mars', description: 'Physical stamina and drive amplified for playoff run.' },
    ],
  },
  {
    id: 6,
    teamName: 'Boston Celtics',
    sport: 'NBA',
    foundingDate: 'June 6, 1946',
    foundingPlace: 'Boston, MA, USA',
    chartComputed: false,
    ascendant: '—',
    sunSign: 'Gemini',
    moonSign: '—',
    dominantElement: '—',
    planetaryPositions: [],
    strongestAspects: [],
    favorablePeriods: [],
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
const WARNING = '#fbbf24';

const sportColors: Record<string, string> = {
  MLB: '#ef4444',
  NBA: '#f97316',
  NFL: '#22c55e',
  NHL: '#3b82f6',
  Soccer: '#a855f7',
  Other: MUTED,
};

// ── Sub-components ────────────────────────────────────────────────────────────
function SportBadge({ sport }: { sport: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.05em',
        background: sportColors[sport] ?? MUTED,
        color: '#fff',
      }}
    >
      {sport}
    </span>
  );
}

function PlanetTable({ positions }: { positions: PlanetPosition[] }) {
  if (positions.length === 0) return null;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          {['Planet', 'Sign', 'Degree', 'House'].map((h) => (
            <th
              key={h}
              style={{
                textAlign: 'left',
                padding: '6px 8px',
                borderBottom: `1px solid ${BORDER}`,
                color: MUTED,
                fontWeight: 600,
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {positions.map((p) => (
          <tr key={p.planet} style={{ borderBottom: `1px solid ${BORDER}` }}>
            <td style={{ padding: '6px 8px', color: ACCENT, fontWeight: 600 }}>{p.planet}</td>
            <td style={{ padding: '6px 8px', color: TEXT }}>{p.sign}</td>
            <td style={{ padding: '6px 8px', color: MUTED, fontFamily: 'monospace' }}>{p.degree}</td>
            <td style={{ padding: '6px 8px', color: MUTED }}>House {p.house}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AspectList({ aspects }: { aspects: Aspect[] }) {
  if (aspects.length === 0) return null;
  const natureColor = (n: Aspect['nature']) =>
    n === 'harmonious' ? SUCCESS : n === 'challenging' ? '#ef4444' : MUTED;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {aspects.map((a, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderRadius: 6,
            background: '#111827',
            border: `1px solid ${BORDER}`,
          }}
        >
          <span style={{ color: TEXT, fontWeight: 600, fontSize: 13 }}>{a.planets}</span>
          <span style={{ color: ACCENT, fontSize: 12 }}>{a.aspect}</span>
          <span style={{ color: MUTED, fontSize: 12, fontFamily: 'monospace' }}>orb {a.orb}</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: natureColor(a.nature),
              textTransform: 'capitalize',
            }}
          >
            {a.nature}
          </span>
        </div>
      ))}
    </div>
  );
}

function FavorablePeriods({ periods }: { periods: FavorablePeriod[] }) {
  if (periods.length === 0)
    return <p style={{ color: MUTED, fontSize: 13 }}>Chart not yet computed.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {periods.map((p, i) => (
        <div
          key={i}
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: '#0d2b1e',
            border: `1px solid ${SUCCESS}40`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: SUCCESS, fontWeight: 700, fontSize: 13 }}>
              {p.startDate} — {p.endDate}
            </span>
            <span style={{ color: ACCENT, fontSize: 12 }}>{p.transit}</span>
          </div>
          <p style={{ color: TEXT, fontSize: 13, margin: 0 }}>{p.description}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TeamsPage() {
  const [selectedTeam, setSelectedTeam] = useState<TeamData | null>(null);

  const ELEMENT_GLYPHS: Record<string, string> = {
    Fire: '🔥',
    Earth: '🌍',
    Air: '💨',
    Water: '💧',
    Mutable: '♾',
  };

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, padding: '32px 24px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 32,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: TEXT }}>Team Profiles</h1>
          <p style={{ margin: '4px 0 0', color: MUTED, fontSize: 14 }}>
            Natal charts and astrological profiles for tracked teams
          </p>
        </div>
        <button
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            background: ACCENT,
            color: '#fff',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          + Add Team
        </button>
      </div>

      {/* Team Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
          marginBottom: selectedTeam ? 32 : 0,
        }}
      >
        {MOCK_TEAMS.map((team) => (
          <div
            key={team.id}
            onClick={() => setSelectedTeam(selectedTeam?.id === team.id ? null : team)}
            style={{
              background: selectedTeam?.id === team.id ? '#2d3748' : CARD,
              border: `1px solid ${selectedTeam?.id === team.id ? ACCENT : BORDER}`,
              borderRadius: 10,
              padding: '16px 18px',
              cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <SportBadge sport={team.sport} />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: team.chartComputed ? SUCCESS : WARNING,
                  background: team.chartComputed ? '#0d2b1e' : '#2d1b00',
                  padding: '2px 8px',
                  borderRadius: 4,
                }}
              >
                {team.chartComputed ? 'Chart Ready' : 'Pending'}
              </span>
            </div>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: TEXT }}>
              {team.teamName}
            </h3>
            <p style={{ margin: '0 0 2px', fontSize: 12, color: MUTED }}>
              Founded: {team.foundingDate}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: MUTED }}>{team.foundingPlace}</p>
            {team.chartComputed && (
              <div
                style={{
                  marginTop: 10,
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 11, color: ACCENT }}>☉ {team.sunSign}</span>
                <span style={{ fontSize: 11, color: MUTED }}>·</span>
                <span style={{ fontSize: 11, color: ACCENT }}>ASC {team.ascendant}</span>
                <span style={{ fontSize: 11, color: MUTED }}>·</span>
                <span style={{ fontSize: 11, color: ACCENT }}>
                  {ELEMENT_GLYPHS[team.dominantElement] ?? ''} {team.dominantElement}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Team Detail View */}
      {selectedTeam && selectedTeam.chartComputed && (
        <div
          style={{
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: 28,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 24,
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: TEXT }}>
                {selectedTeam.teamName}
              </h2>
              <p style={{ margin: '4px 0 0', color: MUTED, fontSize: 13 }}>
                Natal Chart · Founded {selectedTeam.foundingDate}
              </p>
            </div>
            <SportBadge sport={selectedTeam.sport} />
          </div>

          {/* Natal Summary */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 12,
              marginBottom: 28,
            }}
          >
            {[
              { label: 'Ascendant', value: selectedTeam.ascendant },
              { label: 'Sun Sign', value: selectedTeam.sunSign },
              { label: 'Moon Sign', value: selectedTeam.moonSign },
              { label: 'Dominant Element', value: selectedTeam.dominantElement },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  background: '#111827',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: '12px 14px',
                }}
              >
                <div style={{ color: MUTED, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                  {item.label}
                </div>
                <div style={{ color: ACCENT, fontSize: 15, fontWeight: 700 }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Planetary Positions */}
          <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
            Key Planetary Positions
          </h3>
          <div style={{ marginBottom: 28 }}>
            <PlanetTable positions={selectedTeam.planetaryPositions} />
          </div>

          {/* Strongest Aspects */}
          <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
            Strongest Natal Aspects
          </h3>
          <div style={{ marginBottom: 28 }}>
            <AspectList aspects={selectedTeam.strongestAspects} />
          </div>

          {/* Favorable Periods */}
          <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
            Favorable Periods — Upcoming Transits
          </h3>
          <FavorablePeriods periods={selectedTeam.favorablePeriods} />
        </div>
      )}

      {selectedTeam && !selectedTeam.chartComputed && (
        <div
          style={{
            background: CARD,
            border: `1px dashed ${BORDER}`,
            borderRadius: 12,
            padding: 40,
            textAlign: 'center',
          }}
        >
          <p style={{ color: MUTED, fontSize: 15, margin: 0 }}>
            Natal chart for <strong style={{ color: TEXT }}>{selectedTeam.teamName}</strong> is
            pending computation. Add founding time and location details to generate the full chart.
          </p>
          <button
            style={{
              marginTop: 16,
              padding: '10px 24px',
              borderRadius: 8,
              border: `1px solid ${ACCENT}`,
              background: 'transparent',
              color: ACCENT,
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Complete Team Profile
          </button>
        </div>
      )}
    </div>
  );
}
