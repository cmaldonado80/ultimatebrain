'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { AstrologyBrainError, fetchNatalSummary, fetchTransits } from '@/lib/astrology-client'
import type { BirthData, NatalSummaryResponse, TransitResponse } from '@/lib/types'

const SIGN_SYMBOL: Record<string, string> = {
  Aries: '\u2648',
  Taurus: '\u2649',
  Gemini: '\u264A',
  Cancer: '\u264B',
  Leo: '\u264C',
  Virgo: '\u264D',
  Libra: '\u264E',
  Scorpio: '\u264F',
  Sagittarius: '\u2650',
  Capricorn: '\u2651',
  Aquarius: '\u2652',
  Pisces: '\u2653',
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<BirthData | null>(null)
  const [chart, setChart] = useState<NatalSummaryResponse | null>(null)
  const [transits, setTransits] = useState<TransitResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('astro_profile')
    if (saved) {
      try {
        const p = JSON.parse(saved) as BirthData
        setProfile(p)
        // Load chart and transits
        Promise.all([
          fetchNatalSummary(p).catch(() => null),
          fetchTransits(p, { days: 7 }).catch(() => null),
        ]).then(([c, t]) => {
          setChart(c)
          setTransits(t)
          setLoading(false)
        })
      } catch {
        setLoading(false)
      }
    } else {
      setLoading(false)
    }
  }, [])

  if (loading) {
    return (
      <main className="min-h-screen bg-[#06090f] text-slate-200 flex items-center justify-center">
        <div className="text-slate-500">Loading your cosmos...</div>
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-[#06090f] text-slate-200 flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            Welcome
          </h1>
          <p className="text-slate-500 mb-6">Create your profile to get started</p>
          <Link
            href="/"
            className="bg-purple-600 hover:bg-purple-500 text-white rounded px-6 py-2.5 text-sm font-medium transition-colors"
          >
            Create Chart
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#06090f] text-slate-200 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Orbitron', sans-serif" }}>
          {profile.name ?? 'Your Cosmos'}
        </h1>
        <p className="text-xs text-slate-500 mb-6">Personal astrology intelligence</p>

        {/* Big Three */}
        {chart && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'Sun', sign: chart.highlights.sunSign },
              { label: 'Moon', sign: chart.highlights.moonSign },
              { label: 'Rising', sign: chart.highlights.ascendantSign },
            ].map(({ label, sign }) => (
              <div
                key={label}
                className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 text-center"
              >
                <div className="text-3xl mb-1">{sign ? (SIGN_SYMBOL[sign] ?? '') : '?'}</div>
                <div className="text-sm font-medium text-slate-300">{sign ?? 'Unknown'}</div>
                <div className="text-xs text-slate-500">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Link
            href="/reports"
            className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 hover:border-purple-500/30 transition-colors"
          >
            <div className="text-sm font-medium text-purple-400 mb-1">Full Report</div>
            <div className="text-xs text-slate-500">15-section natal analysis</div>
          </Link>
          <Link
            href="/insights"
            className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 hover:border-purple-500/30 transition-colors"
          >
            <div className="text-sm font-medium text-purple-400 mb-1">Daily Insights</div>
            <div className="text-xs text-slate-500">Transits & moon phase</div>
          </Link>
          <Link
            href="/relationships"
            className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 hover:border-purple-500/30 transition-colors"
          >
            <div className="text-sm font-medium text-purple-400 mb-1">Relationships</div>
            <div className="text-xs text-slate-500">Synastry & compatibility</div>
          </Link>
          <Link
            href="/"
            className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 hover:border-purple-500/30 transition-colors"
          >
            <div className="text-sm font-medium text-purple-400 mb-1">New Chart</div>
            <div className="text-xs text-slate-500">Compute another chart</div>
          </Link>
        </div>

        {/* Today's Transits Preview */}
        {transits && transits.transits.length > 0 && (
          <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
                This Week
              </h2>
              <Link href="/insights" className="text-xs text-purple-400 hover:text-purple-300">
                View all
              </Link>
            </div>
            <div className="space-y-1.5">
              {transits.transits.slice(0, 5).map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-slate-600 w-16 shrink-0">
                    {new Date(t.date).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="text-slate-300">
                    {t.transitPlanet} {t.aspectType} {t.natalPlanet}
                  </span>
                  <span className="text-slate-600">({t.orb.toFixed(1)}°)</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Moon Phase */}
        {transits?.moonPhase && (
          <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4">
            <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">
              Moon
            </h2>
            <div className="text-sm text-slate-300">
              {transits.moonPhase.phaseName} · {transits.moonPhase.illumination.toFixed(0)}%
              illuminated
            </div>
            {transits.lunarMansion && (
              <div className="text-xs text-slate-500 mt-1">
                Mansion: {transits.lunarMansion.name} — {transits.lunarMansion.meaning}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
