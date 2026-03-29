'use client'

import { useState } from 'react'

import type { ContractReviewResponse } from '@/lib/types'

const CONTRACT_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'nda', label: 'NDA' },
  { value: 'employment', label: 'Employment' },
  { value: 'service', label: 'Service Agreement' },
  { value: 'license', label: 'License' },
]

const FOCUS_AREAS = [
  'Liability',
  'Termination',
  'IP',
  'Confidentiality',
  'Payment',
  'Indemnification',
]

const SEVERITY_STYLE: Record<string, string> = {
  high: 'border-red-500/30 bg-red-900/20 text-red-300',
  medium: 'border-yellow-500/30 bg-yellow-900/20 text-yellow-300',
  low: 'border-green-500/30 bg-green-900/20 text-green-300',
}

export default function Home() {
  const [result, setResult] = useState<ContractReviewResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const form = new FormData(e.currentTarget)
    const contractText = form.get('contractText') as string
    if (!contractText || contractText.length < 50) {
      setError('Contract text must be at least 50 characters')
      setLoading(false)
      return
    }

    const focusAreas = FOCUS_AREAS.filter((a) => form.get(`focus_${a}`))

    try {
      const res = await fetch('/api/domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: (form.get('title') as string) || undefined,
          contractText,
          contractType: form.get('contractType') as string,
          focusAreas: focusAreas.length > 0 ? focusAreas : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Analysis failed')
      setResult(data as ContractReviewResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // ── Result View ─────────────────────────────────────────────────────

  if (result) {
    return (
      <main className="min-h-screen bg-[#06090f] text-slate-200 p-6">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => setResult(null)}
            className="text-sm text-purple-400 hover:text-purple-300 mb-6"
          >
            &larr; New Analysis
          </button>

          <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            {result.title}
          </h1>
          <p className="text-xs text-slate-500 mb-6">
            {result.contractType.toUpperCase()} &middot; Analyzed{' '}
            {new Date(result.analyzedAt).toLocaleString()}
          </p>

          {/* Summary */}
          <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 mb-4">
            <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">
              Summary
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">{result.summary}</p>
          </div>

          {/* Risk Flags */}
          {result.riskFlags.length > 0 && (
            <div className="mb-4">
              <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">
                Risk Flags
              </h2>
              <div className="space-y-2">
                {result.riskFlags.map((r, i) => (
                  <div
                    key={i}
                    className={`border rounded-lg p-3 ${SEVERITY_STYLE[r.severity] ?? ''}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono uppercase">{r.severity}</span>
                      <span className="text-sm font-medium">{r.area}</span>
                    </div>
                    <p className="text-xs opacity-80 mb-1">{r.description}</p>
                    <p className="text-xs text-slate-400">Recommendation: {r.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key Clauses */}
          {result.keyClauses.length > 0 && (
            <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 mb-4">
              <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3">
                Key Clauses
              </h2>
              <div className="space-y-3">
                {result.keyClauses.map((c, i) => (
                  <div
                    key={i}
                    className="border-b border-white/[0.03] pb-3 last:border-0 last:pb-0"
                  >
                    <div className="text-sm font-medium text-slate-300 mb-1">{c.name}</div>
                    <div className="text-xs text-slate-500 italic mb-1">
                      &ldquo;{c.excerpt}&rdquo;
                    </div>
                    <div className="text-xs text-slate-400">{c.assessment}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4">
              <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">
                Recommendations
              </h2>
              <ul className="space-y-1.5">
                {result.recommendations.map((r, i) => (
                  <li key={i} className="text-sm text-slate-300 flex gap-2">
                    <span className="text-purple-400 flex-shrink-0">&bull;</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    )
  }

  // ── Form View ───────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#06090f] text-slate-200 flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <h1
          className="text-2xl font-bold text-center mb-1"
          style={{ fontFamily: "'Orbitron', sans-serif" }}
        >
          Contract Review
        </h1>
        <p className="text-sm text-slate-500 text-center mb-6">
          Paste a contract for AI-powered risk analysis
        </p>

        {error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Title (optional)</label>
            <input
              name="title"
              type="text"
              placeholder="e.g., Acme NDA 2025"
              className="w-full bg-[#111827] border border-white/10 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Contract Type</label>
            <select
              name="contractType"
              className="w-full bg-[#111827] border border-white/10 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
            >
              {CONTRACT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Contract Text *</label>
            <textarea
              name="contractText"
              required
              rows={10}
              placeholder="Paste the full contract text here..."
              className="w-full bg-[#111827] border border-white/10 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50 resize-y"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-2">Focus Areas (optional)</label>
            <div className="flex flex-wrap gap-2">
              {FOCUS_AREAS.map((area) => (
                <label key={area} className="flex items-center gap-1.5 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    name={`focus_${area}`}
                    className="rounded border-white/20 bg-[#111827]"
                  />
                  {area}
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:text-slate-400 text-white rounded py-2.5 text-sm font-medium transition-colors"
          >
            {loading ? 'Analyzing contract...' : 'Analyze Contract'}
          </button>
        </form>

        <p className="text-[10px] text-slate-600 text-center mt-6">Powered by Solarc Legal Brain</p>
      </div>
    </main>
  )
}
