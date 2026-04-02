'use client'

/**
 * Admin — Org Detail
 * Platform owner only. Inspect any org and impersonate it.
 */

import Link from 'next/link'
import { use, useEffect } from 'react'

import { useActiveOrg } from '../../../../../hooks/use-active-org'
import { trpc } from '../../../../../utils/trpc'

function PlatformOwnerBanner() {
  return (
    <div className="bg-neon-yellow/10 border border-neon-yellow/30 text-neon-yellow text-[11px] px-4 py-2 rounded-lg mb-5 flex items-center gap-2">
      <span>⚠</span>
      <span className="font-mono">Platform Owner Mode — elevated access active</span>
    </div>
  )
}

export default function AdminOrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { isPlatformOwner, isLoading, switchOrg } = useActiveOrg()

  useEffect(() => {
    if (!isLoading && !isPlatformOwner) {
      window.location.href = '/'
    }
  }, [isPlatformOwner, isLoading])

  const orgQuery = trpc.admin.getOrgById.useQuery({ id }, { enabled: isPlatformOwner && !!id })
  const membersQuery = trpc.admin.listOrgMembers.useQuery(
    { organizationId: id },
    { enabled: isPlatformOwner && !!id },
  )

  if (isLoading || !isPlatformOwner) {
    return <div className="p-6 text-slate-500 text-sm font-mono">Checking access...</div>
  }

  if (orgQuery.isLoading) {
    return <div className="p-6 text-slate-500 text-sm font-mono">Loading organization...</div>
  }

  const org = orgQuery.data
  if (!org) {
    return (
      <div className="p-6 text-slate-400">
        Organization not found.{' '}
        <Link href="/admin/orgs" className="text-neon-teal hover:underline">
          Back to all orgs
        </Link>
      </div>
    )
  }

  const members = membersQuery.data ?? []

  return (
    <div className="p-6 max-w-[900px] text-slate-50">
      <PlatformOwnerBanner />

      <div className="flex items-center gap-3 mb-1">
        <Link href="/admin/orgs" className="text-[11px] text-slate-500 hover:text-slate-300">
          ← All Organizations
        </Link>
      </div>

      <h2 className="text-[22px] font-bold font-orbitron mb-6">{org.name}</h2>

      {/* Org Info */}
      <div className="cyber-card p-4 mb-4">
        <div className="text-[12px] font-bold text-slate-400 uppercase tracking-wide mb-3">
          Organization Info
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
          <div>
            <span className="text-slate-500">ID: </span>
            <span className="font-mono text-slate-300">{org.id}</span>
          </div>
          <div>
            <span className="text-slate-500">Slug: </span>
            <span className="font-mono text-slate-300">{org.slug}</span>
          </div>
          <div>
            <span className="text-slate-500">Status: </span>
            <span
              className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                org.status === 'active'
                  ? 'bg-neon-green/10 text-neon-green'
                  : 'bg-neon-red/10 text-neon-red'
              }`}
            >
              {org.status}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Created: </span>
            <span className="font-mono text-slate-300">
              {new Date(org.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* Members */}
      <div className="cyber-card p-4 mb-4">
        <div className="text-[12px] font-bold text-slate-400 uppercase tracking-wide mb-3">
          Members ({members.length})
        </div>
        {membersQuery.isLoading ? (
          <div className="text-[11px] text-slate-600">Loading...</div>
        ) : members.length === 0 ? (
          <div className="text-[11px] text-slate-600">No members.</div>
        ) : (
          <div className="flex flex-col gap-1">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 bg-bg-elevated rounded px-2.5 py-1.5"
              >
                <span className="text-[12px] text-slate-300 flex-1">{m.email}</span>
                {m.name && <span className="text-[10px] text-slate-500">{m.name}</span>}
                <span className="text-[9px] text-neon-blue font-mono px-1.5 py-0.5 rounded bg-neon-blue/10">
                  {m.role}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Impersonate */}
      <div className="cyber-card p-4">
        <div className="text-[12px] font-bold text-slate-400 uppercase tracking-wide mb-2">
          Switch Context
        </div>
        <p className="text-[11px] text-slate-500 mb-3">
          Set this organization as your active context to inspect its resources in the normal UI.
        </p>
        <button
          className="cyber-btn-primary text-[11px] px-4 py-2"
          onClick={() => switchOrg(org.id)}
        >
          Switch to {org.name} →
        </button>
      </div>
    </div>
  )
}
