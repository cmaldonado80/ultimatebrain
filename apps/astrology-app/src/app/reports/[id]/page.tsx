'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { createShareLink, getReport, type SavedReport } from '@/lib/astrology-client'

interface Section {
  title: string
  content: string
  narrative?: string
}

export default function ReportDetailPage() {
  const params = useParams()
  const reportId = params.id as string
  const [report, setReport] = useState<SavedReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(0)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    getReport(reportId)
      .then(setReport)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [reportId])

  if (loading) {
    return (
      <main className="min-h-screen bg-[#06090f] text-slate-200 flex items-center justify-center">
        <div className="text-slate-500">Loading report...</div>
      </main>
    )
  }

  if (error || !report) {
    return (
      <main className="min-h-screen bg-[#06090f] text-slate-200 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 mb-2">{error ?? 'Report not found'}</div>
          <Link href="/reports" className="text-sm text-purple-400">
            Back to Reports
          </Link>
        </div>
      </main>
    )
  }

  const sections = (report.sections ?? []) as Section[]

  return (
    <main className="min-h-screen bg-[#06090f] text-slate-200 p-6">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/reports"
          className="text-sm text-purple-400 hover:text-purple-300 no-underline mb-6 block"
        >
          &larr; Reports
        </Link>

        <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Orbitron', sans-serif" }}>
          {report.reportType === 'natal' ? 'Natal Report' : report.reportType}
        </h1>

        {report.summary && (
          <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 mb-4">
            <div className="text-sm text-slate-300 font-mono">{report.summary}</div>
            <div className="text-xs text-slate-600 mt-1">
              Created {new Date(report.createdAt).toLocaleString()}
            </div>
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={async () => {
              setSharing(true)
              try {
                const result = await createShareLink('report', reportId)
                const url = `${window.location.origin}/share/${result.token}`
                setShareUrl(url)
                await navigator.clipboard.writeText(url)
                setCopied('link')
                setTimeout(() => setCopied(null), 2000)
              } catch {
                // silent
              } finally {
                setSharing(false)
              }
            }}
            disabled={sharing}
            className="text-xs px-3 py-1.5 rounded bg-purple-600/80 hover:bg-purple-500 text-white border-none cursor-pointer disabled:opacity-50"
          >
            {sharing ? 'Creating...' : shareUrl ? 'Reshare' : 'Share'}
          </button>
          <button
            onClick={() => window.print()}
            className="text-xs px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 cursor-pointer"
          >
            Print / PDF
          </button>
          {report.summary && (
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(report.summary!)
                setCopied('summary')
                setTimeout(() => setCopied(null), 2000)
              }}
              className="text-xs px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 cursor-pointer"
            >
              {copied === 'summary' ? 'Copied!' : 'Copy Summary'}
            </button>
          )}
          {copied === 'link' && <span className="text-xs text-green-400">Link copied!</span>}
        </div>

        {shareUrl && (
          <div className="bg-[#0a0f1a] border border-purple-500/20 rounded-lg px-3 py-2 mb-4 flex items-center gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 bg-transparent text-xs text-slate-400 font-mono border-none outline-none"
            />
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(shareUrl)
                setCopied('link')
                setTimeout(() => setCopied(null), 2000)
              }}
              className="text-xs text-purple-400 hover:text-purple-300 bg-transparent border-none cursor-pointer"
            >
              Copy
            </button>
          </div>
        )}

        {/* Sections */}
        <div className="space-y-2 mb-6">
          {sections.map((section, i) => (
            <div key={i} className="bg-[#0a0f1a] border border-white/10 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors bg-transparent border-none cursor-pointer"
              >
                <span className="text-sm font-medium text-slate-300">{section.title}</span>
                <span className="text-xs text-slate-600">{expanded === i ? '▾' : '▸'}</span>
              </button>
              {expanded === i && (
                <div className="px-4 pb-4 border-t border-white/5">
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(section.content)
                        setCopied(`s${i}`)
                        setTimeout(() => setCopied(null), 1500)
                      }}
                      className="text-[10px] text-slate-600 hover:text-slate-400 bg-transparent border-none cursor-pointer"
                    >
                      {copied === `s${i}` ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <pre className="text-xs text-slate-400 whitespace-pre-wrap leading-relaxed mt-1">
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

        {sections.length === 0 && (
          <div className="text-center text-slate-600 py-8">No sections in this report.</div>
        )}

        {/* Footer */}
        <div className="flex gap-3 text-xs">
          <Link href="/reports" className="text-purple-400 hover:text-purple-300 no-underline">
            All Reports
          </Link>
          <Link href="/charts" className="text-purple-400 hover:text-purple-300 no-underline">
            My Charts
          </Link>
        </div>
      </div>
    </main>
  )
}
