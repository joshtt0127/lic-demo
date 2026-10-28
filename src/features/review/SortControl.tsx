import { useState } from 'react'
import { ArrowDown, ArrowDownUp, CalendarClock, ChevronDown, Layers, SortAsc, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { SortDir, SortMode } from './sort'

/**
 * One queue. Four ways to sort (Feature Concept Memo, § 1).
 *
 * Quatre pilules, un clic, et une ligne qui dit ce que fait l'ordre choisi.
 * « Role » n'apparaît que là où il a un sens : sur plusieurs rôles.
 */
const MODES: Record<SortMode, { label: string; icon: typeof Sparkles; explain: (dir: SortDir) => string }> = {
  date: {
    label: 'Submission Date',
    icon: CalendarClock,
    explain: (dir) => `Chronological review — ${dir === 'desc' ? 'newest' : 'oldest'} submissions first.`,
  },
  name: {
    label: 'Actor Name',
    icon: SortAsc,
    explain: (dir) => `Alphabetical order, ${dir === 'asc' ? 'A–Z' : 'Z–A'}.`,
  },
  role: {
    label: 'Role',
    icon: Layers,
    explain: () => 'Grouped by role across this casting.',
  },
  intelligence: {
    label: 'Intelligence Feed',
    icon: Sparkles,
    explain: () => 'Prioritizes submissions with the strongest contextual signals for this casting.',
  },
}

export function SortControl({
  sort,
  dir,
  withRole,
  onSort,
  onFlip,
}: {
  sort: SortMode
  dir: SortDir
  withRole: boolean
  onSort: (mode: SortMode) => void
  onFlip: () => void
}) {
  const [how, setHow] = useState(false)
  const order: SortMode[] = ['date', 'name', ...(withRole ? (['role'] as SortMode[]) : []), 'intelligence']
  const current = MODES[sort]
  const Icon = current.icon

  return (
    <div>
      <p className="text-label font-semibold uppercase tracking-label text-muted">Sort auditions by</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Sort auditions by" className="flex flex-wrap gap-2">
          {order.map((mode) => {
            const active = sort === mode
            const feed = mode === 'intelligence'
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSort(mode)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13.5px] font-semibold transition-all',
                  active
                    ? feed
                      ? 'border-ink bg-ink text-white shadow-[0_6px_18px_-6px_rgba(37,99,235,0.55)]'
                      : 'border-ink bg-ink text-white'
                    : 'border-line bg-card text-ink hover:border-ink/30',
                )}
              >
                {MODES[mode].label}
                {feed && <Sparkles className={cn('h-3.5 w-3.5', active ? 'text-gold' : 'text-link')} aria-hidden />}
              </button>
            )
          })}
        </div>
        {sort !== 'intelligence' && sort !== 'role' && (
          <button
            type="button"
            onClick={onFlip}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-[12.5px] font-semibold text-ink hover:border-ink/30"
            aria-label="Reverse the order"
          >
            <ArrowDownUp className="h-3.5 w-3.5" />
            {sort === 'date' ? (dir === 'desc' ? 'Newest first' : 'Oldest first') : dir === 'asc' ? 'A → Z' : 'Z → A'}
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <p className="flex items-start gap-2 text-[13.5px] leading-snug text-ink">
          <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', sort === 'intelligence' ? 'text-link' : 'text-muted')} aria-hidden />
          <span>
            <strong className="font-semibold">{sort === 'intelligence' ? 'Intelligence Feed™' : current.label}</strong>
            <span className="text-muted"> — {current.explain(dir)}</span>
          </span>
        </p>
        {sort === 'intelligence' ? (
          <button
            type="button"
            onClick={() => setHow((open) => !open)}
            aria-expanded={how}
            className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-link hover:underline"
          >
            How it works <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', how && 'rotate-180')} />
          </button>
        ) : (
          <span className="text-[12.5px] text-muted">Same auditions. Different order. One click.</span>
        )}
      </div>

      {sort === 'intelligence' && how && <HowItWorks />}
    </div>
  )
}

/** Talent Graph™ × Production Graph™ + Current Casting Context → Intelligence Feed™ → The Review Queue. */
function HowItWorks() {
  const step = (title: string, text: string, highlight = false) => (
    <div className={cn('rounded-[16px] px-4 py-3 text-center', highlight ? 'border border-ink bg-ink text-white' : 'border border-line bg-paper')}>
      <p className={cn('flex items-center justify-center gap-1.5 text-[14px] font-bold', highlight ? 'text-white' : 'text-ink')}>
        {highlight && <Sparkles className="h-3.5 w-3.5 text-gold" aria-hidden />}
        {title}
      </p>
      <p className={cn('mt-0.5 text-[12.5px]', highlight ? 'text-white/70' : 'text-muted')}>{text}</p>
    </div>
  )
  const arrow = (symbol: 'plus' | 'down') => (
    <span className="flex justify-center py-1 text-muted" aria-hidden>
      {symbol === 'plus' ? <span className="text-[15px] font-semibold">+</span> : <ArrowDown className="h-4 w-4" />}
    </span>
  )
  return (
    <div className="mt-4 grid gap-5 rounded-card border border-line bg-card p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:p-5">
      <div>
        {step('Talent Graph™ × Production Graph™', 'Persistent talent signals + observed production decisions')}
        {arrow('plus')}
        {step('Current Casting Context', 'This project, this role, this casting intent')}
        {arrow('down')}
        {step('Intelligence Feed™', 'Contextual audition prioritization', true)}
        {arrow('down')}
        {step('The Review Queue', 'Your team reviews, evaluates and decides.')}
      </div>
      <ul className="flex flex-col justify-center gap-4 text-[13.5px] leading-snug">
        {[
          ['It prioritizes attention. It does not automate judgment.', 'Every audition stays in the queue, whatever the order.'],
          ['Prioritized is not “best”.', 'A talent shortlisted on another production is not the best candidate here. Relevance always depends on this casting.'],
          ['Every position is explained.', 'Open “Why this audition?” on any card: the signal, what supports it, and where the information comes from.'],
          ['A pass is not a failure.', 'Talent your team noted on a past casting can surface earlier — with your team’s own words.'],
          ['Discovery by design.', 'First-time applicants get their own lane. A lack of prior data is never read as a lack of potential.'],
        ].map(([title, text]) => (
          <li key={title}>
            <p className="font-semibold text-ink">{title}</p>
            <p className="text-muted">{text}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
