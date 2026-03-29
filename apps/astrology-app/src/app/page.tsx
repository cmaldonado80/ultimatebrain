'use client'

import Link from 'next/link'
import { useState } from 'react'

import { AstrologyBrainError, fetchNatalSummary } from '@/lib/astrology-client'
import type { BirthData, NatalSummaryResponse } from '@/lib/types'

// ── Sign Symbols ──────────────────────────────────────────────────────

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

// ── Main Page ─────────────────────────────────────────────────────────

export default function Home() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<NatalSummaryResponse | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const form = new FormData(e.currentTarget)
    const date = form.get('birthDate') as string
    const time = form.get('birthTime') as string
    const lat = parseFloat(form.get('latitude') as string)
    const lng = parseFloat(form.get('longitude') as string)

    if (!date || !time) {
      setError('Date and time are required')
      setLoading(false)
      return
    }
    if (isNaN(lat) || lat < -90 || lat > 90) {
      setError('Latitude must be between -90 and 90')
      setLoading(false)
      return
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setError('Longitude must be between -180 and 180')
      setLoading(false)
      return
    }

    const [year, month, day] = date.split('-').map(Number)
    const [hours, minutes] = time.split(':').map(Number)
    const birthHour = (hours ?? 0) + (minutes ?? 0) / 60

    try {
      const birthData: BirthData = {
        name: (form.get('name') as string) || undefined,
        birthYear: year!,
        birthMonth: month!,
        birthDay: day!,
        birthHour,
        latitude: lat,
        longitude: lng,
      }
      const data = await fetchNatalSummary(birthData)
      setResult(data)
      // Save profile for other pages
      localStorage.setItem('astro_profile', JSON.stringify(birthData))
    } catch (err) {
      if (err instanceof AstrologyBrainError) {
        setError(err.message)
      } else {
        setError('Could not reach Astrology service. Is it running?')
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Result View ─────────────────────────────────────────────────────

  if (result) {
    return (
      <main className="min-h-screen bg-[#06090f] text-slate-200 p-6">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => setResult(null)}
            className="text-sm text-purple-400 hover:text-purple-300 mb-6"
          >
            &larr; New Chart
          </button>

          <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            {result.name}
          </h1>
          <p className="text-xs text-slate-500 mb-6">
            Computed {new Date(result.computedAt).toLocaleString()}
          </p>

          {/* Big Three */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'Sun', sign: result.highlights.sunSign },
              { label: 'Moon', sign: result.highlights.moonSign },
              { label: 'Ascendant', sign: result.highlights.ascendantSign },
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

          {/* Summary */}
          {result.summary && (
            <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 mb-6">
              <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">
                Summary
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                {result.summary}
              </p>
            </div>
          )}

          {/* Planet Table */}
          <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 mb-6">
            <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3">
              Planetary Positions
            </h2>
            <div className="overflow-x-auto">
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
                  {result.planets.map((p) => (
                    <tr key={p.name} className="border-b border-white/[0.03]">
                      <td className="py-1.5 pr-3 text-slate-300">{p.name}</td>
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
          </div>

          {/* Aspects */}
          {result.aspects.length > 0 && (
            <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 mb-6">
              <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3">
                Key Aspects
              </h2>
              <div className="grid grid-cols-2 gap-1.5">
                {result.aspects.map((a, i) => (
                  <div key={i} className="text-xs text-slate-400">
                    <span className="text-slate-300">{a.planet1}</span> {a.type}{' '}
                    <span className="text-slate-300">{a.planet2}</span>
                    <span className="text-slate-600 ml-1">({a.orb}&deg;)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/reports"
              className="bg-[#0a0f1a] border border-white/10 rounded-lg p-3 text-center hover:border-purple-500/30 transition-colors"
            >
              <div className="text-sm text-purple-400">Full Report</div>
              <div className="text-xs text-slate-600">15 sections</div>
            </Link>
            <Link
              href="/insights"
              className="bg-[#0a0f1a] border border-white/10 rounded-lg p-3 text-center hover:border-purple-500/30 transition-colors"
            >
              <div className="text-sm text-purple-400">Daily Insights</div>
              <div className="text-xs text-slate-600">Transits & timeline</div>
            </Link>
            <Link
              href="/relationships"
              className="bg-[#0a0f1a] border border-white/10 rounded-lg p-3 text-center hover:border-purple-500/30 transition-colors"
            >
              <div className="text-sm text-purple-400">Relationships</div>
              <div className="text-xs text-slate-600">Synastry</div>
            </Link>
            <Link
              href="/dashboard"
              className="bg-[#0a0f1a] border border-white/10 rounded-lg p-3 text-center hover:border-purple-500/30 transition-colors"
            >
              <div className="text-sm text-purple-400">Dashboard</div>
              <div className="text-xs text-slate-600">Your cosmos</div>
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // ── Form View ───────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#06090f] text-slate-200 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <h1
          className="text-2xl font-bold text-center mb-1"
          style={{ fontFamily: "'Orbitron', sans-serif" }}
        >
          Natal Chart
        </h1>
        <p className="text-sm text-slate-500 text-center mb-8">
          Enter birth details to generate your chart
        </p>

        {error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Name (optional)</label>
            <input
              name="name"
              type="text"
              placeholder="e.g., John"
              className="w-full bg-[#111827] border border-white/10 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Birth Date *</label>
              <input
                name="birthDate"
                type="date"
                required
                className="w-full bg-[#111827] border border-white/10 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Birth Time *</label>
              <input
                name="birthTime"
                type="time"
                required
                className="w-full bg-[#111827] border border-white/10 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Latitude *</label>
              <input
                name="latitude"
                type="number"
                step="any"
                required
                placeholder="e.g., 40.7128"
                className="w-full bg-[#111827] border border-white/10 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Longitude *</label>
              <input
                name="longitude"
                type="number"
                step="any"
                required
                placeholder="e.g., -74.0060"
                className="w-full bg-[#111827] border border-white/10 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:text-slate-400 text-white rounded py-2.5 text-sm font-medium transition-colors"
          >
            {loading ? 'Computing chart...' : 'Generate Chart'}
          </button>
        </form>

        <p className="text-[10px] text-slate-600 text-center mt-6">
          Powered by Solarc Astrology Brain &middot; Swiss Ephemeris
        </p>
      </div>
    </main>
  )
}
