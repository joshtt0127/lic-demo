import { useState } from 'react'
import { Check, Plus, Tag as TagIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ReviewLabelRow, ReviewLabelTone } from '@/types/database'
import { LABEL_TONE, STARTER_LABELS } from './labels'

/** Étiquettes posées sur une carte : compactes, jamais plus de trois visibles. */
export function LabelChips({ labels, max = 3 }: { labels: ReviewLabelRow[]; max?: number }) {
  if (labels.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {labels.slice(0, max).map((label) => (
        <span key={label.id} className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', LABEL_TONE[label.tone])}>
          {label.name}
        </span>
      ))}
      {labels.length > max && (
        <span className="rounded-full bg-line px-2 py-0.5 text-[11px] font-semibold text-muted">+{labels.length - max}</span>
      )}
    </div>
  )
}

/**
 * Poser une étiquette sans interrompre la lecture : un clic, la vidéo continue.
 * Tant que l'équipe n'en a créé aucune, des étiquettes de départ sont
 * proposées — elles ne sont créées qu'au premier usage.
 */
export function LabelPicker({
  labels,
  active,
  onToggle,
  onCreate,
  busy,
  dark,
}: {
  labels: ReviewLabelRow[]
  active: Set<string>
  onToggle: (label: ReviewLabelRow, on: boolean) => void
  onCreate: (name: string, tone: ReviewLabelTone) => void
  busy?: boolean
  dark?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const known = new Set(labels.map((label) => label.name.toLowerCase()))
  const starters = STARTER_LABELS.filter((starter) => !known.has(starter.name.toLowerCase()))

  const chip = (on: boolean) =>
    cn(
      'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors disabled:opacity-50',
      dark
        ? on
          ? 'border-white bg-white text-ink'
          : 'border-white/20 text-white/85 hover:border-white/50'
        : on
          ? 'border-ink bg-ink text-white'
          : 'border-line text-ink hover:border-ink/30',
    )

  function submit() {
    const clean = name.trim()
    if (!clean) return
    onCreate(clean, 'neutral')
    setName('')
    setAdding(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {labels.map((label) => {
        const on = active.has(label.id)
        return (
          <button key={label.id} type="button" disabled={busy} aria-pressed={on} onClick={() => onToggle(label, !on)} className={chip(on)}>
            {on && <Check className="h-3 w-3" strokeWidth={3} />}
            {label.name}
          </button>
        )
      })}
      {labels.length === 0 &&
        starters.map((starter) => (
          <button
            key={starter.name}
            type="button"
            disabled={busy}
            onClick={() => onCreate(starter.name, starter.tone)}
            className={cn(chip(false), 'border-dashed')}
            title="Suggested — created for your team on first use"
          >
            <Plus className="h-3 w-3" />
            {starter.name}
          </button>
        ))}
      {adding ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
          className="inline-flex"
        >
          <input
            autoFocus
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => (name.trim() ? submit() : setAdding(false))}
            onKeyDown={(event) => event.key === 'Escape' && (event.stopPropagation(), setAdding(false))}
            placeholder="New label"
            aria-label="New label name"
            className={cn(
              'h-7 w-36 rounded-full border px-2.5 text-[12px] outline-none',
              dark ? 'border-white/30 bg-transparent text-white placeholder:text-white/40' : 'border-ink/30 bg-card text-ink',
            )}
          />
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={cn(chip(false), 'border-dashed')}>
          <TagIcon className="h-3 w-3" />
          New label
        </button>
      )}
    </div>
  )
}
