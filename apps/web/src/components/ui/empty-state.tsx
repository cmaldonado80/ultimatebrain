/**
 * Shared empty state component for consistent "no data" displays.
 */
export function EmptyState({
  title = 'Nothing here yet',
  description,
  action,
}: {
  title?: string
  description?: string
  action?: { label: string; href: string }
}) {
  return (
    <div className="cyber-card p-8 text-center">
      <div className="text-slate-500 text-sm font-medium mb-1">{title}</div>
      {description && <p className="text-xs text-slate-600 m-0">{description}</p>}
      {action && (
        <a
          href={action.href}
          className="inline-block mt-3 cyber-btn-primary cyber-btn-sm no-underline"
        >
          {action.label}
        </a>
      )}
    </div>
  )
}
