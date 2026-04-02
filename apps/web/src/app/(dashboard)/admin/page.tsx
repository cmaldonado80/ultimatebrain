'use client'

import { useEffect } from 'react'

import { useActiveOrg } from '../../../hooks/use-active-org'

export default function AdminPage() {
  const { isPlatformOwner, isLoading } = useActiveOrg()

  useEffect(() => {
    if (!isLoading) {
      if (isPlatformOwner) {
        window.location.href = '/admin/orgs'
      } else {
        window.location.href = '/'
      }
    }
  }, [isPlatformOwner, isLoading])

  return <div className="p-6 text-slate-500 text-sm font-mono">Redirecting...</div>
}
