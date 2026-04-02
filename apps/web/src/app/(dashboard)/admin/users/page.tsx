'use client'

/**
 * Admin — All Users
 * Platform owner only. Read-only view of all platform users.
 */

import Link from 'next/link'
import { useEffect } from 'react'

import { useActiveOrg } from '../../../../hooks/use-active-org'
import { trpc } from '../../../../utils/trpc'

function PlatformOwnerBanner() {
  return (
    <div className="bg-neon-yellow/10 border border-neon-yellow/30 text-neon-yellow text-[11px] px-4 py-2 rounded-lg mb-5 flex items-center gap-2">
      <span>⚠</span>
      <span className="font-mono">Platform Owner Mode — elevated access active</span>
    </div>
  )
}

export default function AdminUsersPage() {
  const { isPlatformOwner, isLoading } = useActiveOrg()

  useEffect(() => {
    if (!isLoading && !isPlatformOwner) {
      window.location.href = '/'
    }
  }, [isPlatformOwner, isLoading])

  const usersQuery = trpc.admin.listAllUsers.useQuery(undefined, {
    enabled: isPlatformOwner,
    staleTime: 60_000,
  })

  const users = usersQuery.data ?? []

  if (isLoading || !isPlatformOwner) {
    return <div className="p-6 text-slate-500 text-sm font-mono">Checking access...</div>
  }

  return (
    <div className="p-6 max-w-[900px] text-slate-50">
      <PlatformOwnerBanner />

      <div className="flex items-center justify-between mb-6">
        <h2 className="m-0 text-[22px] font-bold font-orbitron">All Users</h2>
        <div className="flex items-center gap-3">
          <div className="text-[12px] text-slate-500 font-mono">{users.length} total</div>
          <Link
            href="/admin/orgs"
            className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← All Orgs
          </Link>
        </div>
      </div>

      {usersQuery.isLoading ? (
        <div className="text-slate-500 text-sm font-mono">Loading...</div>
      ) : users.length === 0 ? (
        <div className="cyber-card p-6 text-center text-slate-500 text-sm">No users found.</div>
      ) : (
        <div className="cyber-card overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">
                  Email
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">
                  Name
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">
                  Joined
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-white/5 hover:bg-white/3 last:border-0"
                >
                  <td className="px-4 py-2.5 text-slate-200">{user.email}</td>
                  <td className="px-4 py-2.5 text-slate-400">{user.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500 font-mono text-[10px]">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
