'use client'

/**
 * Chart Detail — view a saved chart with quick actions.
 */

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import {
  getChart,
  listReports,
  type SavedChart,
  type SavedReport,
} from '../../../../../lib/astrology/client'

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

interface PlanetData {
  sign: string
  degree: number
  minutes: number
  retrograde: boolean
  house: number
}

interface AspectData {
  planet1: string
  planet2: string
  type: string
  orb: number
}

export default function ChartDetailPage() {
  const params = useParams()
  const chartId = params.id as string
  const [chart, setChart] = useState<SavedChart | null>(null)
  const [reports, setReports] = useState<SavedReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getChart(chartId)
      .then(setChart)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    listReports(chartId).then(setReports)
  }, [chartId])

  if (loading) {
    return (
      <main className="min-h-screen bg-[#06090f] text-slate-200 flex items-center justify-center">
        <div className="text-slate-500">Loading chart...</div>
      </main>
    )
  }

  if (error || !chart) {
    return (
      <main className="min-h-screen bg-[#06090f] text-slate-200 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 mb-2">{error ?? 'Chart not found'}</div>
          <Link href="/astrology/charts" className="text-sm text-purple-400">
            Back to Charts
          </Link>
        </div>
      </main>
    )
  }

  const planets = (chart.chartData as { planets?: Record<string, PlanetData> })?.planets ?? {}
  const aspects = ((chart.chartData as { aspects?: AspectData[] })?.aspects ?? []).slice(0, 12)
  const h = chart.highlights as Record<string, string | number | null> | null

  return (
    <main className="min-h-screen bg-[#06090f] text-slate-200 p-6">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/astrology/charts"
          className="text-sm text-purple-400 hover:text-purple-300 no-underline mb-6 block"
        >
          &larr; My Charts
        </Link>

        <h1 className="text-2xl font-bold mb-1">{chart.name}</h1>
        <p className="text-xs text-slate-500 mb-6">
          {chart.birthDate} {chart.birthTime} &middot; ({chart.latitude.toFixed(2)},{' '}
          {chart.longitude.toFixed(2)})
        </p>

        {/* Big Three */}
        {h && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'Sun', sign: h.sunSign as string | null },
              { label: 'Moon', sign: h.moonSign as string | null },
              { label: 'Ascendant', sign: h.ascendantSign as string | null },
            ].map(({ label, sign }) => (
              <div key={label} className="astro-card text-center">
                <div className="text-3xl mb-1">{sign ? (SIGN_SYMBOL[sign] ?? '') : '?'}</div>
                <div className="text-sm font-medium text-slate-300">{sign ?? 'Unknown'}</div>
                <div className="text-xs text-slate-500">{label}</div>
              </div>
            ))}
          </div>
        )}

        {chart.summary && (
          <div className="astro-card mb-6">
            <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">
              Summary
            </h2>
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{chart.summary}</p>
          </div>
        )}

        {/* Planets */}
        {Object.keys(planets).length > 0 && (
          <div className="astro-card mb-6">
            <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3">
              Planets
            </h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-white/5">
                  <th className="text-left py-1.5 pr-3">Planet</th>
                  <th className="text-left py-1.5 pr-3">Sign</th>
                  <th className="text-right py-1.5 pr-3">Degree</th>
                  <th className="text-right py-1.5 pr-3">House</th>
                  <th className="text-center py-1.5">Rx</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(planets).map(([name, p]) => (
                  <tr key={name} className="border-b border-white/[0.03]">
                    <td className="py-1.5 pr-3 text-slate-300">{name}</td>
                    <td className="py-1.5 pr-3">
                      <span className="mr-1">{SIGN_SYMBOL[p.sign] ?? ''}</span>
                      <span className="text-slate-400">{p.sign}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono text-slate-400">
                      {p.degree}&deg;{String(p.minutes).padStart(2, '0')}&apos;
                    </td>
                    <td className="py-1.5 pr-3 text-right text-slate-500">{p.house}</td>
                    <td className="py-1.5 text-center text-red-400">{p.retrograde ? 'R' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Aspects */}
        {aspects.length > 0 && (
          <div className="astro-card mb-6">
            <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3">
              Aspects
            </h2>
            <div className="grid grid-cols-2 gap-1.5">
              {aspects.map((a, i) => (
                <div key={i} className="text-xs text-slate-400">
                  <span className="text-slate-300">{a.planet1}</span> {a.type}{' '}
                  <span className="text-slate-300">{a.planet2}</span>
                  <span className="text-slate-600 ml-1">({a.orb}&deg;)</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Saved Reports for this chart */}
        {reports.length > 0 && (
          <div className="astro-card mb-6">
            <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3">
              Reports ({reports.length})
            </h2>
            <div className="space-y-1.5">
              {reports.map((r) => (
                <Link
                  key={r.id}
                  href={`/reports/${r.id}`}
                  className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white/[0.03] transition-colors no-underline"
                >
                  <span className="text-xs text-slate-300">
                    {r.reportType === 'natal' ? 'Natal Report' : r.reportType}
                  </span>
                  <span className="text-[10px] text-slate-600">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-3">
          <Link
            href="/astrology/reports"
            className="astro-card p-3 text-center hover:border-purple-500/30 transition-colors no-underline"
          >
            <div className="text-sm text-purple-400">Report</div>
            <div className="text-xs text-slate-600">15 sections</div>
          </Link>
          <Link
            href="/astrology/insights"
            className="astro-card p-3 text-center hover:border-purple-500/30 transition-colors no-underline"
          >
            <div className="text-sm text-purple-400">Transits</div>
            <div className="text-xs text-slate-600">Daily insights</div>
          </Link>
          <Link
            href="/astrology/relationships"
            className="astro-card p-3 text-center hover:border-purple-500/30 transition-colors no-underline"
          >
            <div className="text-sm text-purple-400">Synastry</div>
            <div className="text-xs text-slate-600">Relationships</div>
          </Link>
        </div>
      </div>
    </main>
  )
}
