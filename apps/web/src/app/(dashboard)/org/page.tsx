'use client'

/**
 * Organization Settings — manage org details and members.
 */

import { useState } from 'react'

import { PageHeader } from '../../../components/ui/page-header'
import { PermissionGate } from '../../../components/ui/permission-gate'
import { trpc } from '../../../utils/trpc'

export default function OrgPage() {
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState<'admin' | 'operator' | 'viewer'>('operator')

  const orgsQuery = trpc.organizations.list.useQuery()
  const utils = trpc.useUtils()

  const activeOrg = orgsQuery.data?.find((o) => o.isActive)
  const membersQuery = trpc.organizations.getMembers.useQuery(
    { organizationId: activeOrg?.id ?? '' },
    { enabled: !!activeOrg },
  )

  const createOrgMut = trpc.organizations.create.useMutation({
    onSuccess: () => utils.organizations.list.invalidate(),
  })
  const addMemberMut = trpc.organizations.addMember.useMutation({
    onSuccess: () => {
      utils.organizations.getMembers.invalidate()
      setAddEmail('')
    },
  })
  const updateRoleMut = trpc.organizations.updateMemberRole.useMutation({
    onSuccess: () => utils.organizations.getMembers.invalidate(),
  })
  const removeMemberMut = trpc.organizations.removeMember.useMutation({
    onSuccess: () => utils.organizations.getMembers.invalidate(),
  })

  const members = membersQuery.data ?? []

  return (
    <div className="p-6 text-slate-50 max-w-[800px]">
      <PageHeader title="Organization" />

      {/* Org Switcher */}
      {orgsQuery.data && orgsQuery.data.length > 0 && (
        <div className="cyber-card p-4 mb-4">
          <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
            Your Organizations
          </div>
          <div className="flex flex-col gap-1.5">
            {orgsQuery.data.map((org) => (
              <div
                key={org.id}
                className={`flex items-center gap-3 rounded px-3 py-2 text-[13px] ${
                  org.isActive
                    ? 'bg-neon-teal/10 border border-neon-teal/30'
                    : 'bg-bg-elevated border border-transparent'
                }`}
              >
                <span className="text-slate-200 font-medium flex-1">{org.name}</span>
                <span className="text-[10px] text-slate-500 font-mono">{org.slug}</span>
                <span className="text-[10px] text-neon-blue">{org.role}</span>
                {org.isActive && (
                  <span className="text-[9px] text-neon-green font-semibold uppercase">Active</span>
                )}
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded ${
                    org.status === 'active'
                      ? 'bg-neon-green/10 text-neon-green'
                      : 'bg-neon-red/10 text-neon-red'
                  }`}
                >
                  {org.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Org Members */}
      {activeOrg && (
        <div className="cyber-card p-4 mb-4">
          <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
            Members ({members.length})
          </div>

          {/* Member list */}
          <div className="flex flex-col gap-1 mb-3">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 bg-bg-elevated rounded px-2.5 py-1.5"
              >
                <span className="text-[12px] text-slate-300 flex-1">{m.email}</span>
                {m.name && <span className="text-[11px] text-slate-500">{m.name}</span>}
                <PermissionGate
                  require="admin"
                  fallback={<span className="text-[9px] text-neon-blue font-mono">{m.role}</span>}
                >
                  <select
                    className="cyber-select text-[10px] py-0.5 px-1.5 w-[90px]"
                    value={m.role}
                    onChange={(e) =>
                      updateRoleMut.mutate({
                        memberId: m.id,
                        role: e.target.value as 'admin' | 'operator' | 'viewer',
                      })
                    }
                    disabled={m.role === 'owner'}
                  >
                    <option value="owner" disabled>
                      owner
                    </option>
                    <option value="admin">admin</option>
                    <option value="operator">operator</option>
                    <option value="viewer">viewer</option>
                  </select>
                </PermissionGate>
                <PermissionGate require="admin">
                  {m.role !== 'owner' && (
                    <button
                      className="text-[10px] text-neon-red/50 hover:text-neon-red"
                      onClick={() => removeMemberMut.mutate({ memberId: m.id })}
                    >
                      Remove
                    </button>
                  )}
                </PermissionGate>
              </div>
            ))}
          </div>

          {/* Add member form — admin+ only */}
          <PermissionGate require="admin">
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
                  if (addEmail.trim() && activeOrg) {
                    addMemberMut.mutate({
                      organizationId: activeOrg.id,
                      email: addEmail.trim(),
                      role: addRole,
                    })
                  }
                }}
                disabled={addMemberMut.isPending || !addEmail.trim()}
              >
                Add
              </button>
            </div>
          </PermissionGate>

          {(addMemberMut.error || updateRoleMut.error || removeMemberMut.error) && (
            <div className="text-[11px] text-neon-red mt-2">
              {addMemberMut.error?.message ??
                updateRoleMut.error?.message ??
                removeMemberMut.error?.message}
            </div>
          )}
        </div>
      )}

      {/* Create New Org */}
      <div className="cyber-card p-4">
        <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wide mb-2.5">
          Create Organization
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const form = new FormData(e.currentTarget)
            const name = (form.get('name') as string)?.trim()
            const slug = (form.get('slug') as string)?.trim()
            if (name && slug) {
              createOrgMut.mutate({ name, slug })
              e.currentTarget.reset()
            }
          }}
        >
          <input className="cyber-input flex-1 text-[12px]" placeholder="Name" name="name" />
          <input
            className="cyber-input w-[150px] text-[12px]"
            placeholder="slug"
            name="slug"
            pattern="[a-z0-9-]+"
          />
          <button
            className="cyber-btn-primary text-[11px] px-3"
            disabled={createOrgMut.isPending}
            type="submit"
          >
            Create
          </button>
        </form>
        {createOrgMut.error && (
          <div className="text-[11px] text-neon-red mt-2">{createOrgMut.error.message}</div>
        )}
      </div>
    </div>
  )
}
