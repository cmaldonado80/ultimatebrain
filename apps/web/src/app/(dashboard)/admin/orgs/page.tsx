'use client'

/**
 * Admin — All Organizations
 * Platform owner only. Lists every org on the platform.
 */

import Link from 'next/link'
import { useEffect } from 'react'

import { useActiveOrg } from '../../../../hooks/use-active-org'
import { trpc } from '../../../../lib/trpc'

function PlatformOwnerBanner() {
  return (
    <div className="bg-neon-yellow/10 border border-neon-yellow/30 text-neon-yellow text-[11px] px-4 py-2 rounded-lg mb-5 flex items-center gap-2">
      <span>⚠</span>
      <span className="font-mono">Platform Owner Mode — elevated access active</span>
    </div>
  )
}

export default function AdminOrgsPage() {
  const { isPlatformOwner, isLoading } = useActiveOrg()

  useEffect(() => {
    if (!isLoading && !isPlatformOwner) {
      window.location.href = '/'
    }
  }, [isPlatformOwner, isLoading])

  const orgsQuery = trpc.admin.listAllOrgs.useQuery(undefined, {
    enabled: isPlatformOwner,
    staleTime: 30_000,
  })

  const orgs = orgsQuery.data ?? []

  if (isLoading || !isPlatformOwner) {
    return <div className="p-6 text-slate-500 text-sm font-mono">Checking access...</div>
  }

  return (
    <div className="p-6 max-w-[1000px] text-slate-50">
      <PlatformOwnerBanner />

      <div className="flex items-center justify-between mb-6">
        <h2 className="m-0 text-[22px] font-bold font-orbitron">All Organizations</h2>
        <div className="text-[12px] text-slate-500 font-mono">{orgs.length} total</div>
      </div>

      {orgsQuery.isLoading ? (
        <div className="text-slate-500 text-sm font-mono">Loading...</div>
      ) : orgs.length === 0 ? (
        <div className="cyber-card p-6 text-center text-slate-500 text-sm">
          No organizations found.
        </div>
      ) : (
        <div className="cyber-card overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">
                  Name
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">
                  Slug
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">
                  Status
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">
                  Created
                </th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} className="border-b border-white/5 hover:bg-white/3 last:border-0">
                  <td className="px-4 py-2.5 text-slate-200 font-medium">{org.name}</td>
                  <td className="px-4 py-2.5 text-slate-500 font-mono">{org.slug}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                        org.status === 'active'
                          ? 'bg-neon-green/10 text-neon-green'
                          : 'bg-neon-red/10 text-neon-red'
                      }`}
                    >
                      {org.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 font-mono text-[10px]">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/admin/orgs/${org.id}`}
                      className="text-[10px] text-neon-teal hover:underline no-underline"
                    >
                      Inspect →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex gap-3">
        <Link
          href="/admin/users"
          className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          View All Users →
        </Link>
      </div>
    </div>
  )
}
