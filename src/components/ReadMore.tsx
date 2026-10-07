import { useLayoutEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/cn'

const CLAMP = { 2: 'line-clamp-2', 3: 'line-clamp-3', 4: 'line-clamp-4' } as const

/**
 * Un texte long replié sur quelques lignes. Le bouton n'apparaît que si le
 * texte déborde vraiment : pas de « Read more » qui ne révèle rien.
 */
export function ReadMore({
  text,
  lines = 3,
  className,
  buttonClassName,
}: {
  text: string
  lines?: keyof typeof CLAMP
  className?: string
  buttonClassName?: string
}) {
  const t = useT()
  const ref = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || open) return
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [text, open])

  return (
    <div>
      <p ref={ref} className={cn(open ? 'whitespace-pre-line' : CLAMP[lines], className)}>
        {text}
      </p>
      {(overflows || open) && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className={cn('mt-1.5 text-[13px] font-semibold underline-offset-4 hover:underline', buttonClassName)}
        >
          {open ? t('common.readLess') : t('common.readMore')}
        </button>
      )}
    </div>
  )
}
