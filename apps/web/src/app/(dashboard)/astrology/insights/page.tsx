'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { AstrologyBrainError, fetchTimeline, fetchTransits } from '../../../../lib/astrology/client'
import type { BirthData, TimelineResponse, TransitResponse } from '../../../../lib/astrology/types'

const SIGNIFICANCE_COLOR = {
  high: 'text-purple-400',
  medium: 'text-slate-300',
  low: 'text-slate-500',
}

export default function InsightsPage() {
  const [profile, setProfile] = useState<BirthData | null>(null)
  const [transits, setTransits] = useState<TransitResponse | null>(null)
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<'7d' | '30d' | '3m'>('30d')

  useEffect(() => {
    const saved = localStorage.getItem('astro_profile')
    if (saved) {
      try {
        const p = JSON.parse(saved) as BirthData
        setProfile(p)
        loadData(p, period)
      } catch {
        setLoading(false)
      }
    } else {
      setLoading(false)
    }
  }, [])

  const loadData = async (p: BirthData, per: string) => {
    setLoading(true)
    setError(null)
    try {
      const [t, tl] = await Promise.all([
        fetchTransits(p, { days: per === '7d' ? 7 : per === '30d' ? 30 : 90 }),
        fetchTimeline(p, per as '7d' | '30d' | '3m'),
      ])
      setTransits(t)
      setTimeline(tl)
    } catch (err) {
      setError(err instanceof AstrologyBrainError ? err.message : 'Failed to load insights')
    } finally {
      setLoading(false)
    }
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-[#06090f] text-slate-200 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-slate-500 mb-4">Create a chart first to see insights</p>
          <Link href="/astrology" className="text-purple-400 hover:text-purple-300 text-sm">
            Create Chart
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#06090f] text-slate-200 p-6">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/astrology/dashboard"
          className="text-sm text-purple-400 hover:text-purple-300 mb-4 block"
        >
          &larr; Dashboard
        </Link>

        <h1 className="text-2xl font-bold mb-1">Insights</h1>
        <p className="text-xs text-slate-500 mb-4">Transits, timeline & lunar intelligence</p>

        {/* Period toggle */}
        <div className="flex gap-1.5 mb-6">
          {(['7d', '30d', '3m'] as const).map((p) => (
            <button
              key={p}
              onClick={() => {
                setPeriod(p)
                if (profile) loadData(profile, p)
              }}
              className={`text-xs px-3 py-1 rounded transition-colors ${
                period === p
                  ? 'bg-purple-600/20 text-purple-400 ring-1 ring-purple-500/30'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '3 Months'}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-slate-500 text-sm py-12 text-center">Computing transits...</div>
        )}
        {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

        {!loading && transits && (
          <>
            {/* Moon & Profection */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="astro-card">
                <div className="text-xs text-purple-400 uppercase tracking-wider mb-1">Moon</div>
                <div className="text-sm text-slate-300">{transits.moonPhase.phaseName}</div>
                <div className="text-xs text-slate-500">
                  {transits.moonPhase.illumination.toFixed(0)}% illuminated
                </div>
                {transits.lunarMansion && (
                  <div className="text-xs text-slate-600 mt-1">{transits.lunarMansion.name}</div>
                )}
              </div>
              <div className="astro-card">
                <div className="text-xs text-purple-400 uppercase tracking-wider mb-1">
                  Year Theme
                </div>
                <div className="text-sm text-slate-300">
                  House {transits.profection.profectedHouse} · {transits.profection.activatedSign}
                </div>
                <div className="text-xs text-slate-500">
                  Lord: {transits.profection.lordOfYear} (age {transits.profection.age})
                </div>
              </div>
            </div>

            {/* Timeline Events */}
            {timeline && timeline.events.length > 0 && (
              <div className="astro-card mb-6">
                <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3">
                  Significant Events
                </h2>
                <div className="space-y-2">
                  {timeline.events.slice(0, 20).map((e, i) => (
                    <div key={i} className="flex items-start gap-3 text-xs">
                      <span className="text-slate-600 w-16 shrink-0 font-mono">
                        {new Date(e.date).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                      <div>
                        <div className={SIGNIFICANCE_COLOR[e.significance]}>{e.title}</div>
                        <div className="text-slate-600">{e.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Full Transit List */}
            <div className="astro-card">
              <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3">
                All Transits ({transits.transits.length})
              </h2>
              <div className="space-y-1">
                {transits.transits.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                    <span className="text-slate-600 w-16 shrink-0 font-mono">
                      {new Date(t.date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="text-slate-300 flex-1">
                      {t.transitPlanet} {t.aspectType} {t.natalPlanet}
                    </span>
                    <span className="text-slate-600">{t.orb.toFixed(1)}°</span>
                    <span className="text-slate-700 w-6 text-right">
                      {t.applying ? 'Ap' : 'Se'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
