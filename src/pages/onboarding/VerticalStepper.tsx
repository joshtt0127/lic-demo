import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n'

export type StepperItem = {
  label: string
  hint?: string
}

/**
 * The numbered outline of the onboarding, shown beside the form: done steps
 * carry a check, the current one is filled, the rest stay outlined.
 */
export function VerticalStepper({
  items,
  current,
}: {
  items: StepperItem[]
  /** 1-based index of the active step. */
  current: number
}) {
  const t = useT()

  return (
    <ol className="flex flex-col">
      {items.map((item, index) => {
        const position = index + 1
        const done = position < current
        const active = position === current
        const last = index === items.length - 1

        return (
          <li key={item.label} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[13px] font-bold transition-colors',
                  active && 'border-ink bg-ink text-white',
                  done && 'border-line bg-card text-muted',
                  !active && !done && 'border-line bg-transparent text-muted',
                )}
              >
                {done ? <Check className="h-4 w-4 text-ink" /> : position}
              </span>
              {!last && <span className="my-1 w-px flex-1 bg-line" />}
            </div>

            <div className={cn('pb-6', last && 'pb-0')}>
              <span
                className={cn(
                  'flex items-center gap-1.5 text-[15px] font-bold',
                  active || done ? 'text-ink' : 'text-muted',
                )}
              >
                {t(item.label)}
                {done && <Check className="h-3.5 w-3.5 text-ink/60" />}
              </span>
              {item.hint && (
                <span className="mt-0.5 block text-[13px] text-muted">{t(item.hint)}</span>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
