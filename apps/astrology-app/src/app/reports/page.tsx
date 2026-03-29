'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import {
  AstrologyBrainError,
  fetchReport,
  listReports,
  type SavedReport,
  saveReport,
} from '@/lib/astrology-client'
import type { BirthData, NatalReport, ReportSection } from '@/lib/types'

export default function ReportsPage() {
  const [profile, setProfile] = useState<BirthData | null>(null)
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [showGenerate, setShowGenerate] = useState(false)
  const [report, setReport] = useState<NatalReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(0)

  useEffect(() => {
    const s = localStorage.getItem('astro_profile')
    if (s) {
      try {
        setProfile(JSON.parse(s))
      } catch {
        // ignore
      }
    }
    listReports()
      .then(setSavedReports)
      .finally(() => setLoadingHistory(false))
  }, [])

  const handleGenerate = async (depth: 'none' | 'basic' | 'detailed') => {
    if (!profile) return
    setLoading(true)
    setError(null)
    setSaved(false)
    try {
      const r = await fetchReport(profile, { narrativeDepth: depth })
      setReport(r)
    } catch (err) {
      setError(err instanceof AstrologyBrainError ? err.message : 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!report) return
    setSaving(true)
    try {
      // Find chartId from localStorage if available
      const chartId = localStorage.getItem('astro_last_chart_id')
      if (!chartId) {
        setError('Save a chart first to link reports')
        return
      }
      await saveReport({
        chartId,
        reportType: 'natal',
        sections: report.sections as unknown[],
        summary: report.summary,
      })
      setSaved(true)
      // Refresh history
      const updated = await listReports()
      setSavedReports(updated)
    } catch {
      setError('Failed to save report')
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
              Reports
            </h1>
            <p className="text-xs text-slate-500 mt-1">Saved natal analyses</p>
          </div>
          {profile && !showGenerate && !report && (
            <button
              onClick={() => setShowGenerate(true)}
              className="text-sm text-purple-400 hover:text-purple-300 bg-transparent border border-purple-500/30 rounded px-3 py-1.5 cursor-pointer"
            >
              + Generate Report
            </button>
          )}
        </div>

        {/* Generate new report */}
        {(showGenerate || report) && !report && (
          <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-6 text-center mb-6">
            <p className="text-sm text-slate-400 mb-4">
              Generate a full natal report with 15+ analysis sections
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => handleGenerate('none')}
                disabled={loading}
                className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white rounded px-4 py-2 text-sm transition-colors border-none cursor-pointer"
              >
                {loading ? 'Computing...' : 'Data Only'}
              </button>
              <button
                onClick={() => handleGenerate('basic')}
                disabled={loading}
                className="bg-purple-600/80 hover:bg-purple-500 disabled:bg-purple-800 text-white rounded px-4 py-2 text-sm transition-colors border-none cursor-pointer"
              >
                {loading ? 'Computing...' : '+ AI Narrative'}
              </button>
            </div>
            {error && <div className="text-red-400 text-sm mt-3">{error}</div>}
            <button
              onClick={() => setShowGenerate(false)}
              className="text-xs text-slate-600 hover:text-slate-400 mt-3 bg-transparent border-none cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Generated report view with save */}
        {report && (
          <div className="mb-6">
            <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 mb-4">
              <div className="text-sm text-slate-300 font-mono">{report.summary}</div>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-slate-600">
                  Generated {new Date(report.generatedAt).toLocaleString()}
                </span>
                {!saved && (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="text-xs px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 border-none cursor-pointer"
                  >
                    {saving ? 'Saving...' : 'Save Report'}
                  </button>
                )}
                {saved && <span className="text-xs text-green-400">Saved!</span>}
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
                    className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors bg-transparent border-none cursor-pointer"
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
              onClick={() => {
                setReport(null)
                setShowGenerate(false)
                setSaved(false)
              }}
              className="mt-4 text-sm text-purple-400 hover:text-purple-300 bg-transparent border-none cursor-pointer"
            >
              Done
            </button>
          </div>
        )}

        {/* Saved reports history */}
        {!report && (
          <>
            {loadingHistory && (
              <div className="text-center text-slate-500 py-12">Loading saved reports...</div>
            )}

            {!loadingHistory && savedReports.length === 0 && !showGenerate && (
              <div className="text-center py-16">
                <div className="text-3xl mb-3 opacity-30">&#x2606;</div>
                <div className="text-slate-500 mb-2">No reports saved yet</div>
                {profile ? (
                  <button
                    onClick={() => setShowGenerate(true)}
                    className="text-sm text-purple-400 hover:text-purple-300 bg-transparent border-none cursor-pointer"
                  >
                    Generate your first report
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

            {savedReports.length > 0 && (
              <div className="space-y-2">
                {savedReports.map((r) => (
                  <Link
                    key={r.id}
                    href={`/reports/${r.id}`}
                    className="block bg-[#0a0f1a] border border-white/10 rounded-lg p-4 hover:border-purple-500/30 transition-colors no-underline"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-200">
                        {r.reportType === 'natal' ? 'Natal Report' : r.reportType}
                      </span>
                      <span className="text-[10px] text-slate-600">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {r.summary && (
                      <div className="text-xs text-slate-500 font-mono truncate">{r.summary}</div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {/* Navigation */}
        <div className="mt-8 flex gap-3 text-xs">
          <Link href="/charts" className="text-purple-400 hover:text-purple-300 no-underline">
            Charts
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
