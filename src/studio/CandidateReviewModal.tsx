import { useEffect, useState } from 'react'
import { Check, Film, MessageSquare, Minus, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Avatar, Button, FormError, FormField, SelectInput, Spinner, Tag } from '@/components/ui'
import { EditModal, TextArea } from '@/components/EditModal'
import { EmptyState } from '@/components/EmptyState'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  useCandidateNotes,
  useCandidateReviews,
  useSelfTape,
  useStudioMutations,
} from '@/features/studio/queries'
import { APPLICATION_STATUS_LABEL, relativeTime } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import type { ApplicationStatus, CandidateViewRow, ReviewVote } from '@/types/database'

/**
 * Candidate review: the self-tape, the team's votes, the notes and the decision.
 *
 * Everything written here lands on the application the talent submitted — the
 * status they will see, and votes/notes they will never see (RLS keeps those
 * inside the organization).
 */

const DECISIONS: ApplicationStatus[] = [
  'viewed',
  'under_review',
  'shortlisted',
  'callback',
  'offer',
  'cast',
  'not_selected',
]

const VOTES: { value: ReviewVote; label: string; icon: typeof ThumbsUp; tone: string }[] = [
  { value: 'no', label: 'No go', icon: ThumbsDown, tone: 'text-signal-no' },
  { value: 'maybe', label: 'Maybe', icon: Minus, tone: 'text-signal-maybe' },
  { value: 'good', label: 'Good match', icon: ThumbsUp, tone: 'text-signal-good' },
]

export function CandidateReviewModal({
  candidate,
  orgId,
  onClose,
  onMessage,
}: {
  candidate: CandidateViewRow
  orgId: string | undefined
  onClose: () => void
  /** Write to the actor — the parent owns the message modal. */
  onMessage?: () => void
}) {
  const { profile } = useAuth()
  const mutations = useStudioMutations(orgId, profile?.id)
  const selfTape = useSelfTape(candidate.application_id)
  const reviews = useCandidateReviews(candidate.application_id)
  const notes = useCandidateNotes(candidate.application_id)

  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Opening a submitted application is what "viewed" means.
  useEffect(() => {
    if (candidate.status !== 'submitted') return
    mutations.markViewed.mutate(candidate.application_id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate.application_id])

  const myVote = (reviews.data ?? []).find((review) => review.reviewer_id === profile?.id)?.vote

  async function run(action: () => Promise<unknown>, message: string) {
    setError(null)
    try {
      await action()
    } catch (actionError) {
      setError(errorMessage(actionError, message))
    }
  }

  return (
    <EditModal open title={candidate.name} onClose={onClose}>
      {error && <FormError>{error}</FormError>}

      <div className="flex items-center gap-3">
        <Avatar src={candidate.avatar_url ?? undefined} name={candidate.name} size="md" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-ink">{candidate.name}</p>
          <p className="truncate text-[13px] text-muted">
            {[
              candidate.role_name,
              candidate.city,
              candidate.playing_age_min && candidate.playing_age_max
                ? `${candidate.playing_age_min}–${candidate.playing_age_max}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Tag className="ml-auto shrink-0">{APPLICATION_STATUS_LABEL[candidate.status]}</Tag>
      </div>

      {candidate.note && (
        <p className="rounded-field bg-paper p-3 text-[13px] text-ink/90">
          <span className="font-semibold">Their note: </span>
          {candidate.note}
        </p>
      )}

      {/* ── Self-tape ── */}
      <FormField label="Self-tape" plainLabel>
        {selfTape.isLoading ? (
          <span className="flex items-center gap-2 text-[13px] text-muted">
            <Spinner />
            Opening the private tape…
          </span>
        ) : selfTape.data ? (
          <video
            src={selfTape.data.url}
            controls
            className="w-full rounded-btn border border-line bg-black"
          />
        ) : (
          <EmptyState
            compact
            icon={<Film className="h-4 w-4" />}
            title="No self-tape"
            description="This talent applied without a tape."
          />
        )}
      </FormField>

      {/* ── Team vote ── */}
      <FormField label="Your vote" plainLabel>
        <div className="flex flex-wrap gap-2">
          {VOTES.map((vote) => {
            const Icon = vote.icon
            const active = myVote === vote.value
            return (
              <button
                key={vote.value}
                type="button"
                onClick={() =>
                  run(
                    () =>
                      mutations.vote.mutateAsync({
                        applicationId: candidate.application_id,
                        vote: vote.value,
                      }),
                    'Could not save your vote',
                  )
                }
                className={cn(
                  'inline-flex items-center gap-2 rounded-field border px-3.5 py-2.5 text-[14px] font-semibold transition-colors',
                  active ? 'border-ink bg-ink text-white' : 'border-line bg-card hover:bg-paper',
                )}
              >
                <Icon className={cn('h-4 w-4', !active && vote.tone)} />
                {vote.label}
              </button>
            )
          })}
        </div>

        {(reviews.data ?? []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(reviews.data ?? []).map((review) => (
              <span
                key={review.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-1 text-[12px] text-ink"
              >
                <Avatar
                  src={review.reviewer?.avatar_url ?? undefined}
                  name={[review.reviewer?.first_name, review.reviewer?.last_name]
                    .filter(Boolean)
                    .join(' ')}
                  size="xs"
                />
                {review.vote === 'good' ? 'Good' : review.vote === 'maybe' ? 'Maybe' : 'No go'}
              </span>
            ))}
          </div>
        )}
      </FormField>

      {/* ── Decision ── */}
      <FormField label="Status" htmlFor="candidate-status" plainLabel>
        <SelectInput
          id="candidate-status"
          value={candidate.status}
          onChange={(event) =>
            run(
              () =>
                mutations.setApplicationStatus.mutateAsync({
                  applicationId: candidate.application_id,
                  status: event.target.value as ApplicationStatus,
                }),
              'Could not change the status',
            )
          }
        >
          {DECISIONS.map((status) => (
            <option key={status} value={status}>
              {APPLICATION_STATUS_LABEL[status]}
            </option>
          ))}
        </SelectInput>
        <p className="mt-1.5 text-[12px] text-muted">
          The talent sees this status on their audition — votes and notes stay inside your team.
        </p>
      </FormField>

      {/* ── Notes ── */}
      <FormField label="Team notes" htmlFor="candidate-note" plainLabel>
        <TextArea
          id="candidate-note"
          rows={2}
          placeholder="What you want the team to know."
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            disabled={!note.trim() || mutations.addNote.isPending}
            icon={
              mutations.addNote.isPending ? <Spinner /> : <MessageSquare className="h-3.5 w-3.5" />
            }
            onClick={() =>
              run(async () => {
                await mutations.addNote.mutateAsync({
                  applicationId: candidate.application_id,
                  body: note,
                })
                setNote('')
              }, 'Could not save your note')
            }
          >
            Add note
          </Button>
        </div>

        {(notes.data ?? []).length > 0 && (
          <ul className="mt-2 flex flex-col gap-2">
            {(notes.data ?? []).map((item) => (
              <li key={item.id} className="rounded-field bg-paper p-3">
                <div className="flex items-center gap-2">
                  <Avatar
                    src={item.author?.avatar_url ?? undefined}
                    name={[item.author?.first_name, item.author?.last_name]
                      .filter(Boolean)
                      .join(' ')}
                    size="xs"
                  />
                  <span className="text-[12px] font-semibold text-ink">
                    {[item.author?.first_name, item.author?.last_name].filter(Boolean).join(' ')}
                  </span>
                  <span className="text-[11px] text-muted">{relativeTime(item.created_at)}</span>
                </div>
                <p className="mt-1.5 text-[13px] text-ink/90">{item.body}</p>
              </li>
            ))}
          </ul>
        )}
      </FormField>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {onMessage && (
          <Button
            variant="secondary"
            size="sm"
            icon={<MessageSquare className="h-4 w-4" />}
            onClick={onMessage}
          >
            Message {candidate.name.split(' ')[0]}
          </Button>
        )}
        <Button variant="secondary" size="sm" icon={<Check className="h-4 w-4" />} onClick={onClose}>
          Done
        </Button>
      </div>
    </EditModal>
  )
}
