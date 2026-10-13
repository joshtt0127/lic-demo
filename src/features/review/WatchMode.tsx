import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, ExternalLink, Minus, Sparkles, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { Avatar, Spinner, Tag } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentOrganization, useOrgMembers } from '@/features/organizations/queries'
import { useCandidateReviews, useSelfTape, useStudioMutations } from '@/features/studio/queries'
import { useRecordEngagement } from '@/features/intelligence/queries'
import { explainReason } from '@/features/intelligence/reasons'
import { can } from '@/lib/access'
import { APPLICATION_STATUS_LABEL, APPLICATION_STATUS_TONE } from '@/lib/format'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/supabase'
import type { ApplicationStatus, ReviewVote } from '@/types/database'
import type { QueueItem } from './sort'

const VOTES: { value: ReviewVote; label: string; key: string; icon: typeof ThumbsUp; on: string }[] = [
  { value: 'no', label: 'No go', key: '1', icon: ThumbsDown, on: 'bg-signal-no text-white border-signal-no' },
  { value: 'maybe', label: 'Maybe', key: '2', icon: Minus, on: 'bg-signal-maybe text-ink border-signal-maybe' },
  { value: 'good', label: 'Good match', key: '3', icon: ThumbsUp, on: 'bg-signal-good text-white border-signal-good' },
]

/**
 * Watch & Advance — regarder, juger, décider, passer à la suivante, sans
 * quitter le clavier. Les mêmes signaux que la fiche de revue (ouverte,
 * revue, regardée à 90 %) : l'Intelligence Feed apprend de la même façon,
 * quel que soit l'écran.
 */
export function WatchMode({
  items,
  index,
  onIndex,
  onClose,
  onOpenFullReview,
  onSeen,
}: {
  items: QueueItem[]
  index: number
  onIndex: (index: number) => void
  onClose: () => void
  onOpenFullReview: (item: QueueItem) => void
  onSeen: (applicationId: string) => void
}) {
  const item = items[index]
  const { profile } = useAuth()
  const { organization } = useCurrentOrganization(profile?.id)
  const mayReview = can(organization?.role, 'candidate:review')
  const mayDecide = can(organization?.role, 'candidate:decide')
  const mutations = useStudioMutations(organization?.id, profile?.id)
  const members = useOrgMembers(organization?.id)
  const tape = useSelfTape(item?.application_id)
  const reviews = useCandidateReviews(item?.application_id)
  const engagement = useRecordEngagement()
  const videoRef = useRef<HTMLVideoElement>(null)
  const watched = useRef({ completed: false, plays: 0 })
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<ApplicationStatus | null>(null)

  const myVote = (reviews.data ?? []).find((review) => review.reviewer_id === profile?.id)?.vote
  const atEnd = index >= items.length - 1

  // Ouvrir une audition : le signal « ouverte », et « vue » si elle ne l'était pas.
  useEffect(() => {
    if (!item) return
    watched.current = { completed: false, plays: 0 }
    setError(null)
    setStatus(null)
    engagement.mutate({ applicationId: item.application_id, kind: 'AUDITION_OPENED' })
    onSeen(item.application_id)
    if (item.status === 'submitted' && mayDecide) mutations.markViewed.mutate(item.application_id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.application_id])

  const next = () => (atEnd ? onClose() : onIndex(index + 1))
  const prev = () => index > 0 && onIndex(index - 1)

  async function vote(value: ReviewVote) {
    if (!item || !mayReview) return
    setError(null)
    try {
      await mutations.vote.mutateAsync({ applicationId: item.application_id, vote: value })
      void reviews.refetch()
    } catch (voteError) {
      setError(errorMessage(voteError, 'Could not save your vote'))
    }
  }

  async function decide(value: ApplicationStatus) {
    if (!item || !mayDecide) return
    setError(null)
    try {
      await mutations.setApplicationStatus.mutateAsync({ applicationId: item.application_id, status: value })
      setStatus(value)
      // Décider, c'est avancer : la suivante arrive aussitôt.
      window.setTimeout(next, 350)
    } catch (decideError) {
      setError(errorMessage(decideError, 'Could not update the status'))
    }
  }

  // Raccourcis clavier — jamais pendant une saisie.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const video = videoRef.current
      switch (event.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowRight':
        case 'j':
          next()
          break
        case 'ArrowLeft':
        case 'k':
          prev()
          break
        case ' ':
          event.preventDefault()
          if (video) void (video.paused ? video.play() : video.pause())
          break
        case '1':
        case '2':
        case '3':
          void vote(VOTES[Number(event.key) - 1].value)
          break
        case 's':
          void decide('shortlisted')
          break
        case 'x':
          void decide('not_selected')
          break
        default:
          return
      }
    }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  })

  if (!item) return null
  const currentStatus = status ?? item.status
  const reasons = item.feed?.reasons ?? []
  const reviewBy = new Map((reviews.data ?? []).map((review) => [review.reviewer_id, review]))
  const team = (members.data ?? []).map((member) => ({
    id: member.profile_id,
    name: [member.profile?.first_name, member.profile?.last_name].filter(Boolean).join(' ') || 'Member',
    avatar: member.profile?.avatar_url ?? undefined,
    review: reviewBy.get(member.profile_id) ?? null,
  }))

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Watching ${item.name}`} className="fixed inset-0 z-[90] flex flex-col bg-[#0d0c09] text-white">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <Avatar src={item.avatar_url ?? undefined} name={item.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[17px] font-bold">{item.name}</p>
          <p className="truncate text-[12.5px] text-white/60">
            {[item.role_name, item.city].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className="hidden font-mono text-[13px] text-white/60 sm:inline">
          {index + 1} / {items.length}
        </span>
        <button type="button" onClick={prev} disabled={index === 0} aria-label="Previous audition" className="flex h-10 w-10 items-center justify-center rounded-btn text-white/80 hover:bg-white/10 disabled:opacity-30">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button type="button" onClick={next} aria-label={atEnd ? 'Close' : 'Next audition'} className="flex h-10 w-10 items-center justify-center rounded-btn text-white/80 hover:bg-white/10">
          <ArrowRight className="h-5 w-5" />
        </button>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-btn text-white/80 hover:bg-white/10">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-h-0 items-center justify-center bg-black p-3 sm:p-6">
          {tape.isLoading ? (
            <Spinner />
          ) : tape.data ? (
            <video
              key={item.application_id}
              ref={videoRef}
              src={tape.data.url}
              controls
              autoPlay
              playsInline
              className="max-h-full w-full max-w-5xl rounded-btn bg-black object-contain"
              onPlay={() => {
                watched.current.plays += 1
                if (watched.current.plays > 1) engagement.mutate({ applicationId: item.application_id, kind: 'AUDITION_REWATCHED' })
              }}
              onTimeUpdate={(event) => {
                const video = event.currentTarget
                if (watched.current.completed || !video.duration || !Number.isFinite(video.duration)) return
                const progress = video.currentTime / video.duration
                if (progress < 0.9) return
                watched.current.completed = true
                engagement.mutate({ applicationId: item.application_id, kind: 'AUDITION_COMPLETED', progress })
              }}
            />
          ) : (
            <p className="text-[14px] text-white/60">No self-tape for this audition yet.</p>
          )}
        </div>

        <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto border-l border-white/10 bg-[#15140f] p-5">
          <div className="flex items-center justify-between gap-2">
            <Tag tone={APPLICATION_STATUS_TONE[currentStatus]}>{APPLICATION_STATUS_LABEL[currentStatus]}</Tag>
            <button type="button" onClick={() => onOpenFullReview(item)} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white/70 hover:text-white">
              <ExternalLink className="h-3.5 w-3.5" />
              Full review, notes & AI read
            </button>
          </div>

          {reasons.length > 0 && (
            <section>
              <p className="flex items-center gap-1.5 text-label font-semibold uppercase tracking-label text-white/50">
                <Sparkles className="h-3.5 w-3.5" /> Why this audition?
              </p>
              <ul className="mt-2 flex flex-col gap-1.5 text-[13px] leading-snug text-white/85">
                {reasons.map((reason, i) => (
                  <li key={i}>• {explainReason(reason)}</li>
                ))}
              </ul>
              <p className="mt-2 text-[11.5px] text-white/45">Prioritized is not “best”: it says where attention is due, never who to cast.</p>
            </section>
          )}

          {mayReview && (
            <section>
              <p className="text-label font-semibold uppercase tracking-label text-white/50">Your evaluation</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {VOTES.map(({ value, label, key, icon: Icon, on }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => void vote(value)}
                    aria-pressed={myVote === value}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-btn border px-2 py-2.5 text-[12.5px] font-bold transition-colors',
                      myVote === value ? on : 'border-white/15 text-white/85 hover:border-white/40',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                    <kbd className="font-mono text-[10px] opacity-60">{key}</kbd>
                  </button>
                ))}
              </div>
            </section>
          )}

          {mayDecide && (
            <section>
              <p className="text-label font-semibold uppercase tracking-label text-white/50">Decision</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void decide('shortlisted')} className="rounded-btn bg-white px-3 py-2.5 text-[13px] font-bold text-ink hover:brightness-95">
                  Shortlist <kbd className="ml-1 font-mono text-[10px] opacity-50">S</kbd>
                </button>
                <button type="button" onClick={() => void decide('not_selected')} className="rounded-btn border border-white/20 px-3 py-2.5 text-[13px] font-bold text-white hover:border-white/50">
                  Pass <kbd className="ml-1 font-mono text-[10px] opacity-50">X</kbd>
                </button>
              </div>
              <p className="mt-2 text-[11.5px] text-white/45">A pass is not a failure: the review is kept, and can matter for another casting.</p>
            </section>
          )}

          <section>
            <p className="text-label font-semibold uppercase tracking-label text-white/50">
              Team · {team.filter((member) => member.review).length} of {team.length} reviewed
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {team.map((member) => (
                <li key={member.id} className="flex items-start gap-2.5 text-[13px]">
                  <Avatar src={member.avatar} name={member.name} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{member.id === profile?.id ? 'You' : member.name}</span>
                    <span className="ml-1.5 text-white/60">
                      {member.review ? VOTES.find((v) => v.value === member.review!.vote)?.label : 'not yet'}
                    </span>
                    {member.review?.comment && <span className="block text-[12px] italic text-white/55">“{member.review.comment}”</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {error && <p className="rounded-btn bg-signal-no/20 px-3 py-2 text-[13px] text-white">{error}</p>}

          <p className="mt-auto border-t border-white/10 pt-3 text-[11.5px] leading-relaxed text-white/45">
            <kbd className="font-mono">← →</kbd> previous / next · <kbd className="font-mono">Space</kbd> play / pause ·{' '}
            <kbd className="font-mono">1 2 3</kbd> vote · <kbd className="font-mono">S</kbd> shortlist · <kbd className="font-mono">X</kbd> pass ·{' '}
            <kbd className="font-mono">Esc</kbd> close
          </p>
        </aside>
      </div>
    </div>,
    document.body,
  )
}
