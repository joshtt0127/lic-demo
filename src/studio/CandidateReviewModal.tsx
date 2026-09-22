import { useEffect, useState } from 'react'
import { Check, Film, MessageSquare, Minus, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Avatar, Button, FormError, FormField, SelectInput, Spinner, Tag } from '@/components/ui'
import { EditModal, TextArea } from '@/components/EditModal'
import { EmptyState } from '@/components/EmptyState'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentOrganization, useOrgMembers } from '@/features/organizations/queries'
import { can } from '@/lib/access'
import {
  useCandidateNotes,
  useCandidateReviews,
  useStudioMutations,
} from '@/features/studio/queries'
import { useSelfTapes } from '@/features/selftapes/queries'
import { TapeCheckCard } from '@/components/upload/TapeCheckCard'
import { APPLICATION_STATUS_LABEL, relativeTime } from '@/lib/format'
import { formatBytes } from '@/lib/storage'
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
  const { organization } = useCurrentOrganization(profile?.id)
  const members = useOrgMembers(orgId)
  const mutations = useStudioMutations(orgId, profile?.id)

  const mayReview = can(organization?.role, 'candidate:review')
  const mayDecide = can(organization?.role, 'candidate:decide')
  const mayNote = can(organization?.role, 'candidate:note')
  const selfTapes = useSelfTapes(candidate.application_id)
  const reviews = useCandidateReviews(candidate.application_id)
  const notes = useCandidateNotes(candidate.application_id)

  const [note, setNote] = useState('')
  const [voteComment, setVoteComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Opening a submitted application is what "viewed" means.
  useEffect(() => {
    if (candidate.status !== 'submitted') return
    mutations.markViewed.mutate(candidate.application_id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate.application_id])

  const myVote = (reviews.data ?? []).find((review) => review.reviewer_id === profile?.id)?.vote

  const reviewByMember = new Map((reviews.data ?? []).map((review) => [review.reviewer_id, review]))
  const teamReviews = (members.data ?? []).map((member) => ({
    id: member.profile_id,
    name:
      [member.profile?.first_name, member.profile?.last_name].filter(Boolean).join(' ') || 'Member',
    avatarUrl: member.profile?.avatar_url ?? null,
    review: reviewByMember.get(member.profile_id) ?? null,
  }))
  const teamCount = teamReviews.length
  const votedCount = teamReviews.filter((member) => member.review).length
  const reviewsWithComment = (reviews.data ?? []).filter((review) => review.comment?.trim())

  const tape = selfTapes.data?.[0] ?? null
  const tapeSeconds = tape?.durationSeconds ?? null
  const tapeDuration =
    tapeSeconds && Number.isFinite(tapeSeconds)
      ? `${Math.floor(Math.round(tapeSeconds) / 60)}:${`${Math.round(tapeSeconds) % 60}`.padStart(2, '0')}`
      : null

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
        {selfTapes.isLoading ? (
          <span className="flex items-center gap-2 text-[13px] text-muted">
            <Spinner />
            Opening the private tape…
          </span>
        ) : selfTapes.error ? (
          <FormError>
            {errorMessage(selfTapes.error, 'Could not open this tape')}
          </FormError>
        ) : tape ? (
          <div className="flex flex-col gap-2">
            <video
              src={tape.url}
              controls
              preload="metadata"
              className="w-full rounded-btn border border-line bg-black"
            />
            {tape.check && <TapeCheckCard check={tape.check} />}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
              <span>Sent {relativeTime(tape.submittedAt)}</span>
              {tapeDuration && <span className="font-mono">{tapeDuration}</span>}
              {tape.bytes && <span>{formatBytes(tape.bytes)}</span>}
              {(selfTapes.data?.length ?? 0) > 1 && (
                <span>{(selfTapes.data?.length ?? 0) - 1} earlier take(s) replaced</span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <EmptyState
              compact
              icon={<Film className="h-4 w-4" />}
              title="No self-tape yet"
              description="They applied without a tape — you can ask them for one."
            />
            {onMessage && (
              <Button
                variant="secondary"
                size="sm"
                icon={<MessageSquare className="h-4 w-4" />}
                onClick={onMessage}
              >
                Ask for a self-tape
              </Button>
            )}
          </div>
        )}
      </FormField>

      {/* ── Team vote ── */}
      <FormField label="Your vote" plainLabel>
        {!mayReview ? (
          <p className="text-[13px] text-muted">
            Your role in this organization is read-only — you can watch the tape, not vote.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {VOTES.map((vote) => {
                const Icon = vote.icon
                const active = myVote === vote.value
                return (
                  <button
                    key={vote.value}
                    type="button"
                    onClick={() =>
                      run(async () => {
                        await mutations.vote.mutateAsync({
                          applicationId: candidate.application_id,
                          vote: vote.value,
                          comment: voteComment.trim() || null,
                        })
                        setVoteComment('')
                      }, 'Could not save your vote')
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

            <input
              value={voteComment}
              onChange={(event) => setVoteComment(event.target.value)}
              aria-label="Reason for your vote"
              placeholder="Add a reason (optional) — it is saved with your vote"
              className="mt-2 h-10 w-full rounded-field border border-line bg-card px-3 text-[13px] text-ink outline-none placeholder:text-muted/70 focus:border-ink/30"
            />
          </>
        )}

        {/* Who reviewed, and who the team is still waiting on. */}
        <div className="mt-3 flex flex-col gap-2">
          <span className="text-[12px] font-semibold text-muted">
            {votedCount} of {teamCount} teammate{teamCount === 1 ? '' : 's'} reviewed
          </span>
          <ul className="flex flex-wrap gap-2">
            {teamReviews.map(({ id, name, avatarUrl, review }) => (
              <li
                key={id}
                className={cn(
                  'inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px]',
                  review ? 'bg-paper text-ink' : 'border border-dashed border-line text-muted',
                )}
                title={review?.comment ?? undefined}
              >
                <Avatar src={avatarUrl ?? undefined} name={name} size="xs" />
                <span className="truncate">{name}</span>
                <span className="shrink-0 font-semibold">
                  {review
                    ? review.vote === 'good'
                      ? '· Good'
                      : review.vote === 'maybe'
                        ? '· Maybe'
                        : '· No go'
                    : '· not yet'}
                </span>
              </li>
            ))}
          </ul>

          {reviewsWithComment.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {reviewsWithComment.map((review) => (
                <li key={`why-${review.id}`} className="text-[12.5px] text-muted">
                  <span className="font-semibold text-ink">
                    {[review.reviewer?.first_name, review.reviewer?.last_name]
                      .filter(Boolean)
                      .join(' ') || 'Teammate'}
                    :
                  </span>{' '}
                  {review.comment}
                </li>
              ))}
            </ul>
          )}
        </div>
      </FormField>

      {/* ── Decision ── */}
      <FormField label="Status" htmlFor="candidate-status" plainLabel>
        <SelectInput
          id="candidate-status"
          disabled={!mayDecide}
          title={mayDecide ? undefined : 'Your role cannot decide on candidates'}
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
      <FormField label="Team notes — internal" htmlFor="candidate-note" plainLabel>
        <TextArea
          id="candidate-note"
          rows={2}
          disabled={!mayNote}
          placeholder={
            mayNote
              ? 'What you want the team to know. The actor never sees this.'
              : 'Your role cannot add notes.'
          }
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            disabled={!mayNote || !note.trim() || mutations.addNote.isPending}
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
