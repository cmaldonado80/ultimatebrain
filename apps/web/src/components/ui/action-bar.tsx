interface ActionBarProps {
  children: React.ReactNode
  className?: string
}

export function ActionBar({ children, className }: ActionBarProps) {
  return <div className={`flex items-center gap-2 flex-wrap ${className ?? ''}`}>{children}</div>
}
