import { useEffect, useRef, useState } from "react";
import {
  Check,
  Film,
  MessageSquare,
  Minus,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import {
  Avatar,
  Button,
  FormError,
  FormField,
  SelectInput,
  Spinner,
  Tag,
} from "@/components/ui";
import { EditModal, TextArea } from "@/components/EditModal";
import { EmptyState } from "@/components/EmptyState";
import { RequestCallbackModal } from "@/studio/RequestCallbackModal";
import { useRecordEngagement } from "@/features/intelligence/queries";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  useCurrentOrganization,
  useOrgMembers,
} from "@/features/organizations/queries";
import { can } from "@/lib/access";
import {
  useCandidateNotes,
  useCandidateReviews,
  useStudioMutations,
} from "@/features/studio/queries";
import { useSelfTapes } from "@/features/selftapes/queries";
import { TapeCheckCard } from "@/components/upload/TapeCheckCard";
import { AiTapeReview } from "./AiTapeReview";
import { APPLICATION_STATUS_LABEL, relativeTime } from "@/lib/format";
import { formatBytes } from "@/lib/storage";
import { errorMessage } from "@/lib/supabase";
import { cn } from "@/lib/cn";
import type {
  ApplicationStatus,
  CandidateViewRow,
  ReviewVote,
  RoleRow,
} from "@/types/database";

/**
 * Candidate review: the self-tape, the team's votes, the notes and the decision.
 *
 * Everything written here lands on the application the talent submitted — the
 * status they will see, and votes/notes they will never see (RLS keeps those
 * inside the organization).
 */

/**
 * `callback` ne figure plus ici : un callback est un rendez-vous, pas un
 * statut qu'on choisit dans une liste. Il se propose avec sa date, son lieu ou
 * son lien — et c'est l'envoi qui fait avancer la candidature.
 */
const DECISIONS: ApplicationStatus[] = [
  "viewed",
  "under_review",
  "shortlisted",
  "offer",
  "cast",
  "not_selected",
];

const VOTES: {
  value: ReviewVote;
  label: string;
  icon: typeof ThumbsUp;
  tone: string;
}[] = [
  { value: "no", label: "No go", icon: ThumbsDown, tone: "text-signal-no" },
  { value: "maybe", label: "Maybe", icon: Minus, tone: "text-signal-maybe" },
  {
    value: "good",
    label: "Good match",
    icon: ThumbsUp,
    tone: "text-signal-good",
  },
];

export function CandidateReviewModal({
  candidate,
  role,
  orgId,
  onClose,
  onMessage,
}: {
  candidate: CandidateViewRow;
  /** The role they applied for — the AI read needs its brief. */
  role?: RoleRow | null;
  orgId: string | undefined;
  onClose: () => void;
  /** Write to the actor — the parent owns the message modal. */
  onMessage?: () => void;
}) {
  const { profile } = useAuth();
  const { organization } = useCurrentOrganization(profile?.id);
  const members = useOrgMembers(orgId);
  const mutations = useStudioMutations(orgId, profile?.id);

  const mayReview = can(organization?.role, "candidate:review");
  const mayDecide = can(organization?.role, "candidate:decide");
  const [callbackOpen, setCallbackOpen] = useState(false);
  const mayNote = can(organization?.role, "candidate:note");
  const selfTapes = useSelfTapes(candidate.application_id);
  const reviews = useCandidateReviews(candidate.application_id);
  const notes = useCandidateNotes(candidate.application_id);

  const [note, setNote] = useState("");
  const [voteComment, setVoteComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Opening a submitted application is what "viewed" means.
  useEffect(() => {
    if (candidate.status !== "submitted") return;
    mutations.markViewed.mutate(candidate.application_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate.application_id]);

  /**
   * Ce que l'équipe regarde, et jusqu'où.
   *
   * `markViewed` ci-dessus ne dit qu'une chose, une seule fois : la candidature
   * a été ouverte au moins une fois. Ça ne distingue pas un coup d'œil de trois
   * visionnages complets — or c'est exactement cette différence qui dit où va
   * l'attention d'une équipe, et c'est elle qui alimente la bande « Priority ».
   *
   * Aucun de ces enregistrements n'est visible du comédien : ce sont des
   * données de délibération, et la policy de `events` les lui refuse.
   */
  const engagement = useRecordEngagement();
  const watched = useRef({ opened: false, completed: false, plays: 0 });

  useEffect(() => {
    watched.current = { opened: false, completed: false, plays: 0 };
  }, [candidate.application_id]);

  useEffect(() => {
    if (watched.current.opened) return;
    watched.current.opened = true;
    engagement.mutate({
      applicationId: candidate.application_id,
      kind: "AUDITION_OPENED",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate.application_id]);

  const myVote = (reviews.data ?? []).find(
    (review) => review.reviewer_id === profile?.id,
  )?.vote;

  const reviewByMember = new Map(
    (reviews.data ?? []).map((review) => [review.reviewer_id, review]),
  );
  const teamReviews = (members.data ?? []).map((member) => ({
    id: member.profile_id,
    name:
      [member.profile?.first_name, member.profile?.last_name]
        .filter(Boolean)
        .join(" ") || "Member",
    avatarUrl: member.profile?.avatar_url ?? null,
    review: reviewByMember.get(member.profile_id) ?? null,
  }));
  const teamCount = teamReviews.length;
  const votedCount = teamReviews.filter((member) => member.review).length;
  const reviewsWithComment = (reviews.data ?? []).filter((review) =>
    review.comment?.trim(),
  );

  const tape = selfTapes.data?.[0] ?? null;
  const tapeSeconds = tape?.durationSeconds ?? null;
  const tapeDuration =
    tapeSeconds && Number.isFinite(tapeSeconds)
      ? `${Math.floor(Math.round(tapeSeconds) / 60)}:${`${Math.round(tapeSeconds) % 60}`.padStart(2, "0")}`
      : null;

  async function run(action: () => Promise<unknown>, message: string) {
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(errorMessage(actionError, message));
    }
  }

  return (
    <EditModal open title={candidate.name} onClose={onClose}>
      {error && <FormError>{error}</FormError>}

      <div className="flex items-center gap-3">
        <Avatar
          src={candidate.avatar_url ?? undefined}
          name={candidate.name}
          size="md"
        />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-ink">
            {candidate.name}
          </p>
          <p className="truncate text-[13px] text-muted">
            {[
              candidate.role_name,
              candidate.city,
              candidate.playing_age_min && candidate.playing_age_max
                ? `${candidate.playing_age_min}–${candidate.playing_age_max}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Tag className="ml-auto shrink-0">
          {APPLICATION_STATUS_LABEL[candidate.status]}
        </Tag>
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
            {errorMessage(selfTapes.error, "Could not open this tape")}
          </FormError>
        ) : tape ? (
          <div className="flex flex-col gap-2">
            <video
              src={tape.url}
              controls
              preload="metadata"
              className="w-full rounded-btn border border-line bg-black"
              onPlay={() => {
                watched.current.plays += 1;
                // Revenir sur une tape déjà lue est un signal en soi — c'est le
                // geste d'une équipe qui hésite, pas celui d'un premier tri.
                if (watched.current.plays > 1) {
                  engagement.mutate({
                    applicationId: candidate.application_id,
                    kind: "AUDITION_REWATCHED",
                  });
                }
              }}
              onTimeUpdate={(event) => {
                if (watched.current.completed) return;
                const video = event.currentTarget;
                if (!video.duration || !Number.isFinite(video.duration)) return;
                const progress = video.currentTime / video.duration;
                // 90 % plutôt que `onEnded` : personne ne regarde le générique
                // d'une self-tape, et `ended` ne se déclenche pas si on ferme
                // la fiche sur les dernières secondes.
                if (progress < 0.9) return;
                watched.current.completed = true;
                engagement.mutate({
                  applicationId: candidate.application_id,
                  kind: "AUDITION_COMPLETED",
                  progress,
                });
              }}
            />
            {tape.check && <TapeCheckCard check={tape.check} />}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
              <span>Sent {relativeTime(tape.submittedAt)}</span>
              {tapeDuration && (
                <span className="font-mono">{tapeDuration}</span>
              )}
              {tape.bytes && <span>{formatBytes(tape.bytes)}</span>}
              {(selfTapes.data?.length ?? 0) > 1 && (
                <span>
                  {(selfTapes.data?.length ?? 0) - 1} earlier take(s) replaced
                </span>
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
            Your role in this organization is read-only — you can watch the
            tape, not vote.
          </p>
        ) : (
          <>
            {/* Trois choix, trois colonnes : au pouce, une grille vaut mieux
                qu'un retour à la ligne 2+1. */}
            <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
              {VOTES.map((vote) => {
                const Icon = vote.icon;
                const active = myVote === vote.value;
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
                        });
                        setVoteComment("");
                      }, "Could not save your vote")
                    }
                    className={cn(
                      "inline-flex items-center justify-center gap-1.5 rounded-field border px-2 py-2.5 text-[13px] font-semibold transition-colors sm:gap-2 sm:px-3.5 sm:text-[14px]",
                      active
                        ? "border-ink bg-ink text-white"
                        : "border-line bg-card hover:bg-paper",
                    )}
                  >
                    <Icon className={cn("h-4 w-4", !active && vote.tone)} />
                    {vote.label}
                  </button>
                );
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
            {votedCount} of {teamCount} teammate{teamCount === 1 ? "" : "s"}{" "}
            reviewed
          </span>
          <ul className="flex flex-wrap gap-2">
            {teamReviews.map(({ id, name, avatarUrl, review }) => (
              <li
                key={id}
                className={cn(
                  "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px]",
                  review
                    ? "bg-paper text-ink"
                    : "border border-dashed border-line text-muted",
                )}
                title={review?.comment ?? undefined}
              >
                <Avatar src={avatarUrl ?? undefined} name={name} size="xs" />
                <span className="truncate">{name}</span>
                <span className="shrink-0 font-semibold">
                  {review
                    ? review.vote === "good"
                      ? "· Good"
                      : review.vote === "maybe"
                        ? "· Maybe"
                        : "· No go"
                    : "· not yet"}
                </span>
              </li>
            ))}
          </ul>

          {reviewsWithComment.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {reviewsWithComment.map((review) => (
                <li
                  key={`why-${review.id}`}
                  className="text-[12.5px] text-muted"
                >
                  <span className="font-semibold text-ink">
                    {[review.reviewer?.first_name, review.reviewer?.last_name]
                      .filter(Boolean)
                      .join(" ") || "Teammate"}
                    :
                  </span>{" "}
                  {review.comment}
                </li>
              ))}
            </ul>
          )}
        </div>
      </FormField>

      {/* Un callback se propose avec ce qu'il faut pour l'honorer. */}
      {mayDecide && ["shortlisted", "callback"].includes(candidate.status) && (
        <Button
          variant="secondary"
          size="sm"
          className="w-fit"
          onClick={() => setCallbackOpen(true)}
        >
          Request a callback
        </Button>
      )}

      {callbackOpen && (
        <RequestCallbackModal
          applicationId={candidate.application_id}
          talentName={candidate.name ?? "this talent"}
          onClose={() => setCallbackOpen(false)}
        />
      )}

      {/* ── Decision ── */}
      <FormField label="Status" htmlFor="candidate-status" plainLabel>
        <SelectInput
          id="candidate-status"
          disabled={!mayDecide}
          title={
            mayDecide ? undefined : "Your role cannot decide on candidates"
          }
          value={candidate.status}
          onChange={(event) =>
            run(
              () =>
                mutations.setApplicationStatus.mutateAsync({
                  applicationId: candidate.application_id,
                  status: event.target.value as ApplicationStatus,
                }),
              "Could not change the status",
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
          The talent sees this status on their audition — votes and notes stay
          inside your team.
        </p>
      </FormField>

      {/* L'avis de l'IA vient **après** le vote et la décision.
          Deux raisons, et la seconde compte plus que la première :
            · sur un téléphone, il fallait faire défiler une analyse entière
              avant d'atteindre les boutons — l'action principale était enterrée ;
            · le cahier des charges dit que l'IA reste assistive. Lire une note
              chiffrée avant de se prononcer, c'est se laisser influencer par
              elle. On regarde, on tranche, puis on confronte. */}
      {tape && (
        <AiTapeReview
          selfTapeId={tape.id}
          tapeUrl={tape.url}
          role={role ?? null}
          canRequest={mayReview}
        />
      )}

      {/* ── Notes ── */}
      <FormField
        label="Team notes — internal"
        htmlFor="candidate-note"
        plainLabel
      >
        <TextArea
          id="candidate-note"
          rows={2}
          disabled={!mayNote}
          placeholder={
            mayNote
              ? "What you want the team to know. The actor never sees this."
              : "Your role cannot add notes."
          }
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            disabled={!mayNote || !note.trim() || mutations.addNote.isPending}
            icon={
              mutations.addNote.isPending ? (
                <Spinner />
              ) : (
                <MessageSquare className="h-3.5 w-3.5" />
              )
            }
            onClick={() =>
              run(async () => {
                await mutations.addNote.mutateAsync({
                  applicationId: candidate.application_id,
                  body: note,
                });
                setNote("");
              }, "Could not save your note")
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
                      .join(" ")}
                    size="xs"
                  />
                  <span className="text-[12px] font-semibold text-ink">
                    {[item.author?.first_name, item.author?.last_name]
                      .filter(Boolean)
                      .join(" ")}
                  </span>
                  <span className="text-[11px] text-muted">
                    {relativeTime(item.created_at)}
                  </span>
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
            Message {candidate.name.split(" ")[0]}
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          icon={<Check className="h-4 w-4" />}
          onClick={onClose}
        >
          Done
        </Button>
      </div>
    </EditModal>
  );
}
