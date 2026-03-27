'use client'

/**
 * Engine Detail — view, test, and explore a brain engine.
 * Swiss Ephemeris shows categorized modules with expandable endpoint lists.
 */

import { useState, use } from 'react'

// ─── Module definitions for Swiss Ephemeris ──────────────────────────────────

interface EngineModule {
  name: string
  endpoints: string[]
}

const SWISS_MODULES: EngineModule[] = [
  {
    name: 'Natal Chart',
    endpoints: [
      'natalChart',
      'generateReport',
      'planetaryPositions',
      'currentTransits',
      'houseCusps',
      'aspects',
      'status',
      'patterns',
      'sectAnalysis',
      'accidentalDignities',
      'criticalDegrees',
      'lillyScore',
      'solarCondition',
      'arabicParts',
      'planetaryHours',
      'moonPhase',
      'lunarMansion',
      'prenatalLunations',
      'calcDeclinations',
      'dispositors',
      'fixedStars',
      'fixedStarAspects',
      'sabianSymbol',
      'midpoints',
      'antiscia',
      'dwads',
      'navamsa',
      'decanates',
      'declinations',
    ],
  },
  {
    name: 'Predictive & Timing',
    endpoints: [
      'transitCalendar',
      'solarReturn',
      'lunarReturn',
      'nodalReturn',
      'profections',
      'secondaryProgressions',
      'solarArcDirections',
      'primaryDirections',
      'firdaria',
      'zodiacalReleasing',
      'decennials',
      'ageHarmonic',
      'harmonicSpectrum',
    ],
  },
  {
    name: 'Synastry & Relationships',
    endpoints: ['synastry', 'composite', 'draconic'],
  },
  {
    name: 'Vedic / Jyotish',
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
    name: 'Rectification',
    endpoints: ['trutineOfHermes', 'animodar', 'almutenFiguris', 'huberAgePoint', 'huberTimeline'],
  },
  {
    name: 'Specialized (Financial, Medical, Esoteric)',
    endpoints: [
      'bradley',
      'financialCycles',
      'sevenRays',
      'medical',
      'agricultural',
      'mundane',
      'heliocentric',
    ],
  },
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
    <div className="rounded-md overflow-hidden">
      <button
        className="flex items-center gap-2 w-full py-2 px-2.5 bg-transparent border-none border-b border-gray-900 text-gray-300 text-[13px] cursor-pointer text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[10px] text-gray-500 w-3">{expanded ? '▾' : '▸'}</span>
        <span className="flex-1 font-semibold">{mod.name}</span>
        <span className="text-[10px] bg-gray-700 text-gray-400 py-px px-1.5 rounded-lg font-semibold">
          {mod.endpoints.length}
        </span>
      </button>
      {expanded && (
        <div className="py-1 px-2.5 pl-[30px] flex flex-col gap-0.5">
          {mod.endpoints.map((ep) => (
            <div key={ep} className="py-0.5">
              <code className="text-[11px] text-cyan-200 font-mono">ephemeris.{ep}</code>
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

  const [dateParts, timeParts] = [testDate.split('-').map(Number), testTime.split(':').map(Number)]
  const [activeTestName, setActiveTestName] = useState<string | null>(null)

  const doc = ENGINE_DOCS[engineId]

  function getBirthData() {
    return {
      birthYear: dateParts[0] ?? 2000,
      birthMonth: dateParts[1] ?? 1,
      birthDay: dateParts[2] ?? 1,
      birthHour: (timeParts[0] ?? 12) + (timeParts[1] ?? 0) / 60,
      latitude: parseFloat(testLat),
      longitude: parseFloat(testLon),
    }
  }
  function getDateData() {
    return {
      year: dateParts[0] ?? 2000,
      month: dateParts[1] ?? 1,
      day: dateParts[2] ?? 1,
      hour: (timeParts[0] ?? 12) + (timeParts[1] ?? 0) / 60,
    }
  }

  // Input mapper: different endpoints need different input shapes
  function getInputForEndpoint(name: string): Record<string, unknown> {
    const bd = getBirthData()
    const dd = getDateData()
    switch (name) {
      case 'currentTransits':
      case 'status':
        return {}
      case 'moonPhase':
      case 'lunarMansion':
      case 'panchanga':
      case 'muhurta':
        return dd
      case 'planetaryPositions':
        return { ...dd, sidereal: false }
      case 'houseCusps':
        return { ...dd, latitude: bd.latitude, longitude: bd.longitude }
      case 'aspects':
      case 'fixedStars':
        return { ...dd, latitude: bd.latitude, longitude: bd.longitude }
      case 'heliocentric':
        return dd
      case 'bradley':
        return { year: dd.year }
      case 'mundane':
        return { ...dd, latitude: bd.latitude, longitude: bd.longitude }
      case 'agricultural':
        return dd
      case 'planetaryHours':
        return { ...dd, latitude: bd.latitude, longitude: bd.longitude }
      case 'firdaria':
        return { isDayChart: true, maxAge: 80 }
      case 'zodiacalReleasing':
        return { lotSign: 0, maxAge: 80, maxLevel: 2 }
      case 'decennials':
        return { isDayChart: true, maxAge: 80 }
      case 'profections':
        return {
          birthYear: bd.birthYear,
          currentYear: new Date().getFullYear(),
          ascendantSign: 'Aries',
        }
      case 'synastry':
      case 'composite':
        return { chart1: bd, chart2: bd }
      case 'sabianSymbol':
        return { longitude: 84.0 }
      case 'secondaryProgressions':
      case 'solarArcDirections':
        return { ...bd, targetYear: new Date().getFullYear(), targetMonth: 1, targetDay: 1 }
      case 'lunarReturn':
      case 'nodalReturn':
        return { ...bd, targetYear: new Date().getFullYear(), targetMonth: 1, targetDay: 1 }
      case 'solarReturn':
        return {
          natalSunLongitude: 84.0,
          year: new Date().getFullYear(),
          latitude: bd.latitude,
          longitude: bd.longitude,
        }
      case 'animodar':
        return { ...bd, prenatalSyzygyLon: 120.0, isDayChart: true }
      case 'huberAgePoint':
        return { ...bd, age: 30 }
      case 'huberTimeline':
        return { ...bd, startAge: 25, endAge: 35, step: 1 }
      case 'ageHarmonic':
        return { ...bd, age: 30 }
      case 'transitCalendar':
        return { ...bd, startDate: '2026-01-01', endDate: '2026-02-01' }
      case 'primaryDirections':
        return { ...bd, targetYear: new Date().getFullYear(), targetMonth: 1, targetDay: 1 }
      default:
        return bd
    }
  }

  async function runEndpointTest(name: string) {
    setActiveTestName(name)
    setTestResult(`Running ephemeris.${name}...`)
    try {
      const input = getInputForEndpoint(name)
      const inputStr =
        Object.keys(input).length > 0
          ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`
          : ''
      const res = await fetch(`/api/trpc/ephemeris.${name}${inputStr}`)
      const json = await res.json()
      if (json.error) {
        setTestResult(`Error: ${JSON.stringify(json.error, null, 2)}`)
      } else {
        setTestResult(JSON.stringify(json.result?.data ?? json, null, 2))
      }
    } catch (err) {
      setTestResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="p-6 font-sans text-gray-50 max-w-[900px]">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-3">
          <a href="/engines/registry" className="text-gray-500 text-[13px] no-underline">
            ← Engine Registry
          </a>
          <span className="text-gray-700">/</span>
          <h2 className="m-0 text-xl font-bold inline">{doc?.title ?? engineId}</h2>
          {engineId === 'swiss-ephemeris' && (
            <span className="text-[10px] bg-green-500/[0.13] text-green-500 py-0.5 px-2 rounded font-semibold">
              Astrology
            </span>
          )}
        </div>
        <p className="mt-1.5 mb-0 text-[13px] text-gray-500">
          {doc?.description ?? 'Engine details'}
        </p>
        {engineId === 'swiss-ephemeris' && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[11px] text-neon-purple font-semibold">22 modules</span>
            <span className="w-[3px] h-[3px] rounded-full bg-gray-700" />
            <span className="text-[11px] text-neon-purple font-semibold">
              {TOTAL_ENDPOINTS} endpoints
            </span>
            <span className="w-[3px] h-[3px] rounded-full bg-gray-700" />
            <span className="text-[11px] text-neon-purple font-semibold">7,421 lines</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-700 pb-0">
        {(['overview', 'test', 'code'] as const).map((tab) => (
          <button
            key={tab}
            className={`bg-transparent border-none text-[13px] py-2 px-4 cursor-pointer -mb-px border-b-2 ${
              activeTab === tab
                ? 'text-neon-purple border-neon-purple'
                : 'text-gray-500 border-transparent'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-5">
          {engineId === 'swiss-ephemeris' ? (
            <>
              <div className="cyber-card">
                <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-2.5">
                  Source
                </div>
                <code className="text-xs text-neon-purple bg-gray-900 py-1 px-2 rounded">
                  {doc?.filePath}
                </code>
              </div>

              <div className="cyber-card">
                <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-2.5">
                  Modules ({SWISS_MODULES.length})
                </div>
                <div className="flex flex-col gap-0.5">
                  {SWISS_MODULES.map((mod) => (
                    <ModuleCard key={mod.name} mod={mod} />
                  ))}
                </div>
              </div>

              <div className="cyber-card">
                <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-2.5">
                  Usage in Agents
                </div>
                <div className="text-xs text-gray-400 leading-relaxed">
                  Agents call the engine via tRPC:
                  <pre className="bg-slate-900 border border-slate-800 rounded-md p-3 text-[11px] text-slate-400 overflow-x-auto leading-normal m-0 mt-2">
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
            <div className="cyber-card">
              <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-2.5">
                File Path
              </div>
              <code className="text-xs text-neon-purple bg-gray-900 py-1 px-2 rounded">
                {doc.filePath}
              </code>
            </div>
          ) : (
            <div className="text-gray-500 text-center p-10">
              No documentation available for this engine.
            </div>
          )}
        </div>
      )}

      {/* Test Tab */}
      {activeTab === 'test' && engineId === 'swiss-ephemeris' && (
        <div className="flex flex-col gap-5">
          <div className="cyber-card">
            <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-2.5">
              Birth / Date Parameters
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-gray-500">Date</label>
                <input
                  className="cyber-input text-[13px]"
                  type="date"
                  value={testDate}
                  onChange={(e) => setTestDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-gray-500">Time (UTC)</label>
                <input
                  className="cyber-input text-[13px]"
                  type="time"
                  value={testTime}
                  onChange={(e) => setTestTime(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-gray-500">Latitude</label>
                <input
                  className="cyber-input text-[13px] w-[100px]"
                  value={testLat}
                  onChange={(e) => setTestLat(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-gray-500">Longitude</label>
                <input
                  className="cyber-input text-[13px] w-[100px]"
                  value={testLon}
                  onChange={(e) => setTestLon(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Test Buttons by Category */}
          {[
            {
              label: 'Core',
              tests: [
                'status',
                'natalChart',
                'currentTransits',
                'planetaryPositions',
                'houseCusps',
                'aspects',
              ],
            },
            { label: 'Reports', tests: ['generateReport'] },
            { label: 'Lunar', tests: ['moonPhase', 'lunarMansion', 'prenatalLunations'] },
            {
              label: 'Dignities & Sect',
              tests: ['sectAnalysis', 'accidentalDignities', 'criticalDegrees', 'lillyScore'],
            },
            { label: 'Patterns', tests: ['patterns'] },
            {
              label: 'Subdivisions',
              tests: ['dwads', 'navamsa', 'decanates', 'ageHarmonic', 'harmonicSpectrum'],
            },
            { label: 'Antiscia', tests: ['antiscia', 'draconic', 'heliocentric'] },
            { label: 'Classical', tests: ['arabicParts', 'planetaryHours', 'solarCondition'] },
            { label: 'Stars & Symbols', tests: ['fixedStars', 'fixedStarAspects', 'sabianSymbol'] },
            { label: 'Analysis', tests: ['midpoints', 'dispositors', 'declinations'] },
            {
              label: 'Progressions',
              tests: ['secondaryProgressions', 'solarArcDirections', 'primaryDirections'],
            },
            { label: 'Returns', tests: ['solarReturn', 'lunarReturn', 'nodalReturn'] },
            {
              label: 'Profections & Time Lords',
              tests: ['profections', 'firdaria', 'zodiacalReleasing', 'decennials'],
            },
            {
              label: 'Rectification',
              tests: [
                'trutineOfHermes',
                'animodar',
                'almutenFiguris',
                'huberAgePoint',
                'huberTimeline',
              ],
            },
            { label: 'Transit Calendar', tests: ['transitCalendar'] },
            {
              label: 'Vedic',
              tests: [
                'panchanga',
                'dasha',
                'vargaCharts',
                'shadbala',
                'ashtakavarga',
                'charaKarakas',
                'muhurta',
              ],
            },
            { label: 'Esoteric', tests: ['sevenRays', 'medical', 'mundane', 'agricultural'] },
            { label: 'Financial', tests: ['bradley'] },
            { label: 'Composite', tests: ['synastry', 'composite'] },
          ].map((group) => (
            <div key={group.label} className="cyber-card">
              <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-2.5">
                {group.label}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {group.tests.map((t) => (
                  <button
                    key={t}
                    className={`cyber-btn-secondary text-[11px] py-[5px] px-2.5 ${
                      activeTestName === t ? 'border-neon-purple text-neon-purple' : ''
                    }`}
                    onClick={() => runEndpointTest(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {testResult && (
            <div className="cyber-card">
              <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-2.5">
                Result{' '}
                {activeTestName && (
                  <span className="text-cyan-200 font-normal">— ephemeris.{activeTestName}</span>
                )}
              </div>
              <pre className="bg-slate-900 border border-slate-800 rounded-md p-3 text-[11px] text-slate-400 overflow-x-auto leading-normal m-0 max-h-[500px] overflow-y-auto">
                {testResult}
              </pre>
            </div>
          )}
        </div>
      )}
      {activeTab === 'test' && engineId !== 'swiss-ephemeris' && (
        <div className="text-gray-500 text-center p-10">
          Live testing is currently available for the Swiss Ephemeris engine only.
        </div>
      )}

      {/* Code Tab */}
      {activeTab === 'code' && (
        <div className="flex flex-col gap-5">
          {engineId === 'swiss-ephemeris' ? (
            <>
              <div className="mb-3 flex justify-between items-center">
                <span className="text-xs text-gray-500">
                  Source:{' '}
                  <code className="text-neon-purple">
                    apps/web/src/server/services/engines/swiss-ephemeris/
                  </code>
                </span>
                <a
                  href="https://github.com/cmaldonado80/ultimatebrain/tree/main/apps/web/src/server/services/engines/swiss-ephemeris"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-neon-purple no-underline"
                >
                  Browse on GitHub →
                </a>
              </div>
              <div className="cyber-card bg-gray-900">
                <div className="text-[11px] text-green-500 mb-1.5 font-semibold">
                  Production Ready
                </div>
                <div className="text-xs text-gray-400 leading-relaxed">
                  Uses the swisseph native C binding for &lt; 1 arcminute accuracy with .se1 data
                  files. Falls back to pure-JS mean-motion approximations (~1 deg) on Vercel
                  serverless.
                </div>
              </div>
              <div className="cyber-card">
                <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-2.5">
                  Module Files (22)
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs text-slate-400 font-mono">
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
                    'report-generator.ts',
                    'index.ts',
                  ].map((f) => (
                    <div key={f} className="py-[3px]">
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="text-gray-500 text-center p-10">
              Source code viewer is currently available for domain engines only.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
