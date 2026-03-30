'use client'

import { useActiveOrg } from '../../hooks/use-active-org'

/**
 * PermissionGate — conditionally renders children based on the user's org role.
 *
 * Default mode is 'hide' — viewers see nothing.
 * Use mode='disable' to render children but wrapped in a disabled container.
 *
 * Role hierarchy: viewer < operator < admin < owner < platform_owner
 */

type RequiredRole = 'operator' | 'admin' | 'owner' | 'platform_owner'

interface PermissionGateProps {
  require: RequiredRole
  children: React.ReactNode
  fallback?: React.ReactNode
  mode?: 'hide' | 'disable'
}

function meetsRequirement(required: RequiredRole, role: string, isPlatformOwner: boolean): boolean {
  if (isPlatformOwner) return true
  switch (required) {
    case 'operator':
      return ['owner', 'admin', 'operator'].includes(role)
    case 'admin':
      return ['owner', 'admin'].includes(role)
    case 'owner':
      return role === 'owner'
    case 'platform_owner':
      return false // Only isPlatformOwner flag counts
  }
}

export function PermissionGate({
  require,
  children,
  fallback = null,
  mode = 'hide',
}: PermissionGateProps) {
  const { role, isPlatformOwner, isLoading } = useActiveOrg()

  // While loading, render nothing to avoid flash of unauthorized content
  if (isLoading) return null

  const allowed = meetsRequirement(require, role, isPlatformOwner)

  if (!allowed) {
    return <>{fallback}</>
  }

  if (mode === 'disable') {
    return (
      <div className="pointer-events-none opacity-40 select-none" aria-disabled="true">
        {children}
      </div>
    )
  }

  return <>{children}</>
}
