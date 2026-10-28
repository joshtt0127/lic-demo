import { Sparkles, UserPlus, Users } from 'lucide-react'
import { cn } from '@/lib/cn'
import { SIGNAL_KIND_LABEL, type Signal, type SignalKind } from './reasons'

const ICON: Record<SignalKind, typeof Sparkles> = { talent: Sparkles, team: Users, discovery: UserPlus }

const ACCENT: Record<SignalKind, string> = {
  talent: 'text-link',
  team: 'text-ink/70',
  discovery: 'text-signal-good',
}

/**
 * « Why this audition? », une raison à la fois : ce qu'elle dit, ce qui
 * l'appuie, d'où vient l'information. On ne demande jamais à l'équipe de
 * croire un classement qu'elle ne peut pas lire.
 */
export function SignalCard({ signal, tone = 'light', compact = false }: { signal: Signal; tone?: 'light' | 'dark'; compact?: boolean }) {
  const Icon = ICON[signal.kind]
  const dark = tone === 'dark'
  return (
    <div className={cn(!compact && 'rounded-[14px] border p-3', !compact && (dark ? 'border-white/10 bg-white/[0.04]' : 'border-line bg-paper/60'))}>
      <p className={cn('flex items-center gap-1.5 text-[11px] font-semibold', dark ? 'text-white/75' : ACCENT[signal.kind])}>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {SIGNAL_KIND_LABEL[signal.kind]}
      </p>
      <p className={cn('mt-1 font-semibold leading-snug', compact ? 'text-[13px]' : 'text-[14px]', dark ? 'text-white' : 'text-ink')}>{signal.title}</p>
      {!compact && <p className={cn('mt-1 text-[12.5px] leading-snug', dark ? 'text-white/70' : 'text-ink/75')}>{signal.detail}</p>}
      <p className={cn('mt-1 text-[11px] leading-snug', dark ? 'text-white/40' : 'text-muted')}>{signal.source}</p>
    </div>
  )
}
