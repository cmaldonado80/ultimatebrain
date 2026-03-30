'use client'

/**
 * Onboarding Wizard — guided first-time experience.
 * Walks new users through: welcome → chart form → save → success.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { fetchNatalSummary, saveChart } from '@/lib/astrology-client'
import type { NatalSummaryResponse } from '@/lib/types'

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

export default function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chart, setChart] = useState<NatalSummaryResponse | null>(null)
  const [birthData, setBirthData] = useState<{
    date: string
    time: string
    lat: number
    lng: number
  } | null>(null)
  const [saving, setSaving] = useState(false)

  const handleGenerate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const form = new FormData(e.currentTarget)
    const date = form.get('birthDate') as string
    const time = form.get('birthTime') as string
    const lat = parseFloat(form.get('latitude') as string)
    const lng = parseFloat(form.get('longitude') as string)

    if (!date || !time || isNaN(lat) || isNaN(lng)) {
      setError('All fields are required')
      setLoading(false)
      return
    }

    const [year, month, day] = date.split('-').map(Number)
    const [hours, minutes] = time.split(':').map(Number)
    const birthHour = (hours ?? 0) + (minutes ?? 0) / 60

    try {
      const result = await fetchNatalSummary({
        name: (form.get('name') as string) || 'My Chart',
        birthYear: year!,
        birthMonth: month!,
        birthDay: day!,
        birthHour,
        latitude: lat,
        longitude: lng,
      })
      setChart(result)
      setBirthData({ date, time, lat, lng })
      localStorage.setItem(
        'astro_profile',
        JSON.stringify({
          name: (form.get('name') as string) || 'My Chart',
          birthYear: year!,
          birthMonth: month!,
          birthDay: day!,
          birthHour,
          latitude: lat,
          longitude: lng,
        }),
      )
      setStep(2)
    } catch {
      setError('Chart computation failed. Please check your inputs.')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!chart || !birthData) return
    setSaving(true)
    try {
      const saved = await saveChart({
        name: chart.name,
        birthDate: birthData.date,
        birthTime: birthData.time,
        latitude: birthData.lat,
        longitude: birthData.lng,
        chartData: { planets: chart.planets, aspects: chart.aspects },
        highlights: chart.highlights as Record<string, unknown>,
        summary: chart.summary,
      })
      localStorage.setItem('astro_last_chart_id', saved.id)
      document.cookie = 'astro-onboarded=1; path=/; max-age=31536000; samesite=lax'
      setStep(3)
    } catch {
      setError('Failed to save chart')
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = () => {
    document.cookie = 'astro-onboarded=1; path=/; max-age=31536000; samesite=lax'
    onComplete()
  }

  // ── Step 0: Welcome ────────────────────────────────────────────────

  if (step === 0) {
    return (
      <div className="fixed inset-0 bg-[#06090f] flex items-center justify-center p-6 z-50">
        <div className="max-w-md text-center">
          <div className="text-5xl mb-4">&#x2609;</div>
          <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            Welcome
          </h1>
          <p className="text-slate-400 mb-8">
            Let&apos;s create your personal chart in 60 seconds. Your natal chart is the foundation
            for all insights.
          </p>
          <button
            onClick={() => setStep(1)}
            className="bg-purple-600 hover:bg-purple-500 text-white rounded-lg px-8 py-3 text-sm font-medium transition-colors border-none cursor-pointer"
          >
            Get Started
          </button>
          <div className="mt-4">
            <button
              onClick={handleSkip}
              className="text-xs text-slate-600 hover:text-slate-400 bg-transparent border-none cursor-pointer"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Step 1: Birth Data Form ────────────────────────────────────────

  if (step === 1) {
    return (
      <div className="fixed inset-0 bg-[#06090f] flex items-center justify-center p-6 z-50">
        <div className="max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-[10px] text-purple-400 uppercase tracking-wider mb-1">
              Step 1 of 3
            </div>
            <h2 className="text-xl font-bold" style={{ fontFamily: "'Orbitron', sans-serif" }}>
              Your Birth Data
            </h2>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-4 text-sm text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Name</label>
              <input
                name="name"
                placeholder="e.g., John"
                className="w-full bg-[#111827] border border-white/10 rounded px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Birth Date *</label>
                <input
                  name="birthDate"
                  type="date"
                  required
                  className="w-full bg-[#111827] border border-white/10 rounded px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Birth Time *</label>
                <input
                  name="birthTime"
                  type="time"
                  required
                  className="w-full bg-[#111827] border border-white/10 rounded px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
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
                  placeholder="40.7128"
                  className="w-full bg-[#111827] border border-white/10 rounded px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Longitude *</label>
                <input
                  name="longitude"
                  type="number"
                  step="any"
                  required
                  placeholder="-74.0060"
                  className="w-full bg-[#111827] border border-white/10 rounded px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white rounded py-2.5 text-sm font-medium transition-colors border-none cursor-pointer"
            >
              {loading ? 'Computing chart...' : 'Generate Chart'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Step 2: Chart Result + Save ────────────────────────────────────

  if (step === 2 && chart) {
    return (
      <div className="fixed inset-0 bg-[#06090f] flex items-center justify-center p-6 z-50 overflow-y-auto">
        <div className="max-w-md w-full my-8">
          <div className="text-center mb-6">
            <div className="text-[10px] text-purple-400 uppercase tracking-wider mb-1">
              Step 2 of 3
            </div>
            <h2 className="text-xl font-bold" style={{ fontFamily: "'Orbitron', sans-serif" }}>
              Your Chart
            </h2>
          </div>

          {/* Big Three */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'Sun', sign: chart.highlights.sunSign },
              { label: 'Moon', sign: chart.highlights.moonSign },
              { label: 'Rising', sign: chart.highlights.ascendantSign },
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

          {chart.summary && (
            <div className="bg-[#0a0f1a] border border-white/10 rounded-lg p-4 mb-6">
              <p className="text-sm text-slate-300 font-mono">{chart.summary}</p>
            </div>
          )}

          {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white rounded py-2.5 text-sm font-medium transition-colors border-none cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save Chart'}
          </button>
        </div>
      </div>
    )
  }

  // ── Step 3: Success ────────────────────────────────────────────────

  if (step === 3) {
    return (
      <div className="fixed inset-0 bg-[#06090f] flex items-center justify-center p-6 z-50">
        <div className="max-w-md text-center">
          <div className="text-4xl mb-4">&#x2728;</div>
          <h2 className="text-xl font-bold mb-2" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            Your Chart is Saved!
          </h2>
          <p className="text-slate-400 mb-8">Explore your personal astrology intelligence.</p>

          <div className="grid grid-cols-1 gap-3">
            <Link
              href="/dashboard"
              className="bg-purple-600 hover:bg-purple-500 text-white rounded-lg px-6 py-3 text-sm font-medium transition-colors no-underline text-center"
            >
              View Dashboard
            </Link>
            <Link
              href="/reports"
              className="bg-[#0a0f1a] border border-white/10 hover:border-purple-500/30 text-slate-300 rounded-lg px-6 py-3 text-sm transition-colors no-underline text-center"
            >
              Generate Report
            </Link>
            <Link
              href="/charts"
              className="bg-[#0a0f1a] border border-white/10 hover:border-purple-500/30 text-slate-300 rounded-lg px-6 py-3 text-sm transition-colors no-underline text-center"
            >
              Explore Charts
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return null
}
