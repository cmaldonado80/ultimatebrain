'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import {
  fetchNatalSummary,
  fetchTimeline,
  fetchTransits,
  getLastSeen,
  listCharts,
  type SavedChart,
  updateLastSeen,
} from '@/lib/astrology-client'
import type {
  BirthData,
  NatalSummaryResponse,
  TimelineResponse,
  TransitResponse,
} from '@/lib/types'

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
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null)
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null)
  const [isFirstVisit, setIsFirstVisit] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    // 1. Try loading from saved charts first
    let birthData: BirthData | null = null
    let chartId: string | null = null

    try {
      const charts = await listCharts()
      if (charts.length > 0) {
        const saved = charts[0] as SavedChart
        chartId = saved.id
        const [y, m, d] = saved.birthDate.split('-').map(Number)
        const [h, mi] = saved.birthTime.split(':').map(Number)
        birthData = {
          name: saved.name,
          birthYear: y!,
          birthMonth: m!,
          birthDay: d!,
          birthHour: (h ?? 0) + (mi ?? 0) / 60,
          latitude: saved.latitude,
          longitude: saved.longitude,
        }
      }
    } catch {
      // Fall through to localStorage
    }

    // 2. Fallback to localStorage
    if (!birthData) {
      const saved = localStorage.getItem('astro_profile')
      if (saved) {
        try {
          birthData = JSON.parse(saved) as BirthData
        } catch {
          // ignore
        }
      }
    }

    if (!birthData) {
      setLoading(false)
      return
    }

    setProfile(birthData)

    // 3. Fetch last-seen state
    let lastSeen: string | null = null
    if (chartId) {
      const engagement = await getLastSeen(chartId)
      if (engagement?.lastSeenAt) {
        lastSeen = engagement.lastSeenAt
        setLastSeenAt(lastSeen)
      } else {
        setIsFirstVisit(true)
      }
    } else {
      setIsFirstVisit(true)
    }

    // 4. Fetch fresh data
    const [c, t, tl] = await Promise.all([
      fetchNatalSummary(birthData).catch(() => null),
      fetchTransits(birthData, { days: 7 }).catch(() => null),
      fetchTimeline(birthData, '7d').catch(() => null),
    ])
    setChart(c)
    setTransits(t)
    setTimeline(tl)
    setLoading(false)

    // 5. Update last-seen
    if (chartId) {
      updateLastSeen(chartId).catch(() => {})
    }
  }

  // Compute "what changed" — transits after lastSeenAt
  const newTransits =
    transits && lastSeenAt
      ? transits.transits.filter((t) => new Date(t.date) > new Date(lastSeenAt))
      : []

  const newEvents =
    timeline && lastSeenAt
      ? timeline.events.filter(
          (e) => e.significance === 'high' && new Date(e.date) > new Date(lastSeenAt),
        )
      : []

  const daysSinceVisit = lastSeenAt
    ? Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 86400000)
    : null

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
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4 opacity-40">&#x2609;</div>
          <h1 className="text-2xl font-bold mb-2">Your Astrology Dashboard</h1>
          <p className="text-slate-400 mb-2">
            Create your first chart to unlock daily insights, transit tracking, and personality
            analysis.
          </p>
          <p className="text-xs text-slate-600 mb-6">
            Your natal chart is computed with Swiss Ephemeris precision and serves as the foundation
            for all features.
          </p>
          <Link href="/" className="astro-btn-primary no-underline">
            Create Your Chart
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#06090f] text-slate-200 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">{profile.name ?? 'Your Cosmos'}</h1>
        <p className="text-xs text-slate-500 mb-6">Personal astrology intelligence</p>

        {/* Big Three */}
        {chart && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'Sun', sign: chart.highlights.sunSign },
              { label: 'Moon', sign: chart.highlights.moonSign },
              { label: 'Rising', sign: chart.highlights.ascendantSign },
            ].map(({ label, sign }) => (
              <div key={label} className="astro-card text-center">
                <div className="text-3xl mb-1">{sign ? (SIGN_SYMBOL[sign] ?? '') : '?'}</div>
                <div className="text-sm font-medium text-slate-300">{sign ?? 'Unknown'}</div>
                <div className="text-xs text-slate-500">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* What Changed */}
        <div className="astro-card border-purple-500/20 mb-6">
          <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">
            {isFirstVisit ? 'Welcome' : 'What Changed'}
          </h2>

          {isFirstVisit && (
            <p className="text-sm text-slate-300">
              Welcome to your personal astrology dashboard. Here&apos;s what&apos;s happening in
              your chart right now.
            </p>
          )}

          {!isFirstVisit && daysSinceVisit != null && (
            <p className="text-xs text-slate-500 mb-2">
              Since your last visit
              {daysSinceVisit > 0
                ? ` (${daysSinceVisit} day${daysSinceVisit !== 1 ? 's' : ''} ago)`
                : ' (today)'}
              :
            </p>
          )}

          {!isFirstVisit && newTransits.length > 0 && (
            <div className="mb-2">
              <div className="text-sm text-slate-300 mb-1">
                {newTransits.length} new transit{newTransits.length !== 1 ? 's' : ''} formed
              </div>
              <div className="space-y-1">
                {newTransits.slice(0, 5).map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-slate-600 w-14 shrink-0 font-mono">
                      {new Date(t.date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="text-purple-300">
                      {t.transitPlanet} {t.aspectType} {t.natalPlanet}
                    </span>
                    <span className="text-slate-600">({t.orb.toFixed(1)}°)</span>
                  </div>
                ))}
                {newTransits.length > 5 && (
                  <Link href="/insights" className="text-xs text-purple-400 no-underline">
                    +{newTransits.length - 5} more
                  </Link>
                )}
              </div>
            </div>
          )}

          {!isFirstVisit && newEvents.length > 0 && (
            <div>
              {newEvents.slice(0, 3).map((e, i) => (
                <div key={i} className="text-xs text-purple-300 mb-0.5">
                  {e.title}
                </div>
              ))}
            </div>
          )}

          {!isFirstVisit && newTransits.length === 0 && newEvents.length === 0 && (
            <p className="text-sm text-slate-500">No major changes since your last visit.</p>
          )}
        </div>

        {/* Today */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {transits?.moonPhase && (
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
          )}
          {transits?.profection && (
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
          )}
        </div>

        {/* This Week */}
        {transits && transits.transits.length > 0 && (
          <div className="astro-card mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
                This Week
              </h2>
              <Link
                href="/insights"
                className="text-xs text-purple-400 hover:text-purple-300 no-underline"
              >
                View all
              </Link>
            </div>
            <div className="space-y-1.5">
              {transits.transits.slice(0, 5).map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-slate-600 w-14 shrink-0 font-mono">
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

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/charts"
            className="astro-card hover:border-purple-500/30 transition-colors no-underline"
          >
            <div className="text-sm font-medium text-purple-400 mb-1">My Charts</div>
            <div className="text-xs text-slate-500">Saved natal charts</div>
          </Link>
          <Link
            href="/reports"
            className="astro-card hover:border-purple-500/30 transition-colors no-underline"
          >
            <div className="text-sm font-medium text-purple-400 mb-1">Reports</div>
            <div className="text-xs text-slate-500">15-section analysis</div>
          </Link>
          <Link
            href="/insights"
            className="astro-card hover:border-purple-500/30 transition-colors no-underline"
          >
            <div className="text-sm font-medium text-purple-400 mb-1">Insights</div>
            <div className="text-xs text-slate-500">Transits & timeline</div>
          </Link>
          <Link
            href="/relationships"
            className="astro-card hover:border-purple-500/30 transition-colors no-underline"
          >
            <div className="text-sm font-medium text-purple-400 mb-1">Relationships</div>
            <div className="text-xs text-slate-500">Synastry & compatibility</div>
          </Link>
        </div>
      </div>
    </main>
  )
}
