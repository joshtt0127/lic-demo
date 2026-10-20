import { useEffect, useRef } from 'react'
import { Check, MessageSquare, X } from 'lucide-react'
import { Avatar, Button } from '@/components/ui'
import { useCandidateNotes, useCandidateReviews } from '@/features/studio/queries'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { ReviewVote } from '@/types/database'
import { useTapeVideo } from './queries'
import { personName } from './SelectionMenu'

/**
 * L'audition, ouverte par-dessus le mur.
 *
 * On regarde la performance, on lit les avis et les commentaires de l'équipe,
 * puis on ferme : le mur est exactement là où on l'avait laissé (même
 * catégorie, même défilement) puisqu'on ne l'a jamais quitté.
 */

const VOTE: Record<ReviewVote, { label: string; className: string }> = {
  good: { label: 'Yes', className: 'bg-signal-good-bg text-signal-good' },
  maybe: { label: 'Maybe', className: 'bg-signal-maybe/15 text-[#7A5F00]' },
  no: { label: 'No', className: 'bg-signal-no/10 text-signal-no' },
}

export type PreviewTarget = {
  applicationId: string
  selfTapeId: string | null
  name: string
  roleId: string
  roleName: string
}

export function AuditionPreview({
  target,
  isOnWall,
  canPlace,
  busy,
  onPlace,
  onClose,
}: {
  target: PreviewTarget
  isOnWall: boolean
  canPlace: boolean
  busy: boolean
  onPlace: () => void
  onClose: () => void
}) {
  const video = useTapeVideo(target.selfTapeId)
  const reviews = useCandidateReviews(target.applicationId)
  const notes = useCandidateNotes(target.applicationId)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [onClose])

  const votes = reviews.data ?? []
  const comments = [
    ...votes
      .filter((review) => review.comment?.trim())
      .map((review) => ({
        id: `r-${review.id}`,
        author: review.reviewer,
        body: review.comment as string,
        at: review.updated_at ?? review.created_at,
        vote: review.vote,
      })),
    ...(notes.data ?? [])
      .filter((note) => note.visibility === 'team')
      .map((note) => ({ id: `n-${note.id}`, author: note.author, body: note.body, at: note.created_at, vote: null })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return (
    <div
      className="fixed inset-0 z-[150] flex items-stretch justify-center bg-ink/80 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${target.name} — audition for ${target.roleName}`}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[100dvh] w-full max-w-[1100px] flex-col overflow-hidden bg-card sm:max-h-[90vh] sm:rounded-panel lg:flex-row"
      >
        <div className="relative flex min-h-[240px] flex-1 items-center justify-center bg-ink lg:min-h-[520px]">
          {video.data ? (
            <video
              key={video.data}
              src={video.data}
              controls
              autoPlay
              playsInline
              className="h-full max-h-[70vh] w-full object-contain lg:max-h-[90vh]"
            />
          ) : video.isLoading ? (
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" aria-label="Loading the audition" />
          ) : (
            <p className="px-6 text-center text-[14px] text-white/70">This audition video is not available.</p>
          )}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20 lg:hidden"
            aria-label="Close the audition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <aside className="flex w-full flex-col lg:w-[360px] lg:shrink-0">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 pb-4 pt-5">
            <div className="min-w-0">
              <p className="tech-label">{target.roleName}</p>
              <h2 className="mt-1 truncate font-display text-[22px] font-extrabold tracking-[-0.02em] text-ink">{target.name}</h2>
              {isOnWall && (
                <p className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold text-signal-good">
                  <Check className="h-3.5 w-3.5" aria-hidden /> On the Wall
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink lg:inline-flex"
              aria-label="Close the audition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <h3 className="tech-label">Team ratings</h3>
            {reviews.isLoading ? (
              <div className="mt-2 h-9 animate-pulse rounded-btn bg-paper" />
            ) : votes.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted">Nobody has rated this audition yet.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {votes.map((review) => (
                  <li
                    key={review.id}
                    className={cn('inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[12px] font-semibold', VOTE[review.vote].className)}
                  >
                    <Avatar src={review.reviewer?.avatar_url ?? undefined} name={personName(review.reviewer)} size="xs" />
                    {personName(review.reviewer).split(' ')[0]} · {VOTE[review.vote].label}
                  </li>
                ))}
              </ul>
            )}

            <h3 className="tech-label mt-5">Comments</h3>
            {notes.isLoading || reviews.isLoading ? (
              <div className="mt-2 h-16 animate-pulse rounded-btn bg-paper" />
            ) : comments.length === 0 ? (
              <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-muted">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden /> No comment from the team.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-3">
                {comments.map((comment) => (
                  <li key={comment.id} className="flex gap-2.5">
                    <Avatar src={comment.author?.avatar_url ?? undefined} name={personName(comment.author)} size="sm" />
                    <div className="min-w-0">
                      <p className="text-[12px] text-muted">
                        <span className="font-semibold text-ink">{personName(comment.author)}</span> · {relativeTime(comment.at)}
                        {comment.vote ? ` · ${VOTE[comment.vote].label}` : ''}
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-[13.5px] leading-relaxed text-ink">{comment.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canPlace && !isOnWall && (
            <div className="border-t border-line px-5 py-4">
              <Button className="w-full" onClick={onPlace} disabled={busy}>
                Place on Wall as {target.roleName}
              </Button>
              <p className="mt-2 text-center text-[11.5px] text-muted">
                A provisional choice — it never books the actor.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
