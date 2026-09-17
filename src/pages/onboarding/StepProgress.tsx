import { cn } from '@/lib/cn'

/** Segmented progress bar — one dash per step, filled up to the current one. */
export function StepProgress({
  total,
  current,
  className,
}: {
  total: number
  /** 1-based. */
  current: number
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2', className)} aria-hidden>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-[3px] w-14 rounded-full transition-colors',
            index < current ? 'bg-ink' : 'bg-line',
          )}
        />
      ))}
    </div>
  )
}
