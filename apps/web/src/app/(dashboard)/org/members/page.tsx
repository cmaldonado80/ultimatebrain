'use client'

/**
 * Organization Members — dedicated member management page.
 */

import { useState } from 'react'

import { OrgBadge } from '../../../../components/ui/org-badge'
import { useOrgRole } from '../../../../hooks/use-org-role'
import { trpc } from '../../../../utils/trpc'

export default function OrgMembersPage() {
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState<'admin' | 'operator' | 'viewer'>('operator')
  const { isAdmin, orgId } = useOrgRole()
  const utils = trpc.useUtils()

  const membersQuery = trpc.organizations.getMembers.useQuery(
    { organizationId: orgId },
    { enabled: !!orgId },
  )

  const addMut = trpc.organizations.addMember.useMutation({
    onSuccess: () => {
      utils.organizations.getMembers.invalidate()
      setAddEmail('')
    },
  })
  const updateRoleMut = trpc.organizations.updateMemberRole.useMutation({
    onSuccess: () => utils.organizations.getMembers.invalidate(),
  })
  const removeMut = trpc.organizations.removeMember.useMutation({
    onSuccess: () => utils.organizations.getMembers.invalidate(),
  })

  const members = membersQuery.data ?? []

  return (
    <div className="p-6 text-slate-50 max-w-[800px]">
      <div className="flex items-center gap-2 mb-6">
        <h2 className="m-0 text-[22px] font-bold font-orbitron">Members</h2>
        <OrgBadge />
        <span className="text-[12px] text-slate-500 ml-auto">{members.length} members</span>
      </div>

      {/* Add member form (admin+ only) */}
      {isAdmin && (
        <div className="cyber-card p-4 mb-4">
          <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
            Add Member
          </div>
          <div className="flex gap-2 items-center">
            <input
              className="cyber-input flex-1 text-[12px]"
              placeholder="Email address..."
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
            />
            <select
              className="cyber-select text-[11px] py-1.5 px-2 w-[100px]"
              value={addRole}
              onChange={(e) => setAddRole(e.target.value as 'admin' | 'operator' | 'viewer')}
            >
              <option value="admin">admin</option>
              <option value="operator">operator</option>
              <option value="viewer">viewer</option>
            </select>
            <button
              className="cyber-btn-primary text-[11px] px-3 py-1.5"
              onClick={() => {
                if (addEmail.trim() && orgId) {
                  addMut.mutate({ organizationId: orgId, email: addEmail.trim(), role: addRole })
                }
              }}
              disabled={addMut.isPending || !addEmail.trim()}
            >
              Add
            </button>
          </div>
          {addMut.error && (
            <div className="text-[11px] text-neon-red mt-2">{addMut.error.message}</div>
          )}
        </div>
      )}

      {/* Member list */}
      <div className="cyber-card p-4">
        <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
          Current Members
        </div>
        {members.length === 0 ? (
          <div className="text-slate-600 text-[13px] py-4 text-center">No members found.</div>
        ) : (
          <div className="flex flex-col gap-1">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2 bg-bg-elevated rounded px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-slate-200 truncate">{m.email}</div>
                  {m.name && <div className="text-[11px] text-slate-500">{m.name}</div>}
                </div>
                <div className="text-[10px] text-slate-600">
                  {new Date(m.joinedAt).toLocaleDateString()}
                </div>
                {isAdmin && m.role !== 'owner' ? (
                  <select
                    className="cyber-select text-[10px] py-0.5 px-1.5 w-[90px]"
                    value={m.role}
                    onChange={(e) =>
                      updateRoleMut.mutate({
                        memberId: m.id,
                        role: e.target.value as 'admin' | 'operator' | 'viewer',
                      })
                    }
                  >
                    <option value="admin">admin</option>
                    <option value="operator">operator</option>
                    <option value="viewer">viewer</option>
                  </select>
                ) : (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded ${
                      m.role === 'owner'
                        ? 'bg-neon-teal/10 text-neon-teal'
                        : m.role === 'admin'
                          ? 'bg-neon-blue/10 text-neon-blue'
                          : 'bg-slate-700/50 text-slate-400'
                    }`}
                  >
                    {m.role}
                  </span>
                )}
                {isAdmin && m.role !== 'owner' && (
                  <button
                    className="text-[10px] text-neon-red/50 hover:text-neon-red"
                    onClick={() => {
                      if (confirm(`Remove ${m.email} from this organization?`)) {
                        removeMut.mutate({ memberId: m.id })
                      }
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {(updateRoleMut.error || removeMut.error) && (
          <div className="text-[11px] text-neon-red mt-2">
            {updateRoleMut.error?.message ?? removeMut.error?.message}
          </div>
        )}
      </div>
    </div>
  )
}
