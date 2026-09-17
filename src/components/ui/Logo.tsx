import { cn } from '@/lib/cn'
import { asset } from '@/lib/asset'

type LogoProps = {
  /** Show only the 3-square mark, without the wordmark. */
  markOnly?: boolean
  /** Pixel height of the mark; wordmark scales to match. */
  size?: number
  /** Wordmark colour — `light` for dark surfaces. */
  tone?: 'dark' | 'light'
  className?: string
}

export function Logo({ markOnly = false, size = 26, tone = 'dark', className }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <img
        src={asset('/logo-mark.svg')}
        alt="Let It Cast mark"
        width={size}
        height={size}
        style={{ display: 'block' }}
      />
      {!markOnly && (
        <span
          className={cn(
            'whitespace-nowrap font-display font-extrabold lowercase tracking-[-0.03em]',
            tone === 'light' ? 'text-white' : 'text-ink',
          )}
          style={{ fontSize: size * 0.8, lineHeight: 1 }}
        >
          let it cast
        </span>
      )}
    </span>
  )
}
