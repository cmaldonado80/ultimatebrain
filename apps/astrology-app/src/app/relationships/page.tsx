'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import {
  AstrologyBrainError,
  fetchSynastry,
  listRelationships,
  type SavedRelationship,
  saveRelationship,
} from '@/lib/astrology-client'
import type { BirthData, SynastryResponse } from '@/lib/types'

const ASPECT_COLOR: Record<string, string> = {
  Conjunction: 'text-purple-400',
  Trine: 'text-green-400',
  Sextile: 'text-blue-400',
  Square: 'text-red-400',
  Opposition: 'text-orange-400',
}

export default function RelationshipsPage() {
  const [profile, setProfile] = useState<BirthData | null>(null)
  const [savedRels, setSavedRels] = useState<SavedRelationship[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [result, setResult] = useState<SynastryResponse | null>(null)
  const [lastPersonB, setLastPersonB] = useState<BirthData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const s = localStorage.getItem('astro_profile')
    if (s) {
      try {
        setProfile(JSON.parse(s))
      } catch {
        // ignore
      }
    }
    listRelationships()
      .then(setSavedRels)
      .finally(() => setLoadingHistory(false))
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
    setSaved(false)
    try {
      const r = await fetchSynastry(profile, personB, true)
      setResult(r)
      setLastPersonB(personB)
    } catch (err) {
      setError(err instanceof AstrologyBrainError ? err.message : 'Synastry computation failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!result || !profile || !lastPersonB) return
    setSaving(true)
    try {
      await saveRelationship({
        personAName: result.personA.name,
        personAData: profile as unknown as Record<string, unknown>,
        personBName: result.personB.name,
        personBData: lastPersonB as unknown as Record<string, unknown>,
        compatibilityScore: result.compatibilityScore,
        synastryData: {
          aspects: result.synastryAspects,
          compositeHighlights: result.compositeHighlights,
        },
        narrative: result.narrative,
      })
      setSaved(true)
      const updated = await listRelationships()
      setSavedRels(updated)
    } catch {
      setError('Failed to save relationship')
    } finally {
      setSaving(false)
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

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "'Orbitron', sans-serif" }}>
              Relationships
            </h1>
            <p className="text-xs text-slate-500 mt-1">Synastry & compatibility</p>
          </div>
          {profile && !showForm && !result && (
            <button
              onClick={() => setShowForm(true)}
              className="text-sm text-purple-400 hover:text-purple-300 bg-transparent border border-purple-500/30 rounded px-3 py-1.5 cursor-pointer"
            >
              + New Analysis
            </button>
          )}
        </div>

        {/* Partner form */}
        {showForm && !result && (
          <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-6 mb-6">
            <p className="text-sm text-slate-400 mb-4">
              Enter partner birth data for compatibility analysis
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
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white rounded py-2.5 text-sm font-medium transition-colors border-none cursor-pointer"
                >
                  {loading ? 'Computing...' : 'Analyze'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-sm text-slate-600 hover:text-slate-400 px-3 bg-transparent border-none cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Result with save */}
        {result && (
          <div className="mb-6">
            <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-6 text-center mb-4">
              <div className="text-4xl font-bold text-purple-400 mb-1">
                {result.compatibilityScore}
              </div>
              <div className="text-xs text-slate-500">Compatibility Score</div>
              <div className="text-xs text-slate-600 mt-2">
                {result.personA.name} + {result.personB.name}
              </div>
              <div className="flex justify-center gap-2 mt-3">
                {!saved && (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="text-xs px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 border-none cursor-pointer"
                  >
                    {saving ? 'Saving...' : 'Save Relationship'}
                  </button>
                )}
                {saved && <span className="text-xs text-green-400">Saved!</span>}
              </div>
            </div>

            {/* Aspects */}
            {result.synastryAspects.length > 0 && (
              <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 mb-4">
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
                      <span className="text-slate-600">{a.orb}&deg;</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.narrative && (
              <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 mb-4">
                <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">
                  Interpretation
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {result.narrative}
                </p>
              </div>
            )}

            <button
              onClick={() => {
                setResult(null)
                setShowForm(false)
                setSaved(false)
              }}
              className="text-sm text-purple-400 hover:text-purple-300 bg-transparent border-none cursor-pointer"
            >
              Done
            </button>
          </div>
        )}

        {/* Saved history */}
        {!result && !showForm && (
          <>
            {loadingHistory && <div className="text-center text-slate-500 py-12">Loading...</div>}

            {!loadingHistory && savedRels.length === 0 && (
              <div className="text-center py-16">
                <div className="text-3xl mb-3 opacity-30">&#x2661;</div>
                <div className="text-slate-500 mb-2">No relationships saved yet</div>
                {profile ? (
                  <button
                    onClick={() => setShowForm(true)}
                    className="text-sm text-purple-400 hover:text-purple-300 bg-transparent border-none cursor-pointer"
                  >
                    Analyze your first compatibility
                  </button>
                ) : (
                  <Link
                    href="/"
                    className="text-sm text-purple-400 hover:text-purple-300 no-underline"
                  >
                    Create a chart first
                  </Link>
                )}
              </div>
            )}

            {savedRels.length > 0 && (
              <div className="space-y-2">
                {savedRels.map((r) => (
                  <Link
                    key={r.id}
                    href={`/relationships/${r.id}`}
                    className="block bg-[#0a0f1a] border border-white/10 rounded-lg p-4 hover:border-purple-500/30 transition-colors no-underline"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-200">
                        {r.personAName} + {r.personBName}
                      </span>
                      <span className="text-[10px] text-slate-600">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {r.compatibilityScore != null && (
                        <span className="text-purple-400 font-medium">{r.compatibilityScore}%</span>
                      )}
                      {r.narrative && (
                        <span className="text-slate-600 truncate max-w-[300px]">
                          {r.narrative.slice(0, 80)}...
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        <div className="mt-8 flex gap-3 text-xs">
          <Link href="/charts" className="text-purple-400 hover:text-purple-300 no-underline">
            Charts
          </Link>
          <Link href="/reports" className="text-purple-400 hover:text-purple-300 no-underline">
            Reports
          </Link>
          <Link href="/dashboard" className="text-purple-400 hover:text-purple-300 no-underline">
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}
