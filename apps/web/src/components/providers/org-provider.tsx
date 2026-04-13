'use client'

/**
 * OrgProvider — single source of truth for active org state.
 *
 * Replaces the 5+ independent `trpc.organizations.list.useQuery()` calls
 * scattered across Topbar, Sidebar, OrgBadge, useOrgRole, etc.
 * All consumers use `useActiveOrg()` instead.
 */

import { usePathname } from 'next/navigation'
import { createContext, useContext, useMemo } from 'react'

import { trpc } from '../../utils/trpc'

// ── Types ──────────────────────────────────────────────────────────────

export interface OrgEntry {
  id: string
  name: string
  slug: string
  status: string
  ownerUserId: string
  createdAt: Date
  updatedAt: Date
  role: string
  isActive: boolean
}

export interface OrgContextValue {
  activeOrg: OrgEntry | null
  allOrgs: OrgEntry[]
  role: string
  isOwner: boolean
  isAdmin: boolean
  isOperator: boolean
  isViewer: boolean
  isPlatformOwner: boolean
  isLoading: boolean
  switchOrg: (orgId: string) => void
  refetch: () => void
}

// ── Context ────────────────────────────────────────────────────────────

const OrgContext = createContext<OrgContextValue | null>(null)

// ── Provider ───────────────────────────────────────────────────────────

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const orgsQuery = trpc.organizations.list.useQuery(undefined, {
    staleTime: 60_000,
  })
  const globalRoleQuery = trpc.organizations.getGlobalRole.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
  })

  const { data: orgsData, isLoading: orgsLoading, refetch: refetchOrgs } = orgsQuery
  const { data: globalRoleData, refetch: refetchGlobalRole } = globalRoleQuery

  const value = useMemo<OrgContextValue>(() => {
    const allOrgs = (orgsData ?? []) as OrgEntry[]
    const activeOrg = allOrgs.find((o) => o.isActive) ?? null
    const role = activeOrg?.role ?? 'viewer'
    const isPlatformOwner = globalRoleData?.isPlatformOwner ?? false

    const switchOrg = (orgId: string) => {
      document.cookie = `active-org=${orgId}; path=/; max-age=31536000; samesite=lax`
      // If on a resource detail route (contains a UUID segment), navigate to parent collection
      const uuidPattern = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/.*)?$/
      if (uuidPattern.test(pathname)) {
        const parentPath = pathname.replace(uuidPattern, '') || '/'
        window.location.href = parentPath
      } else {
        window.location.reload()
      }
    }

    return {
      activeOrg,
      allOrgs,
      role,
      isOwner: role === 'owner' || isPlatformOwner,
      isAdmin: ['owner', 'admin'].includes(role) || isPlatformOwner,
      isOperator: ['owner', 'admin', 'operator'].includes(role) || isPlatformOwner,
      isViewer: true, // Everyone can view
      isPlatformOwner,
      isLoading: orgsLoading,
      switchOrg,
      refetch: () => {
        void refetchOrgs()
        void refetchGlobalRole()
      },
    }
  }, [orgsData, orgsLoading, refetchOrgs, globalRoleData, refetchGlobalRole, pathname])

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

// ── Hook ───────────────────────────────────────────────────────────────

export function useActiveOrg(): OrgContextValue {
  const ctx = useContext(OrgContext)
  if (!ctx) {
    throw new Error('useActiveOrg must be used within OrgProvider')
  }
  return ctx
}
