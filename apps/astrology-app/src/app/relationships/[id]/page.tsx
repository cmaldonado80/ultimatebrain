'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { getRelationship, type SavedRelationship } from '@/lib/astrology-client'

const ASPECT_COLOR: Record<string, string> = {
  Conjunction: 'text-purple-400',
  Trine: 'text-green-400',
  Sextile: 'text-blue-400',
  Square: 'text-red-400',
  Opposition: 'text-orange-400',
}

interface AspectInfo {
  planet1: string
  planet2: string
  type: string
  orb: number
}

export default function RelationshipDetailPage() {
  const params = useParams()
  const relId = params.id as string
  const [rel, setRel] = useState<SavedRelationship | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getRelationship(relId)
      .then(setRel)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [relId])

  if (loading) {
    return (
      <main className="min-h-screen bg-[#06090f] text-slate-200 flex items-center justify-center">
        <div className="text-slate-500">Loading...</div>
      </main>
    )
  }

  if (error || !rel) {
    return (
      <main className="min-h-screen bg-[#06090f] text-slate-200 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 mb-2">{error ?? 'Not found'}</div>
          <Link href="/relationships" className="text-sm text-purple-400">
            Back to Relationships
          </Link>
        </div>
      </main>
    )
  }

  const synastry = rel.synastryData as {
    aspects?: AspectInfo[]
    compositeHighlights?: Record<string, string | null>
  } | null
  const aspects = synastry?.aspects ?? []
  const composite = synastry?.compositeHighlights

  return (
    <main className="min-h-screen bg-[#06090f] text-slate-200 p-6">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/relationships"
          className="text-sm text-purple-400 hover:text-purple-300 no-underline mb-6 block"
        >
          &larr; Relationships
        </Link>

        {/* Header with score */}
        <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-6 text-center mb-6">
          {rel.compatibilityScore != null && (
            <div className="text-4xl font-bold text-purple-400 mb-1">{rel.compatibilityScore}</div>
          )}
          <div className="text-xs text-slate-500 mb-2">Compatibility Score</div>
          <h1 className="text-lg font-bold" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            {rel.personAName} + {rel.personBName}
          </h1>
          <div className="text-xs text-slate-600 mt-1">
            {new Date(rel.createdAt).toLocaleString()}
          </div>
        </div>

        {/* Composite highlights */}
        {composite && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'Composite Sun', sign: composite.sunSign },
              { label: 'Composite Moon', sign: composite.moonSign },
              { label: 'Composite ASC', sign: composite.ascendantSign },
            ].map(({ label, sign }) => (
              <div
                key={label}
                className="bg-[#0a0f1a] border border-white/10 rounded-lg p-3 text-center"
              >
                <div className="text-xs text-slate-400">{sign ?? '—'}</div>
                <div className="text-[10px] text-slate-600">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Synastry aspects */}
        {aspects.length > 0 && (
          <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 mb-6">
            <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3">
              Synastry Aspects
            </h2>
            <div className="space-y-1">
              {aspects.map((a, i) => (
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

        {/* Narrative */}
        {rel.narrative && (
          <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 mb-6">
            <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">
              Interpretation
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
              {rel.narrative}
            </p>
          </div>
        )}

        <div className="flex gap-3 text-xs">
          <Link
            href="/relationships"
            className="text-purple-400 hover:text-purple-300 no-underline"
          >
            All Relationships
          </Link>
          <Link href="/charts" className="text-purple-400 hover:text-purple-300 no-underline">
            My Charts
          </Link>
        </div>
      </div>
    </main>
  )
}
