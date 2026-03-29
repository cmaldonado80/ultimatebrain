'use client'

/**
 * My Charts — list of saved natal charts with actions.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { deleteChart, listCharts, type SavedChart } from '@/lib/astrology-client'

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

export default function ChartsPage() {
  const [charts, setCharts] = useState<SavedChart[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listCharts()
      .then(setCharts)
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this chart? Associated reports will also be deleted.')) return
    await deleteChart(id)
    setCharts((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <main className="min-h-screen bg-[#06090f] text-slate-200 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            My Charts
          </h1>
          <Link href="/" className="text-sm text-purple-400 hover:text-purple-300 no-underline">
            + New Chart
          </Link>
        </div>

        {loading && <div className="text-center text-slate-500 py-12">Loading saved charts...</div>}

        {!loading && charts.length === 0 && (
          <div className="text-center py-16">
            <div className="text-3xl mb-3 opacity-30">&#x2609;</div>
            <div className="text-slate-500 mb-2">No saved charts yet</div>
            <Link href="/" className="text-sm text-purple-400 hover:text-purple-300 no-underline">
              Generate your first chart
            </Link>
          </div>
        )}

        <div className="space-y-3">
          {charts.map((chart) => {
            const h = chart.highlights as Record<string, string | null> | null
            return (
              <div
                key={chart.id}
                className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 hover:border-purple-500/30 transition-colors"
              >
                <div className="flex items-center gap-3 mb-2">
                  <Link
                    href={`/charts/${chart.id}`}
                    className="text-base font-medium text-slate-200 hover:text-purple-300 no-underline flex-1"
                  >
                    {chart.name}
                  </Link>
                  <span className="text-[10px] text-slate-600">
                    {new Date(chart.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Big Three */}
                {h && (
                  <div className="flex gap-4 mb-2 text-xs">
                    {h.sunSign && (
                      <span className="text-slate-400">
                        {SIGN_SYMBOL[h.sunSign] ?? ''} Sun {h.sunSign}
                      </span>
                    )}
                    {h.moonSign && (
                      <span className="text-slate-400">
                        {SIGN_SYMBOL[h.moonSign] ?? ''} Moon {h.moonSign}
                      </span>
                    )}
                    {h.ascendantSign && (
                      <span className="text-slate-400">
                        {SIGN_SYMBOL[h.ascendantSign] ?? ''} ASC {h.ascendantSign}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 text-[11px] text-slate-600">
                  <span>
                    {chart.birthDate} {chart.birthTime}
                  </span>
                  <span>
                    ({chart.latitude.toFixed(2)}, {chart.longitude.toFixed(2)})
                  </span>
                  <span className="flex-1" />
                  <Link
                    href={`/charts/${chart.id}`}
                    className="text-purple-400 hover:text-purple-300 no-underline"
                  >
                    View
                  </Link>
                  <button
                    className="text-red-400/50 hover:text-red-400 bg-transparent border-none cursor-pointer"
                    onClick={() => handleDelete(chart.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Navigation */}
        <div className="mt-8 flex gap-3 text-xs">
          <Link href="/" className="text-purple-400 hover:text-purple-300 no-underline">
            Home
          </Link>
          <Link href="/reports" className="text-purple-400 hover:text-purple-300 no-underline">
            Reports
          </Link>
          <Link
            href="/relationships"
            className="text-purple-400 hover:text-purple-300 no-underline"
          >
            Relationships
          </Link>
          <Link href="/dashboard" className="text-purple-400 hover:text-purple-300 no-underline">
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}
