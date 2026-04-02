'use client'

/**
 * Shared Resource Page — public, read-only view of a shared report or relationship.
 * No auth required. No org data exposed.
 */

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { getSharedResource } from '../../../../lib/astrology/client'

const ASPECT_COLOR: Record<string, string> = {
  Conjunction: 'text-purple-400',
  Trine: 'text-green-400',
  Sextile: 'text-blue-400',
  Square: 'text-red-400',
  Opposition: 'text-orange-400',
}

interface Section {
  title: string
  content: string
  narrative?: string
}

interface AspectInfo {
  planet1: string
  planet2: string
  type: string
  orb: number
}

export default function SharedResourcePage() {
  const params = useParams()
  const token = params.token as string
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(0)

  useEffect(() => {
    getSharedResource(token)
      .then(setData)
      .catch(() => setError('This insight is no longer available.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <main className="min-h-screen bg-[#06090f] text-slate-200 flex items-center justify-center">
        <div className="text-slate-500">Loading...</div>
      </main>
    )
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-[#06090f] text-slate-200 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="text-3xl mb-4 opacity-30">&#x2606;</div>
          <div className="text-slate-400 mb-2">{error ?? 'Not found'}</div>
          <p className="text-xs text-slate-600">
            This shared link may have been revoked or the content may have been deleted.
          </p>
        </div>
      </main>
    )
  }

  const type = data.type as string

  // ── Report View ────────────────────────────────────────────────────

  if (type === 'report') {
    const sections = (data.sections ?? []) as Section[]
    const summary = data.summary as string | null
    const reportType = data.reportType as string

    return (
      <main className="min-h-screen bg-[#06090f] text-slate-200 p-6 print:bg-white print:text-black">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold mb-1">
            {reportType === 'natal' ? 'Natal Report' : reportType}
          </h1>

          {summary && (
            <div className="astro-card mb-4 print:bg-gray-50 print:border-gray-200">
              <div className="text-sm text-slate-300 font-mono print:text-black">{summary}</div>
              <div className="text-xs text-slate-600 mt-1">
                {data.createdAt ? new Date(data.createdAt as string).toLocaleString() : ''}
              </div>
            </div>
          )}

          <div className="space-y-2 mb-6">
            {sections.map((section, i) => (
              <div
                key={i}
                className="astro-card overflow-hidden p-0 print:bg-gray-50 print:border-gray-200"
              >
                <button
                  onClick={() => setExpanded(expanded === i ? null : i)}
                  className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors bg-transparent border-none cursor-pointer print:cursor-default"
                >
                  <span className="text-sm font-medium text-slate-300 print:text-black">
                    {section.title}
                  </span>
                  <span className="text-xs text-slate-600 print:hidden">
                    {expanded === i ? '▾' : '▸'}
                  </span>
                </button>
                {(expanded === i || typeof window === 'undefined') && (
                  <div className="px-4 pb-4 border-t border-white/5 print:border-gray-200">
                    <pre className="text-xs text-slate-400 whitespace-pre-wrap leading-relaxed mt-3 print:text-black">
                      {section.content}
                    </pre>
                    {section.narrative && (
                      <div className="mt-3 pt-3 border-t border-white/5 print:border-gray-200">
                        <div className="text-xs text-purple-400 uppercase tracking-wider mb-1.5 print:text-purple-700">
                          Interpretation
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap print:text-black">
                          {section.narrative}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <Footer />
        </div>
      </main>
    )
  }

  // ── Relationship View ──────────────────────────────────────────────

  if (type === 'relationship') {
    const score = data.compatibilityScore as number | null
    const personA = data.personAName as string
    const personB = data.personBName as string
    const narrative = data.narrative as string | null
    const synastry = data.synastryData as { aspects?: AspectInfo[] } | null
    const aspects = synastry?.aspects ?? []

    return (
      <main className="min-h-screen bg-[#06090f] text-slate-200 p-6 print:bg-white print:text-black">
        <div className="max-w-2xl mx-auto">
          <div className="astro-card p-6 text-center mb-6 print:bg-gray-50">
            {score != null && (
              <div className="text-4xl font-bold text-purple-400 mb-1 print:text-purple-700">
                {score}
              </div>
            )}
            <div className="text-xs text-slate-500 mb-2">Compatibility Score</div>
            <h1 className="text-lg font-bold">
              {personA} + {personB}
            </h1>
          </div>

          {aspects.length > 0 && (
            <div className="astro-card mb-6 print:bg-gray-50">
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

          {narrative && (
            <div className="astro-card mb-6 print:bg-gray-50">
              <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">
                Interpretation
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap print:text-black">
                {narrative}
              </p>
            </div>
          )}

          <Footer />
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#06090f] text-slate-200 flex items-center justify-center">
      <div className="text-slate-500">Unknown resource type</div>
    </main>
  )
}

function Footer() {
  return (
    <div className="text-center text-[10px] text-slate-700 mt-8 print:text-gray-400">
      Powered by Solarc Astrology &middot; Swiss Ephemeris
    </div>
  )
}
