'use client'

/**
 * Engine Detail — view, test, and explore a brain engine.
 * Swiss Ephemeris shows categorized modules with expandable endpoint lists.
 */

import { useState } from 'react'
import { trpc } from '../../../../../utils/trpc'
import { use } from 'react'

// ─── Module definitions for Swiss Ephemeris ──────────────────────────────────

interface EngineModule {
  name: string
  endpoints: string[]
}

const SWISS_MODULES: EngineModule[] = [
  {
    name: 'Core',
    endpoints: [
      'natalChart',
      'planetaryPositions',
      'currentTransits',
      'houseCusps',
      'aspects',
      'status',
    ],
  },
  { name: 'Lunar', endpoints: ['moonPhase', 'lunarMansion', 'prenatalLunations'] },
  {
    name: 'Dignities & Sect',
    endpoints: ['sectAnalysis', 'accidentalDignities', 'criticalDegrees', 'lillyScore'],
  },
  { name: 'Patterns', endpoints: ['patterns'] },
  {
    name: 'Subdivisions & Harmonics',
    endpoints: ['dwads', 'navamsa', 'decanates', 'ageHarmonic', 'harmonicSpectrum'],
  },
  { name: 'Antiscia & Draconic', endpoints: ['antiscia', 'draconic', 'heliocentric'] },
  { name: 'Classical', endpoints: ['arabicParts', 'planetaryHours', 'solarCondition'] },
  { name: 'Fixed Stars & Symbols', endpoints: ['fixedStars', 'fixedStarAspects', 'sabianSymbol'] },
  { name: 'Midpoints', endpoints: ['midpoints'] },
  { name: 'Dispositors', endpoints: ['dispositors'] },
  { name: 'Declinations', endpoints: ['declinations'] },
  {
    name: 'Progressions & Directions',
    endpoints: ['secondaryProgressions', 'solarArcDirections', 'primaryDirections'],
  },
  { name: 'Returns', endpoints: ['solarReturn', 'lunarReturn', 'nodalReturn'] },
  { name: 'Profections', endpoints: ['profections'] },
  { name: 'Time Lords', endpoints: ['firdaria', 'zodiacalReleasing', 'decennials'] },
  {
    name: 'Rectification',
    endpoints: ['trutineOfHermes', 'animodar', 'almutenFiguris', 'huberAgePoint', 'huberTimeline'],
  },
  { name: 'Transit Calendar', endpoints: ['transitCalendar'] },
  {
    name: 'Vedic',
    endpoints: [
      'panchanga',
      'dasha',
      'vargaCharts',
      'shadbala',
      'ashtakavarga',
      'charaKarakas',
      'muhurta',
    ],
  },
  {
    name: 'Esoteric & Medical',
    endpoints: ['sevenRays', 'medical', 'financialCycles', 'agricultural', 'mundane'],
  },
  { name: 'Financial', endpoints: ['bradley'] },
  { name: 'Composite', endpoints: ['synastry', 'composite'] },
]

const TOTAL_ENDPOINTS = SWISS_MODULES.reduce((sum, m) => sum + m.endpoints.length, 0)

const ENGINE_DOCS: Record<string, { title: string; description: string; filePath: string }> = {
  'swiss-ephemeris': {
    title: 'Swiss Ephemeris Engine',
    description:
      'Full astrology computation engine — natal charts, predictive timing, Vedic, classical, esoteric, and financial astrology.',
    filePath: 'apps/web/src/server/services/engines/swiss-ephemeris/',
  },
  llm: {
    title: 'LLM Engine',
    description: 'Core language model engine powering all agent reasoning and generation.',
    filePath: 'apps/web/src/server/services/gateway/',
  },
  memory: {
    title: 'Memory Engine',
    description: 'Vector-based memory storage and semantic recall for agents.',
    filePath: 'apps/web/src/server/services/memory/',
  },
}

// ─── Module Category Card ────────────────────────────────────────────────────

function ModuleCard({ mod }: { mod: EngineModule }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={styles.moduleCard}>
      <button style={styles.moduleHeader} onClick={() => setExpanded(!expanded)}>
        <span style={styles.moduleArrow}>{expanded ? '▾' : '▸'}</span>
        <span style={styles.moduleName}>{mod.name}</span>
        <span style={styles.moduleCount}>{mod.endpoints.length}</span>
      </button>
      {expanded && (
        <div style={styles.moduleEndpoints}>
          {mod.endpoints.map((ep) => (
            <div key={ep} style={styles.endpointItem}>
              <code style={styles.endpointCode}>ephemeris.{ep}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function EngineDetailPage({ params }: { params: Promise<{ engineId: string }> }) {
  const { engineId } = use(params)
  const [activeTab, setActiveTab] = useState<'overview' | 'test' | 'code'>('overview')

  const [testDate, setTestDate] = useState(new Date().toISOString().split('T')[0])
  const [testTime, setTestTime] = useState('12:00')
  const [testLat, setTestLat] = useState('40.7128')
  const [testLon, setTestLon] = useState('-74.0060')
  const [testResult, setTestResult] = useState<string | null>(null)

  const transitsQuery = trpc.ephemeris.currentTransits.useQuery(undefined, { enabled: false })
  const [dateParts, timeParts] = [testDate.split('-').map(Number), testTime.split(':').map(Number)]
  const natalChartQuery = trpc.ephemeris.natalChart.useQuery(
    {
      birthYear: dateParts[0] ?? 2000,
      birthMonth: dateParts[1] ?? 1,
      birthDay: dateParts[2] ?? 1,
      birthHour: (timeParts[0] ?? 12) + (timeParts[1] ?? 0) / 60,
      latitude: parseFloat(testLat),
      longitude: parseFloat(testLon),
    },
    { enabled: false },
  )

  const doc = ENGINE_DOCS[engineId]

  async function runTest(type: 'transits' | 'natal') {
    setTestResult('Running...')
    try {
      if (type === 'transits') {
        const result = await transitsQuery.refetch()
        setTestResult(JSON.stringify(result.data, null, 2))
      } else {
        const result = await natalChartQuery.refetch()
        const engineResult = result.data
        if (engineResult) {
          const chart = engineResult.data
          const display = {
            summary: engineResult.summary,
            planets: Object.entries(chart.planets).map(
              ([name, p]) =>
                `${name}: ${p.degree}°${String(p.minutes).padStart(2, '0')}' ${p.sign}${p.retrograde ? ' Rx' : ''} (House ${p.house})`,
            ),
            aspects: chart.aspects
              .slice(0, 8)
              .map(
                (a) =>
                  `${a.planet1} ${a.type} ${a.planet2} (orb ${a.orb}°${a.applying ? ' applying' : ''})`,
              ),
            chartShape: chart.chartShape,
            dominantElement: chart.dominantElement,
            dominantMode: chart.dominantMode,
          }
          setTestResult(JSON.stringify(display, null, 2))
        }
      }
    } catch (err) {
      setTestResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a
            href="/engines/registry"
            style={{ color: '#6b7280', fontSize: 13, textDecoration: 'none' }}
          >
            ← Engine Registry
          </a>
          <span style={{ color: '#374151' }}>/</span>
          <h2 style={styles.title}>{doc?.title ?? engineId}</h2>
          {engineId === 'swiss-ephemeris' && <span style={styles.domainBadge}>Astrology</span>}
        </div>
        <p style={styles.subtitle}>{doc?.description ?? 'Engine details'}</p>
        {engineId === 'swiss-ephemeris' && (
          <div style={styles.statsRow}>
            <span style={styles.stat}>22 modules</span>
            <span style={styles.statDot} />
            <span style={styles.stat}>{TOTAL_ENDPOINTS} endpoints</span>
            <span style={styles.statDot} />
            <span style={styles.stat}>7,421 lines</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {(['overview', 'test', 'code'] as const).map((tab) => (
          <button
            key={tab}
            style={{ ...styles.tab, ...(activeTab === tab ? styles.tabActive : {}) }}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div style={styles.content}>
          {engineId === 'swiss-ephemeris' ? (
            <>
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Source</div>
                <code style={styles.code}>{doc?.filePath}</code>
              </div>

              <div style={styles.section}>
                <div style={styles.sectionTitle}>Modules ({SWISS_MODULES.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {SWISS_MODULES.map((mod) => (
                    <ModuleCard key={mod.name} mod={mod} />
                  ))}
                </div>
              </div>

              <div style={styles.section}>
                <div style={styles.sectionTitle}>Usage in Agents</div>
                <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.6 }}>
                  Agents call the engine via tRPC:
                  <pre style={{ ...styles.preBlock, marginTop: 8 }}>
                    {`const chart = await trpc.ephemeris.natalChart.query({
  birthYear: 1990, birthMonth: 6, birthDay: 15,
  birthHour: 14.5,
  latitude: 40.7128, longitude: -74.0060,
})
// chart.data.planets.Sun → { sign: 'Gemini', degree: 24, ... }
// chart.summary → "Sun 24° Gem · Moon 16° Pis · ASC 26° Leo"`}
                  </pre>
                </div>
              </div>
            </>
          ) : doc ? (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>File Path</div>
              <code style={styles.code}>{doc.filePath}</code>
            </div>
          ) : (
            <div style={{ color: '#6b7280', textAlign: 'center', padding: 40 }}>
              No documentation available for this engine.
            </div>
          )}
        </div>
      )}

      {/* Test Tab */}
      {activeTab === 'test' && engineId === 'swiss-ephemeris' && (
        <div style={styles.content}>
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Test Parameters</div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8, marginBottom: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                <label style={styles.label}>Date</label>
                <input
                  style={styles.input}
                  type="date"
                  value={testDate}
                  onChange={(e) => setTestDate(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                <label style={styles.label}>Time (UTC)</label>
                <input
                  style={styles.input}
                  type="time"
                  value={testTime}
                  onChange={(e) => setTestTime(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                <label style={styles.label}>Latitude</label>
                <input
                  style={{ ...styles.input, width: 100 }}
                  value={testLat}
                  onChange={(e) => setTestLat(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                <label style={styles.label}>Longitude</label>
                <input
                  style={{ ...styles.input, width: 100 }}
                  value={testLon}
                  onChange={(e) => setTestLon(e.target.value)}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={styles.btnPrimary} onClick={() => runTest('transits')}>
                Get Current Transits
              </button>
              <button style={styles.btnSecondary} onClick={() => runTest('natal')}>
                Get Natal Chart
              </button>
            </div>
          </div>
          {testResult && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Result</div>
              <pre style={styles.preBlock}>{testResult}</pre>
            </div>
          )}
        </div>
      )}
      {activeTab === 'test' && engineId !== 'swiss-ephemeris' && (
        <div style={{ color: '#6b7280', textAlign: 'center', padding: 40 }}>
          Live testing is currently available for the Swiss Ephemeris engine only.
        </div>
      )}

      {/* Code Tab */}
      {activeTab === 'code' && (
        <div style={styles.content}>
          {engineId === 'swiss-ephemeris' ? (
            <>
              <div
                style={{
                  marginBottom: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 12, color: '#6b7280' }}>
                  Source:{' '}
                  <code style={{ color: '#818cf8' }}>
                    apps/web/src/server/services/engines/swiss-ephemeris/
                  </code>
                </span>
                <a
                  href="https://github.com/cmaldonado80/ultimatebrain/tree/main/apps/web/src/server/services/engines/swiss-ephemeris"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 11, color: '#818cf8', textDecoration: 'none' }}
                >
                  Browse on GitHub →
                </a>
              </div>
              <div style={{ ...styles.section, background: '#111827' }}>
                <div style={{ fontSize: 11, color: '#22c55e', marginBottom: 6, fontWeight: 600 }}>
                  Production Ready
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.6 }}>
                  Uses the swisseph native C binding for &lt; 1 arcminute accuracy with .se1 data
                  files. Falls back to pure-JS mean-motion approximations (~1 deg) on Vercel
                  serverless.
                </div>
              </div>
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Module Files (22)</div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 4,
                    fontSize: 12,
                    color: '#94a3b8',
                    fontFamily: 'monospace',
                  }}
                >
                  {[
                    'engine.ts',
                    'patterns.ts',
                    'predictive.ts',
                    'vedic.ts',
                    'composite.ts',
                    'classical.ts',
                    'midpoints.ts',
                    'financial.ts',
                    'lunar.ts',
                    'declinations.ts',
                    'dispositors.ts',
                    'accidental.ts',
                    'subdivisions.ts',
                    'antiscia.ts',
                    'fixed-stars.ts',
                    'progressions.ts',
                    'timelords.ts',
                    'returns.ts',
                    'vedic-advanced.ts',
                    'rectification.ts',
                    'esoteric.ts',
                    'index.ts',
                  ].map((f) => (
                    <div key={f} style={{ padding: '3px 0' }}>
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: '#6b7280', textAlign: 'center', padding: 40 }}>
              Source code viewer is currently available for domain engines only.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = {
  page: { padding: 24, fontFamily: 'sans-serif', color: '#f9fafb', maxWidth: 900 },
  header: { marginBottom: 20 },
  title: { margin: 0, fontSize: 20, fontWeight: 700, display: 'inline' },
  subtitle: { margin: '6px 0 0', fontSize: 13, color: '#6b7280' },
  domainBadge: {
    fontSize: 10,
    background: '#22c55e20',
    color: '#22c55e',
    padding: '2px 8px',
    borderRadius: 4,
    fontWeight: 600,
  },
  statsRow: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 },
  stat: { fontSize: 11, color: '#818cf8', fontWeight: 600 },
  statDot: { width: 3, height: 3, borderRadius: '50%', background: '#374151' },
  tabs: {
    display: 'flex',
    gap: 4,
    marginBottom: 20,
    borderBottom: '1px solid #374151',
    paddingBottom: 0,
  },
  tab: {
    background: 'none',
    border: 'none',
    color: '#6b7280',
    fontSize: 13,
    padding: '8px 16px',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    marginBottom: -1,
  },
  tabActive: { color: '#818cf8', borderBottom: '2px solid #818cf8' },
  content: { display: 'flex', flexDirection: 'column' as const, gap: 20 },
  section: { background: '#1f2937', borderRadius: 8, padding: 16, border: '1px solid #374151' },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#4b5563',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 10,
  },
  code: {
    fontSize: 12,
    color: '#818cf8',
    background: '#111827',
    padding: '4px 8px',
    borderRadius: 4,
  },
  moduleCard: { borderRadius: 6, overflow: 'hidden' },
  moduleHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '8px 10px',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid #111827',
    color: '#d1d5db',
    fontSize: 13,
    cursor: 'pointer',
    textAlign: 'left' as const,
  },
  moduleArrow: { fontSize: 10, color: '#6b7280', width: 12 },
  moduleName: { flex: 1, fontWeight: 600 },
  moduleCount: {
    fontSize: 10,
    background: '#374151',
    color: '#9ca3af',
    padding: '1px 6px',
    borderRadius: 8,
    fontWeight: 600,
  },
  moduleEndpoints: {
    padding: '4px 10px 8px 30px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  endpointItem: { padding: '2px 0' },
  endpointCode: { fontSize: 11, color: '#a5f3fc', fontFamily: 'monospace' },
  preBlock: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 6,
    padding: 12,
    fontSize: 11,
    color: '#94a3b8',
    overflowX: 'auto' as const,
    lineHeight: 1.5,
    margin: 0,
  },
  label: { fontSize: 11, color: '#6b7280' },
  input: {
    background: '#111827',
    color: '#f9fafb',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '7px 10px',
    fontSize: 13,
  },
  btnPrimary: {
    background: '#818cf8',
    color: '#f9fafb',
    border: 'none',
    borderRadius: 6,
    padding: '7px 16px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnSecondary: {
    background: '#1f2937',
    color: '#f9fafb',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '7px 16px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
}
