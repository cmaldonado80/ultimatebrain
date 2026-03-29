'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { AstrologyBrainError, fetchReport } from '@/lib/astrology-client'
import type { BirthData, NatalReport, ReportSection } from '@/lib/types'

export default function ReportsPage() {
  const [profile, setProfile] = useState<BirthData | null>(null)
  const [report, setReport] = useState<NatalReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(0)

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

  const handleGenerate = async (depth: 'none' | 'basic' | 'detailed') => {
    if (!profile) return
    setLoading(true)
    setError(null)
    try {
      const r = await fetchReport(profile, { narrativeDepth: depth })
      setReport(r)
    } catch (err) {
      setError(err instanceof AstrologyBrainError ? err.message : 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-[#06090f] text-slate-200 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-slate-500 mb-4">Create a chart first to generate reports</p>
          <Link href="/" className="text-purple-400 hover:text-purple-300 text-sm">
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
          href="/dashboard"
          className="text-sm text-purple-400 hover:text-purple-300 mb-4 block"
        >
          &larr; Dashboard
        </Link>

        <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Orbitron', sans-serif" }}>
          Natal Report
        </h1>
        <p className="text-xs text-slate-500 mb-6">
          {profile.name ? `${profile.name}'s` : 'Your'} comprehensive chart analysis
        </p>

        {!report && (
          <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-6 text-center">
            <p className="text-sm text-slate-400 mb-4">
              Generate a full natal report with 15+ analysis sections
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => handleGenerate('none')}
                disabled={loading}
                className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white rounded px-4 py-2 text-sm transition-colors"
              >
                {loading ? 'Computing...' : 'Data Only'}
              </button>
              <button
                onClick={() => handleGenerate('basic')}
                disabled={loading}
                className="bg-purple-600/80 hover:bg-purple-500 disabled:bg-purple-800 text-white rounded px-4 py-2 text-sm transition-colors"
              >
                {loading ? 'Computing...' : '+ AI Narrative'}
              </button>
            </div>
            {error && <div className="text-red-400 text-sm mt-3">{error}</div>}
          </div>
        )}

        {report && (
          <>
            <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 mb-4">
              <div className="text-sm text-slate-300 font-mono">{report.summary}</div>
              <div className="text-xs text-slate-600 mt-1">
                Generated {new Date(report.generatedAt).toLocaleString()}
              </div>
            </div>

            <div className="space-y-2">
              {report.sections.map((section: ReportSection, i: number) => (
                <div
                  key={i}
                  className="bg-[#0a0f1a] border border-white/10 rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() => setExpanded(expanded === i ? null : i)}
                    className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                  >
                    <span className="text-sm font-medium text-slate-300">{section.title}</span>
                    <span className="text-xs text-slate-600">{expanded === i ? '▾' : '▸'}</span>
                  </button>
                  {expanded === i && (
                    <div className="px-4 pb-4 border-t border-white/5">
                      <pre className="text-xs text-slate-400 whitespace-pre-wrap leading-relaxed mt-3">
                        {section.content}
                      </pre>
                      {section.narrative && (
                        <div className="mt-3 pt-3 border-t border-white/5">
                          <div className="text-xs text-purple-400 uppercase tracking-wider mb-1.5">
                            AI Interpretation
                          </div>
                          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                            {section.narrative}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => setReport(null)}
              className="mt-4 text-sm text-purple-400 hover:text-purple-300"
            >
              Generate New Report
            </button>
          </>
        )}
      </div>
    </main>
  )
}
