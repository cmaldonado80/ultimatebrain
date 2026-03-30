'use client'

/**
 * Instincts — behavioral pattern learning with confidence scoring and scope promotion.
 */

import { useState } from 'react'

import { DbErrorBanner } from '../../../components/db-error-banner'
import { OrgBadge } from '../../../components/ui/org-badge'
import { trpc } from '../../../utils/trpc'

export default function InstinctsPage() {
  const [scopeFilter, setScopeFilter] = useState<string>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [newTrigger, setNewTrigger] = useState('')
  const [newAction, setNewAction] = useState('')
  const [newScope, setNewScope] = useState<'development' | 'mini_brain' | 'brain'>('development')

  const instinctsQuery = trpc.instincts.list.useQuery(
    scopeFilter === 'all' ? {} : { scope: scopeFilter as 'development' | 'mini_brain' | 'brain' },
  )
  const utils = trpc.useUtils()

  const createMut = trpc.instincts.create.useMutation({
    onSuccess: () => {
      utils.instincts.list.invalidate()
      setShowCreate(false)
      setNewTrigger('')
      setNewAction('')
    },
  })

  const deleteMut = trpc.instincts.delete.useMutation({
    onSuccess: () => utils.instincts.list.invalidate(),
  })

  if (instinctsQuery.error) {
    return (
      <div className="p-6">
        <DbErrorBanner error={instinctsQuery.error} />
      </div>
    )
  }

  const instinctsList = (instinctsQuery.data ?? []) as Array<{
    id: string
    trigger: string
    action: string
    domain: string
    scope: string
    confidence: number
    createdAt?: string | Date
  }>

  const scopeColors: Record<string, string> = {
    development: 'bg-emerald-500/20 text-emerald-300',
    mini_brain: 'bg-sky-500/20 text-sky-300',
    brain: 'bg-violet-500/20 text-violet-300',
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h1 className="text-2xl font-orbitron text-neon-teal">Instincts</h1>
            <OrgBadge />
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Learned trigger&rarr;action patterns &mdash; {instinctsList.length} instincts
          </p>
        </div>
        <button
          className="cyber-btn-primary text-sm px-3 py-1.5"
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? 'Cancel' : '+ New Instinct'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="cyber-card p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-500 uppercase">Trigger</label>
              <input
                className="cyber-input w-full mt-1"
                placeholder="When this happens..."
                value={newTrigger}
                onChange={(e) => setNewTrigger(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 uppercase">Action</label>
              <input
                className="cyber-input w-full mt-1"
                placeholder="Do this..."
                value={newAction}
                onChange={(e) => setNewAction(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 uppercase">Scope</label>
              <select
                className="cyber-input w-full mt-1"
                value={newScope}
                onChange={(e) => setNewScope(e.target.value as typeof newScope)}
              >
                <option value="development">Development</option>
                <option value="mini_brain">Mini Brain</option>
                <option value="brain">Brain</option>
              </select>
            </div>
          </div>
          <button
            className="cyber-btn-primary text-sm px-4 py-1.5"
            disabled={!newTrigger || !newAction || createMut.isPending}
            onClick={() =>
              createMut.mutate({ trigger: newTrigger, action: newAction, scope: newScope })
            }
          >
            {createMut.isPending ? 'Creating...' : 'Create Instinct'}
          </button>
        </div>
      )}

      {/* Scope filter */}
      <div className="flex gap-2">
        {['all', 'development', 'mini_brain', 'brain'].map((s) => (
          <button
            key={s}
            onClick={() => setScopeFilter(s)}
            className={`cyber-btn-secondary text-xs px-3 py-1.5 ${
              scopeFilter === s ? 'ring-1 ring-neon-teal text-neon-teal' : ''
            }`}
          >
            {s === 'all' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Instincts list */}
      {instinctsQuery.isLoading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="text-lg font-orbitron text-slate-500">Loading instincts...</div>
        </div>
      ) : instinctsList.length === 0 ? (
        <div className="cyber-card p-8 text-center text-slate-500">
          No instincts found. Create one or let agents learn patterns automatically.
        </div>
      ) : (
        <div className="grid gap-3">
          {instinctsList.map((inst) => (
            <div key={inst.id} className="cyber-card p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`cyber-badge text-xs ${scopeColors[inst.scope] ?? 'bg-slate-500/20 text-slate-400'}`}
                    >
                      {inst.scope.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-slate-500">{inst.domain}</span>
                    <span className="text-xs text-slate-500">&middot;</span>
                    <span className="text-xs text-slate-400">
                      confidence:{' '}
                      <strong className="text-neon-teal">
                        {(inst.confidence * 100).toFixed(0)}%
                      </strong>
                    </span>
                  </div>
                  <div className="text-sm text-slate-300">
                    <span className="text-slate-500">When:</span> {inst.trigger}
                  </div>
                  <div className="text-sm text-slate-300 mt-0.5">
                    <span className="text-slate-500">Then:</span> {inst.action}
                  </div>
                </div>
                <button
                  className="cyber-btn-danger text-xs px-2 py-1 ml-3 shrink-0"
                  onClick={() => {
                    if (confirm('Delete this instinct?')) {
                      deleteMut.mutate({ id: inst.id })
                    }
                  }}
                  disabled={deleteMut.isPending}
                >
                  Delete
                </button>
              </div>
              {/* Confidence bar */}
              <div className="mt-2 h-1 bg-bg-deep rounded-full overflow-hidden">
                <div
                  className="h-full bg-neon-teal rounded-full transition-all"
                  style={{ width: `${inst.confidence * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
