'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { AstrologyBrainError, fetchSynastry } from '@/lib/astrology-client'
import type { BirthData, SynastryResponse } from '@/lib/types'

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

const ASPECT_COLOR: Record<string, string> = {
  Conjunction: 'text-purple-400',
  Trine: 'text-green-400',
  Sextile: 'text-blue-400',
  Square: 'text-red-400',
  Opposition: 'text-orange-400',
}

export default function RelationshipsPage() {
  const [profile, setProfile] = useState<BirthData | null>(null)
  const [result, setResult] = useState<SynastryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('astro_profile')
    if (saved) {
      try {
        setProfile(JSON.parse(saved))
      } catch {
        // ignore
      }
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!profile) return

    const form = new FormData(e.currentTarget)
    const date = form.get('birthDate') as string
    const time = form.get('birthTime') as string
    const lat = parseFloat(form.get('latitude') as string)
    const lng = parseFloat(form.get('longitude') as string)

    if (!date || !time || isNaN(lat) || isNaN(lng)) {
      setError('All fields are required')
      return
    }

    const [year, month, day] = date.split('-').map(Number)
    const [hours, minutes] = time.split(':').map(Number)

    const personB: BirthData = {
      name: (form.get('name') as string) || 'Partner',
      birthYear: year!,
      birthMonth: month!,
      birthDay: day!,
      birthHour: (hours ?? 0) + (minutes ?? 0) / 60,
      latitude: lat,
      longitude: lng,
    }

    setLoading(true)
    setError(null)
    try {
      const r = await fetchSynastry(profile, personB, true)
      setResult(r)
    } catch (err) {
      setError(err instanceof AstrologyBrainError ? err.message : 'Synastry computation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#06090f] text-slate-200 p-6">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/dashboard"
          className="text-sm text-purple-400 hover:text-purple-300 mb-4 block"
        >
          &larr; Dashboard
        </Link>

        <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Orbitron', sans-serif" }}>
          Relationships
        </h1>
        <p className="text-xs text-slate-500 mb-6">Synastry & compatibility analysis</p>

        {!profile && (
          <div className="text-center py-12">
            <p className="text-slate-500 mb-4">Create your chart first</p>
            <Link href="/" className="text-purple-400 text-sm">
              Create Chart
            </Link>
          </div>
        )}

        {profile && !result && (
          <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-6">
            <p className="text-sm text-slate-400 mb-4">
              Enter your partner's birth data to see compatibility
            </p>
            {error && <div className="text-red-400 text-sm mb-3">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                name="name"
                placeholder="Name"
                className="w-full bg-[#111827] border border-white/10 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  name="birthDate"
                  type="date"
                  required
                  className="w-full bg-[#111827] border border-white/10 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                />
                <input
                  name="birthTime"
                  type="time"
                  required
                  className="w-full bg-[#111827] border border-white/10 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  name="latitude"
                  type="number"
                  step="any"
                  required
                  placeholder="Latitude"
                  className="w-full bg-[#111827] border border-white/10 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
                />
                <input
                  name="longitude"
                  type="number"
                  step="any"
                  required
                  placeholder="Longitude"
                  className="w-full bg-[#111827] border border-white/10 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white rounded py-2.5 text-sm font-medium transition-colors"
              >
                {loading ? 'Computing synastry...' : 'Analyze Compatibility'}
              </button>
            </form>
          </div>
        )}

        {result && (
          <>
            {/* Score */}
            <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-6 text-center mb-6">
              <div className="text-4xl font-bold text-purple-400 mb-1">
                {result.compatibilityScore}
              </div>
              <div className="text-xs text-slate-500">Compatibility Score</div>
              <div className="text-xs text-slate-600 mt-2">
                {result.personA.name} + {result.personB.name}
              </div>
            </div>

            {/* Composite highlights */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { label: 'Composite Sun', sign: result.compositeHighlights.sunSign },
                { label: 'Composite Moon', sign: result.compositeHighlights.moonSign },
                { label: 'Composite ASC', sign: result.compositeHighlights.ascendantSign },
              ].map(({ label, sign }) => (
                <div
                  key={label}
                  className="bg-[#0a0f1a] border border-white/10 rounded-lg p-3 text-center"
                >
                  <div className="text-2xl mb-0.5">{sign ? (SIGN_SYMBOL[sign] ?? '') : '?'}</div>
                  <div className="text-xs text-slate-400">{sign ?? '—'}</div>
                  <div className="text-[10px] text-slate-600">{label}</div>
                </div>
              ))}
            </div>

            {/* Synastry Aspects */}
            <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 mb-6">
              <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3">
                Synastry Aspects
              </h2>
              <div className="space-y-1">
                {result.synastryAspects.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-slate-300 w-20">{a.planet1}</span>
                    <span className={`w-24 ${ASPECT_COLOR[a.type] ?? 'text-slate-400'}`}>
                      {a.type}
                    </span>
                    <span className="text-slate-300 w-20">{a.planet2}</span>
                    <span className="text-slate-600">{a.orb}°</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Narrative */}
            {result.narrative && (
              <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 mb-6">
                <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">
                  Interpretation
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {result.narrative}
                </p>
              </div>
            )}

            <button
              onClick={() => setResult(null)}
              className="text-sm text-purple-400 hover:text-purple-300"
            >
              New Comparison
            </button>
          </>
        )}
      </div>
    </main>
  )
}
