import { cn } from '@/lib/cn'

/**
 * Small set of mutually exclusive options — faster to answer than a select and
 * it shows every choice at once (gender, availability, role type…).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  allowClear,
  size = 'md',
  variant = 'segmented',
  className,
}: {
  options: { value: T; label: string }[]
  value: T | null
  onChange: (value: T | null) => void
  /** Clicking the active option clears the answer. */
  allowClear?: boolean
  size?: 'sm' | 'md'
  /**
   * `segmented` — compact track for dense in-app UI.
   * `pills` — separate tiles, the onboarding treatment.
   */
  variant?: 'segmented' | 'pills'
  className?: string
}) {
  const pills = variant === 'pills'

  return (
    <div
      role="radiogroup"
      className={cn(
        'flex flex-wrap',
        pills ? 'gap-2.5' : 'inline-flex gap-1 rounded-btn bg-paper p-1',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(active && allowClear ? null : option.value)}
            className={cn(
              'font-semibold transition-colors',
              pills
                ? [
                    'rounded-field px-5 py-3 text-[15px]',
                    active
                      ? 'bg-ink text-white'
                      : 'bg-[#F1F0EB] text-ink hover:bg-[#E9E7E1]',
                  ]
                : [
                    'rounded-[9px]',
                    size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
                    active ? 'bg-ink text-white' : 'text-muted hover:bg-ink/5 hover:text-ink',
                  ],
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
