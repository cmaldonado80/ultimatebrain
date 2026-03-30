'use client'

interface FilterPillsProps<T extends string> {
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  labels?: Partial<Record<T, string>>
  className?: string
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  labels,
  className,
}: FilterPillsProps<T>) {
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className ?? ''}`}>
      {options.map((option) => {
        const isActive = option === value
        const label = labels?.[option] ?? capitalize(option)
        return (
          <button
            key={option}
            onClick={() => onChange(option)}
            className={`text-[10px] px-2.5 py-1 rounded transition-colors cursor-pointer border-none ${
              isActive
                ? 'bg-neon-teal/10 text-neon-teal ring-1 ring-neon-teal/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
