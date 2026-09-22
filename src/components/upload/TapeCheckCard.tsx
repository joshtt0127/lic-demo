import { AlertTriangle, Check, Minus } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { formatBytes } from '@/lib/storage'
import { cn } from '@/lib/cn'
import type { TapeCheckRow } from '@/types/database'

/**
 * What was measured on a tape — and nothing else.
 *
 * Every line is a rule with its measured value (see `lib/tapeCheck`): framing,
 * definition, length, light, sound. It is deliberately not a judgement of the
 * performance: that is the human's job, and the AI layer's when it has a key.
 */
export function TapeCheckCard({ check, compact }: { check: TapeCheckRow; compact?: boolean }) {
  const t = useT()

  const sentence = (item: TapeCheckRow['checks'][number]): string => {
    const detail = item.detail ?? {}
    switch (item.key) {
      case 'framing':
        return detail.framing
          ? t(`tape.framing.${detail.framing}`)
          : t('tape.framing.unknown')
      case 'definition':
        return detail.height ? `${detail.width}×${detail.height}` : t('tape.unknown')
      case 'duration':
        return detail.seconds === null || detail.seconds === undefined
          ? t('tape.unknown')
          : t('tape.seconds', { count: Number(detail.seconds) })
      case 'light':
        return detail.brightness === null || detail.brightness === undefined
          ? t('tape.unknown')
          : t('tape.brightness', { percent: Number(detail.brightness) })
      case 'sound':
        return item.ok === null
          ? t('tape.sound.unknown')
          : item.ok
            ? t('tape.sound.present')
            : t('tape.sound.missing')
      default:
        return ''
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-field bg-paper p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="tech-label">{t('tape.title')}</span>
        {check.score !== null && (
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 font-mono text-[12px] font-bold',
              check.score >= 80
                ? 'bg-signal-good-bg text-signal-good'
                : check.score >= 50
                  ? 'bg-signal-maybe/15 text-[#8A6D00]'
                  : 'bg-signal-no/10 text-signal-no',
            )}
          >
            {check.score}/100
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-1.5">
        {check.checks.map((item) => (
          <li key={item.key} className="flex items-start gap-2 text-[13px]">
            <span
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                item.ok === null
                  ? 'bg-line text-muted'
                  : item.ok
                    ? 'bg-signal-good-bg text-signal-good'
                    : 'bg-signal-no/10 text-signal-no',
              )}
            >
              {item.ok === null ? (
                <Minus className="h-3 w-3" />
              ) : item.ok ? (
                <Check className="h-3 w-3" />
              ) : (
                <AlertTriangle className="h-3 w-3" />
              )}
            </span>
            <span className="min-w-0">
              <span className="font-semibold text-ink">{t(`tape.label.${item.key}`)}</span>{' '}
              <span className="text-muted">{sentence(item)}</span>
            </span>
          </li>
        ))}
      </ul>

      {!compact && (
        <p className="text-[11.5px] leading-relaxed text-muted">
          {t('tape.disclaimer')}
          {check.bytes ? ` · ${formatBytes(Number(check.bytes))}` : ''}
        </p>
      )}
    </div>
  )
}
