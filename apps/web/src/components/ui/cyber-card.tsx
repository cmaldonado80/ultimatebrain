/**
 * CyberCard — Glassmorphism panel using the .cyber-card design system class.
 */

interface CyberCardProps {
  children: React.ReactNode
  className?: string
  /** Inner padding preset. Defaults to 'p-6'. Pass '' to skip padding. */
  padding?: string
  /** Disable hover glow effect */
  noHover?: boolean
}

export function CyberCard({
  children,
  className = '',
  padding = 'p-6',
  noHover = false,
}: CyberCardProps) {
  return (
    <div
      className={`cyber-card ${noHover ? 'hover:border-border hover:shadow-none' : ''} ${padding} ${className}`}
    >
      {children}
    </div>
  )
}
