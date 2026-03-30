interface SectionCardProps {
  title?: string
  variant?: 'standard' | 'highlighted' | 'warning' | 'error' | 'intelligence'
  padding?: 'sm' | 'md' | 'lg'
  className?: string
  children: React.ReactNode
}

const VARIANT_CLASSES: Record<string, string> = {
  standard: 'cyber-card',
  highlighted: 'cyber-card border-neon-blue/30 shadow-[0_0_20px_rgba(0,212,255,0.05)]',
  warning: 'cyber-card border-neon-yellow/30 bg-neon-yellow/[0.02]',
  error: 'cyber-card border-neon-red/30 bg-neon-red/[0.02]',
  intelligence: 'cyber-card border-neon-purple/30 bg-neon-purple/[0.02]',
}

const PADDING_CLASSES: Record<string, string> = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

export function SectionCard({
  title,
  variant = 'standard',
  padding = 'md',
  className,
  children,
}: SectionCardProps) {
  const variantCls = VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.standard
  const paddingCls = PADDING_CLASSES[padding] ?? PADDING_CLASSES.md

  return (
    <div className={`${variantCls} ${paddingCls} ${className ?? ''}`}>
      {title && <h3 className="text-sm font-orbitron text-white mb-3">{title}</h3>}
      {children}
    </div>
  )
}
