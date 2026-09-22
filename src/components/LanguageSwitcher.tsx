import { Globe } from 'lucide-react'
import { LANGUAGES, useI18n } from '@/lib/i18n'
import { cn } from '@/lib/cn'

/**
 * EN / FR.
 *
 * The talent side is fully translated; the production studio is not yet, so the
 * switcher says it rather than letting someone discover it screen by screen.
 */
export function LanguageSwitcher({
  className,
  compact,
}: {
  className?: string
  compact?: boolean
}) {
  const { lang, setLang, t } = useI18n()

  return (
    <div
      className={cn('inline-flex items-center gap-1.5', className)}
      role="radiogroup"
      aria-label={t('lang.label')}
    >
      {!compact && <Globe className="h-3.5 w-3.5 text-muted" aria-hidden />}
      <div className="inline-flex gap-0.5 rounded-btn bg-paper p-0.5">
        {LANGUAGES.map((language) => {
          const active = language.value === lang
          return (
            <button
              key={language.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={language.native}
              onClick={() => setLang(language.value)}
              className={cn(
                'min-h-[32px] rounded-inner px-2.5 text-[12px] font-bold transition-colors',
                active ? 'bg-ink text-white' : 'text-muted hover:text-ink',
              )}
            >
              {language.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
