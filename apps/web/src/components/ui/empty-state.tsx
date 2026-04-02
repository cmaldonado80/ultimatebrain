/**
 * Shared empty state component for consistent "no data" displays.
 */
export function EmptyState({
  title = 'Nothing here yet',
  description,
  message,
  icon,
  action,
  className,
}: {
  title?: string
  description?: string
  message?: string
  icon?: React.ReactNode | string
  action?: { label: string; href?: string; onClick?: () => void }
  className?: string
}) {
  const desc = description ?? message

  return (
    <div className={`cyber-card p-8 text-center ${className ?? ''}`}>
      {icon && (
        <div className="text-2xl text-slate-600 mb-2">{typeof icon === 'string' ? icon : icon}</div>
      )}
      <div className="text-slate-500 text-sm font-medium mb-1">{title}</div>
      {desc && <p className="text-xs text-slate-600 m-0">{desc}</p>}
      {action && action.href && (
        <a
          href={action.href}
          className="inline-block mt-3 cyber-btn-primary cyber-btn-sm no-underline"
        >
          {action.label}
        </a>
      )}
      {action && !action.href && action.onClick && (
        <button onClick={action.onClick} className="mt-3 cyber-btn-primary cyber-btn-sm">
          {action.label}
        </button>
      )}
    </div>
  )
}
