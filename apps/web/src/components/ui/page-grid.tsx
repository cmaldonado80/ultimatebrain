interface PageGridProps {
  cols?: '2' | '3' | '4' | '6' | 'auto'
  gap?: 'sm' | 'md'
  className?: string
  children: React.ReactNode
}

const COLS_MAP: Record<string, string> = {
  '2': 'grid grid-cols-1 lg:grid-cols-2',
  '3': 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  '4': 'grid grid-cols-2 md:grid-cols-4',
  '6': 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6',
  auto: 'grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]',
}

const GAP_MAP: Record<string, string> = {
  sm: 'gap-2',
  md: 'gap-3',
}

export function PageGrid({ cols = 'auto', gap = 'md', className, children }: PageGridProps) {
  const colsCls = COLS_MAP[cols] ?? COLS_MAP.auto
  const gapCls = GAP_MAP[gap] ?? GAP_MAP.md

  return <div className={`${colsCls} ${gapCls} ${className ?? ''}`}>{children}</div>
}
