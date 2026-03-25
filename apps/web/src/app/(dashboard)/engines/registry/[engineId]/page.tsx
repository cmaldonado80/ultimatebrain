'use client'

/**
 * Engine Detail & Editor — view, test, and edit a brain engine.
 * For built-in engines (system/domain) shows the source code and a live test panel.
 * For custom engines shows the config and lets the user edit description/endpoint.
 */

import { useState } from 'react'
import { trpc } from '../../../../../utils/trpc'
import { use } from 'react'

// Swiss Ephemeris source (read at build-time via import)
const SWISS_EPHEMERIS_SOURCE = `/**
 * Swiss Ephemeris Engine
 *
 * Provides planetary positions, house cusps, aspect calculations, transit
 * tracking, and retrograde period detection.
 *
 * Production integration: replace computation stubs with calls to the
 * swisseph npm package or a REST wrapper around the C library.
 */

export class EphemerisEngine {
  async getPlanetaryPositions(date, time?, timezone?) { ... }
  async getHouseCusps(date, time, latitude, longitude, system?) { ... }
  async getAspects(positions) { ... }
  async getCurrentTransits() { ... }
  async getTransitsToNatal(natalPositions, date) { ... }
  async getRetrogrades(startDate, endDate) { ... }
}
`

const ENGINE_DOCS: Record<
  string,
  { title: string; description: string; filePath: string; endpoints: string[] }
> = {
  'swiss-ephemeris': {
    title: 'Swiss Ephemeris Engine',
    description:
      'Planetary positions, house cusps, aspect calculations, transit tracking, and retrograde detection. Used by Astrology Brain mini-brains.',
    filePath: 'templates/astrology/src/engines/ephemeris/engine.ts',
    endpoints: [
      'ephemeris.planetaryPositions — Get positions for any date/time',
      "ephemeris.currentTransits — Today's planetary positions",
      'ephemeris.houseCusps — 12 house cusps (needs lat/lon)',
      'ephemeris.aspects — Aspects from a set of positions',
      'ephemeris.transitsToNatal — Transits hitting a natal chart',
      'ephemeris.retrogrades — Retrograde periods in date range',
      'ephemeris.natalChart — Full chart (positions + cusps + aspects)',
    ],
  },
  llm: {
    title: 'LLM Engine',
    description: 'Core language model engine powering all agent reasoning and generation.',
    filePath: 'apps/web/src/server/services/gateway/',
    endpoints: ['gateway.chat', 'gateway.stream'],
  },
  memory: {
    title: 'Memory Engine',
    description: 'Vector-based memory storage and semantic recall for agents.',
    filePath: 'apps/web/src/server/services/memory/',
    endpoints: ['memory.store', 'memory.search', 'memory.list'],
  },
}

export default function EngineDetailPage({ params }: { params: Promise<{ engineId: string }> }) {
  const { engineId } = use(params)
  const [activeTab, setActiveTab] = useState<'overview' | 'test' | 'code'>('overview')

  // Test panel state
  const [testDate, setTestDate] = useState(new Date().toISOString().split('T')[0])
  const [testTime, setTestTime] = useState('12:00')
  const [testLat, setTestLat] = useState('40.7128')
  const [testLon, setTestLon] = useState('-74.0060')
  const [testResult, setTestResult] = useState<string | null>(null)

  const transitsQuery = trpc.ephemeris.currentTransits.useQuery(undefined, {
    enabled: false,
  })
  const natalChartQuery = trpc.ephemeris.natalChart.useQuery(
    {
      date: testDate,
      time: testTime,
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
        const data = result.data
        if (data) {
          const summary = {
            planets: Object.values(data.positions).map(
              (p) => `${p.planet}: ${p.notation}${p.retrograde ? ' Rx' : ''}`,
            ),
            aspects: data.aspects.slice(0, 5).map((a) => a.label),
            cusps: data.cusps.map((c) => `House ${c.house}: ${c.notation}`),
          }
          setTestResult(JSON.stringify(summary, null, 2))
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
          {doc && (
            <>
              <div style={styles.section}>
                <div style={styles.sectionTitle}>File Path</div>
                <code style={styles.code}>{doc.filePath}</code>
              </div>

              <div style={styles.section}>
                <div style={styles.sectionTitle}>tRPC Endpoints</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {doc.endpoints.map((ep) => {
                    const [name, ...rest] = ep.split(' — ')
                    return (
                      <div key={ep} style={styles.endpointRow}>
                        <code style={styles.endpointName}>{name}</code>
                        {rest.length > 0 && (
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>{rest.join(' — ')}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {engineId === 'swiss-ephemeris' && (
                <div style={styles.section}>
                  <div style={styles.sectionTitle}>Usage in Agents</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.6 }}>
                    Astrology Brain agents can call this engine via tRPC. Example prompt injection:
                    <pre
                      style={{ ...styles.preBlock, marginTop: 8 }}
                    >{`// Agent calls ephemeris.natalChart via tool call
const chart = await trpc.ephemeris.natalChart.query({
  date: "1990-06-15",
  time: "14:30",
  latitude: 40.7128,
  longitude: -74.0060,
})`}</pre>
                  </div>
                </div>
              )}
            </>
          )}
          {!doc && (
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
                  placeholder="40.7128"
                  value={testLat}
                  onChange={(e) => setTestLat(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                <label style={styles.label}>Longitude</label>
                <input
                  style={{ ...styles.input, width: 100 }}
                  placeholder="-74.0060"
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
                    templates/astrology/src/engines/ephemeris/engine.ts
                  </code>
                </span>
                <a
                  href="https://github.com/cmaldonado80/ultimatebrain/blob/main/templates/astrology/src/engines/ephemeris/engine.ts"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 11, color: '#818cf8', textDecoration: 'none' }}
                >
                  Edit on GitHub →
                </a>
              </div>
              <pre style={styles.sourceBlock}>{SWISS_EPHEMERIS_SOURCE}</pre>
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  background: '#111827',
                  borderRadius: 6,
                  border: '1px solid #374151',
                }}
              >
                <div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 6, fontWeight: 600 }}>
                  Production Upgrade
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.6 }}>
                  The current implementation uses deterministic stubs for development. To use real
                  Swiss Ephemeris data, replace the private computation methods with:
                </div>
                <pre style={{ ...styles.preBlock, marginTop: 8 }}>{`npm install swisseph
// Then in engine.ts, replace computeLongitude() with:
import swisseph from 'swisseph'
const result = swisseph.calc_ut(julianDay, swisseph.SE_SUN, swisseph.SEFLG_SPEED)
// result.longitude gives the true ecliptic longitude`}</pre>
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
  section: {
    background: '#1f2937',
    borderRadius: 8,
    padding: 16,
    border: '1px solid #374151',
  },
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
  endpointRow: {
    display: 'flex',
    gap: 12,
    alignItems: 'baseline',
    padding: '4px 0',
    borderBottom: '1px solid #111827',
  },
  endpointName: { fontSize: 12, color: '#a5f3fc', minWidth: 260, fontFamily: 'monospace' },
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
  sourceBlock: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 6,
    padding: 16,
    fontSize: 12,
    color: '#94a3b8',
    overflowX: 'auto' as const,
    lineHeight: 1.6,
    margin: 0,
    whiteSpace: 'pre' as const,
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
