import { useRef, useState } from 'react'
import { Check, ChevronDown, Film, Play, Sparkles } from 'lucide-react'
import { Avatar, Tag } from '@/components/ui'
import { explainReason } from '@/features/intelligence/reasons'
import { APPLICATION_STATUS_LABEL, APPLICATION_STATUS_TONE, relativeTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { ReviewLabelRow, ReviewVote } from '@/types/database'
import { LabelChips } from './LabelPicker'
import { isDecided, type QueueItem, type ReviewState } from './sort'
import type { QueueTape } from './queries'

const VOTE_LABEL: Record<ReviewVote, string> = { good: 'Good match', maybe: 'Maybe', no: 'No go' }
const VOTE_TONE: Record<ReviewVote, string> = {
  good: 'bg-signal-good-bg text-signal-good',
  maybe: 'bg-cream text-ink',
  no: 'bg-signal-no/10 text-signal-no',
}

export function formatSeconds(seconds: number | null | undefined) {
  if (!seconds || !Number.isFinite(seconds)) return null
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Une audition, pas une ligne : la tape d'abord, l'identité et le contexte
 * ensuite, et la raison de sa place quand le feed est actif.
 */
export function ReviewCard({
  item,
  tape,
  state,
  myVote,
  selected,
  selectable,
  showRole,
  showWhy,
  labels,
  onToggle,
  onOpen,
}: {
  item: QueueItem
  tape: QueueTape | undefined
  state: ReviewState
  myVote: ReviewVote | undefined
  selected: boolean
  selectable: boolean
  showRole: boolean
  showWhy: boolean
  /** Étiquettes d'équipe posées sur cette audition. */
  labels: ReviewLabelRow[]
  onToggle: () => void
  onOpen: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [whyOpen, setWhyOpen] = useState(false)
  const decided = isDecided(item.status)
  const reasons = item.feed?.reasons ?? []
  const firstTime = reasons.some((reason) => reason.code === 'new_to_you')
  const age =
    item.playing_age_min != null && item.playing_age_max != null
      ? `${item.playing_age_min}–${item.playing_age_max}`
      : null

  // Survol : un aperçu muet, comme dans un banc de montage. Rien ne part en son.
  const preview = (play: boolean) => {
    const video = videoRef.current
    if (!video) return
    if (play) {
      video.muted = true
      void video.play().catch(() => {})
    } else {
      video.pause()
    }
  }

  return (
    <article
      className={cn(
        'group/card relative flex flex-col overflow-hidden rounded-card border bg-card shadow-card transition-all',
        selected ? 'border-ink ring-2 ring-ink' : 'border-line hover:shadow-card-hover',
        decided && !selected && 'opacity-80',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        onMouseEnter={() => preview(true)}
        onMouseLeave={() => preview(false)}
        aria-label={`Watch ${item.name}’s audition`}
        className="relative block aspect-video w-full overflow-hidden bg-ink"
      >
        {tape ? (
          <video
            ref={videoRef}
            src={`${tape.url}#t=0.5`}
            muted
            playsInline
            preload="metadata"
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
            <Avatar src={item.avatar_url ?? undefined} name={item.name} size="lg" />
            <span className="text-[12px]">No self-tape yet</span>
          </span>
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
        {tape && (
          <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-ink opacity-0 shadow-lg transition-opacity group-hover/card:opacity-100">
            <Play className="h-5 w-5 translate-x-px fill-current" />
          </span>
        )}
        {formatSeconds(tape?.durationSeconds) && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 font-mono text-[11px] text-white">
            {formatSeconds(tape?.durationSeconds)}
          </span>
        )}
        {/* Progression personnelle : pas vue / vue / décidée */}
        <span className="absolute right-2 top-2">
          {decided ? (
            <Tag tone={APPLICATION_STATUS_TONE[item.status]}>{APPLICATION_STATUS_LABEL[item.status]}</Tag>
          ) : state === 'waiting' ? (
            <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold text-ink">Waiting for a decision</span>
          ) : state === 'seen' ? (
            <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">Seen</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-link" />
              Unseen
            </span>
          )}
        </span>
        {firstTime && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[11px] font-bold text-ink">
            <Sparkles className="h-3 w-3" />
            New talent
          </span>
        )}
      </button>

      {selectable && (
        <label className="absolute left-2 top-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/95 shadow">
          <input type="checkbox" checked={selected} onChange={onToggle} className="sr-only" aria-label={`Select ${item.name}`} />
          <span
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded border',
              selected ? 'border-ink bg-ink text-white' : 'border-muted/60',
            )}
          >
            {selected && <Check className="h-3 w-3" strokeWidth={3} />}
          </span>
        </label>
      )}

      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        <button type="button" onClick={onOpen} className="flex items-center gap-2.5 text-left">
          <Avatar src={item.avatar_url ?? undefined} name={item.name} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-bold text-ink">{item.name}</span>
            <span className="block truncate text-[12px] text-muted">
              {[showRole ? item.role_name : null, item.city, age, item.submitted_at ? relativeTime(item.submitted_at) : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        </button>

        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
          {item.good_count + item.maybe_count + item.no_count === 0 ? (
            <span className="text-muted">No team vote yet</span>
          ) : (
            <>
              {item.good_count > 0 && <span className="rounded-full bg-signal-good-bg px-2 py-0.5 font-semibold text-signal-good">{item.good_count} good</span>}
              {item.maybe_count > 0 && <span className="rounded-full bg-cream px-2 py-0.5 font-semibold text-ink">{item.maybe_count} maybe</span>}
              {item.no_count > 0 && <span className="rounded-full bg-signal-no/10 px-2 py-0.5 font-semibold text-signal-no">{item.no_count} no go</span>}
            </>
          )}
          {myVote && <span className={cn('ml-auto rounded-full px-2 py-0.5 font-semibold', VOTE_TONE[myVote])}>You: {VOTE_LABEL[myVote]}</span>}
          {!item.has_self_tape && (
            <span className="inline-flex items-center gap-1 text-muted">
              <Film className="h-3 w-3" /> no tape
            </span>
          )}
        </div>

        <LabelChips labels={labels} />

        {/* Pourquoi cette audition est là — seulement quand le feed ordonne. */}
        {showWhy && reasons.length > 0 && (
          <div className="mt-auto border-t border-line pt-2">
            <button
              type="button"
              onClick={() => setWhyOpen((open) => !open)}
              aria-expanded={whyOpen}
              className="flex w-full items-start gap-1.5 text-left text-[12px] leading-snug text-ink/80"
            >
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-link" />
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-ink">Why this audition? </span>
                {!whyOpen && explainReason(reasons[0])}
              </span>
              <ChevronDown className={cn('mt-0.5 h-3.5 w-3.5 shrink-0 text-muted transition-transform', whyOpen && 'rotate-180')} />
            </button>
            {whyOpen && (
              <ul className="mt-1.5 flex flex-col gap-1 pl-5 text-[12px] leading-snug text-ink/80">
                {reasons.map((reason, index) => (
                  <li key={index} className="list-disc">
                    {explainReason(reason)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
