'use client'

/**
 * Onboarding Wizard — Guided corporation setup for new users.
 *
 * Step 1: Name your corporation + set mission
 * Step 2: Choose a domain (pick a template)
 * Step 3: Domain project created — success
 * Step 4: Set budget limits
 * Step 5: Ready to go — links to CEO dashboard
 */

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { PageHeader } from '../../../components/ui/page-header'
import { SectionCard } from '../../../components/ui/section-card'
import { StatusBadge } from '../../../components/ui/status-badge'
import { trpc } from '../../../utils/trpc'

const TEMPLATES = [
  {
    id: 'design',
    name: 'Design',
    icon: '◈',
    desc: 'Creative direction, UX research, UI design, interaction design, and accessibility.',
  },
  {
    id: 'engineering',
    name: 'Engineering',
    icon: '⚙',
    desc: 'Backend, frontend, DevOps, and QA for building and shipping software products.',
  },
  {
    id: 'astrology',
    name: 'Astrology',
    icon: '☉',
    desc: 'Chart interpretation, transit tracking, sports analytics, and business forecasting.',
  },
  {
    id: 'hospitality',
    name: 'Hospitality',
    icon: '🏨',
    desc: 'Hotel operations, F&B management, revenue optimization, and guest experience.',
  },
  {
    id: 'healthcare',
    name: 'Healthcare',
    icon: '🏥',
    desc: 'Compliance analysis, medical IP counsel, and clinical review.',
  },
  {
    id: 'marketing',
    name: 'Marketing',
    icon: '📣',
    desc: 'Campaign orchestration, analytics, and content creation.',
  },
  {
    id: 'soc-ops',
    name: 'Security Operations',
    icon: '🛡',
    desc: 'SOC analysis, incident response, and threat hunting.',
  },
] as const

type Step = 1 | 2 | 3 | 4 | 5

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [corpName, setCorpName] = useState('My AI Corporation')
  const [mission, setMission] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [createdDomain, setCreatedDomain] = useState<{
    id: string
    name: string
    domain: string
  } | null>(null)
  const [budgetDaily, setBudgetDaily] = useState('10')
  const [budgetMonthly, setBudgetMonthly] = useState('200')

  const createProjectMutation = trpc.projects.create.useMutation({
    onSuccess: (data) => {
      const result = data as { id: string; name: string; domain: string | null }
      setCreatedDomain({
        id: result.id,
        name: result.name,
        domain: result.domain ?? selectedTemplate ?? 'domain',
      })
      setStep(3)
    },
  })

  const setBudgetMutation = trpc.platform.setBudget.useMutation({
    onSuccess: () => setStep(5),
  })

  const progress = (step / 5) * 100

  return (
    <div className="p-6 text-slate-50 max-w-2xl mx-auto">
      <PageHeader title="Welcome to Solarc Brain" subtitle="Let's set up your AI Corporation" />

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex justify-between text-[10px] text-slate-500 mb-1">
          <span>Step {step} of 5</span>
          <span>{progress.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 bg-bg-deep rounded-full">
          <div
            className="h-full bg-neon-teal rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Step 1: Corporation Name + Mission */}
      {step === 1 && (
        <SectionCard title="Step 1: Name Your Corporation">
          <div className="space-y-4">
            <div>
              <label className="text-[10px] text-slate-500 uppercase block mb-1">
                Corporation Name
              </label>
              <input
                type="text"
                value={corpName}
                onChange={(e) => setCorpName(e.target.value)}
                className="w-full bg-bg-elevated border border-border-dim rounded px-3 py-2 text-sm text-slate-200 focus:border-neon-teal focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase block mb-1">
                Corporation Mission
              </label>
              <textarea
                value={mission}
                onChange={(e) => setMission(e.target.value)}
                placeholder="What does your AI corporation aim to achieve? (e.g., 'Build the best sports astrology prediction platform')"
                className="w-full bg-bg-elevated border border-border-dim rounded px-3 py-2 text-sm text-slate-200 focus:border-neon-teal focus:outline-none h-24 resize-none"
              />
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={!corpName.trim()}
              className="cyber-btn-primary cyber-btn-sm w-full disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </SectionCard>
      )}

      {/* Step 2: Choose a Domain */}
      {step === 2 && (
        <SectionCard title="Step 2: Choose a Domain">
          <p className="text-[11px] text-slate-400 mb-4">
            Pick a domain for your corporation. The corporation&apos;s teams will build products for
            it.
          </p>
          <div className="space-y-2 mb-4">
            {TEMPLATES.map((t) => (
              <div
                key={t.id}
                className={`p-3 rounded cursor-pointer transition-colors ${
                  selectedTemplate === t.id
                    ? 'bg-neon-teal/10 border border-neon-teal'
                    : 'bg-bg-deep border border-transparent hover:border-border-dim'
                }`}
                onClick={() => setSelectedTemplate(t.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{t.icon}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-[10px] text-slate-500">{t.desc}</div>
                  </div>
                  {selectedTemplate === t.id && <StatusBadge label="Selected" color="teal" />}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="cyber-btn-secondary cyber-btn-sm flex-1">
              Back
            </button>
            <button
              onClick={() => {
                if (!selectedTemplate) return
                const tpl = TEMPLATES.find((t) => t.id === selectedTemplate)
                createProjectMutation.mutate({
                  name: tpl?.name ?? selectedTemplate,
                  domain: tpl?.id ?? selectedTemplate,
                  goal: tpl?.desc ?? '',
                  icon: tpl?.icon ?? '',
                  status: 'active',
                })
              }}
              disabled={!selectedTemplate || createProjectMutation.isPending}
              className="cyber-btn-primary cyber-btn-sm flex-1 disabled:opacity-50"
            >
              {createProjectMutation.isPending ? 'Creating...' : 'Create Domain'}
            </button>
          </div>
          {createProjectMutation.isError && (
            <div className="text-xs text-neon-red mt-2">{createProjectMutation.error.message}</div>
          )}
        </SectionCard>
      )}

      {/* Step 3: Domain Created */}
      {step === 3 && createdDomain && (
        <SectionCard title="Step 3: Domain Created">
          <div className="bg-neon-green/10 border border-neon-green/30 rounded p-4 mb-4">
            <div className="text-neon-green font-medium">Domain Ready!</div>
            <div className="text-sm text-slate-300 mt-1">
              Your {createdDomain.name} domain is ready! The corporation&apos;s teams will build
              products for it.
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mb-4">
            Work can now be organized under this domain. Teams will pick up tickets and create
            artifacts scoped to this domain automatically.
          </p>
          <button onClick={() => setStep(4)} className="cyber-btn-primary cyber-btn-sm w-full">
            Set Budget
          </button>
        </SectionCard>
      )}

      {/* Step 4: Budget */}
      {step === 4 && createdDomain && (
        <SectionCard title="Step 4: Set Spending Limits">
          <p className="text-[11px] text-slate-400 mb-4">
            Control how much your domain can spend on AI model calls per day and month.
          </p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[10px] text-slate-500 uppercase block mb-1">
                Daily Limit (USD)
              </label>
              <input
                type="number"
                value={budgetDaily}
                onChange={(e) => setBudgetDaily(e.target.value)}
                className="w-full bg-bg-elevated border border-border-dim rounded px-3 py-2 text-sm text-slate-200 focus:border-neon-teal focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase block mb-1">
                Monthly Limit (USD)
              </label>
              <input
                type="number"
                value={budgetMonthly}
                onChange={(e) => setBudgetMonthly(e.target.value)}
                className="w-full bg-bg-elevated border border-border-dim rounded px-3 py-2 text-sm text-slate-200 focus:border-neon-teal focus:outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(5)} className="cyber-btn-secondary cyber-btn-sm flex-1">
              Set Later
            </button>
            <button
              onClick={() => {
                setBudgetMutation.mutate({
                  entityId: createdDomain.id,
                  dailyLimitUsd: Number(budgetDaily) || undefined,
                  monthlyLimitUsd: Number(budgetMonthly) || undefined,
                })
              }}
              disabled={setBudgetMutation.isPending}
              className="cyber-btn-primary cyber-btn-sm flex-1 disabled:opacity-50"
            >
              {setBudgetMutation.isPending ? 'Saving...' : 'Set Budget'}
            </button>
          </div>
        </SectionCard>
      )}

      {/* Step 5: Ready */}
      {step === 5 && (
        <SectionCard title="Your Corporation is Ready!">
          <div className="text-center py-6">
            <div className="text-4xl mb-4">🏢</div>
            <div className="text-xl font-bold text-neon-teal mb-2">{corpName}</div>
            {mission && (
              <div className="text-sm text-slate-400 italic mb-4">&quot;{mission}&quot;</div>
            )}
            <p className="text-[11px] text-slate-400 mb-6">
              Your AI corporation is operational. Domains are configured, budgets are set, and
              agents are ready to receive work. Start by giving the CEO a task.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => router.push('/ceo')}
                className="cyber-btn-primary cyber-btn-sm"
              >
                Go to CEO Dashboard
              </button>
              <button
                onClick={() => router.push('/org-chart')}
                className="cyber-btn-secondary cyber-btn-sm"
              >
                View Org Chart
              </button>
              <button
                onClick={() => router.push('/chat')}
                className="cyber-btn-secondary cyber-btn-sm"
              >
                Chat with Agents
              </button>
              <button
                onClick={() => router.push('/domains')}
                className="cyber-btn-secondary cyber-btn-sm"
              >
                Browse Domains
              </button>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  )
}
