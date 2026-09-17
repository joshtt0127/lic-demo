import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Calendar,
  Eye,
  MapPin,
  Pencil,
  Plus,
  Send,
  Trash2,
  Users,
} from 'lucide-react'
import { Avatar, Button, Card, FormError, Spinner, Tag } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentOrganization } from '@/features/organizations/queries'
import {
  useCandidatesForRoles,
  useOrgCasting,
  useStudioMutations,
} from '@/features/studio/queries'
import { useLanguagesCatalog } from '@/features/talent/queries'
import { APPLICATION_STATUS_LABEL, APPLICATION_STATUS_TONE, deadlineLabel, relativeTime } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import type { CandidateViewRow, RoleRow } from '@/types/database'
import type { RoleInput } from '@/data/repositories/castings'
import { RoleForm } from './NewCastingPage'
import { CandidateReviewModal } from './CandidateReviewModal'

/**
 * A casting call, production side: its roles, its candidates, and the two
 * decisions that matter — publishing the casting, and moving a candidate.
 */
export function CastingDetailPage() {
  const { castingId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { profile } = useAuth()
  const { organization } = useCurrentOrganization(profile?.id)
  const casting = useOrgCasting(castingId)
  const mutations = useStudioMutations(organization?.id, profile?.id)

  const roleIds = (casting.data?.roles ?? []).map((role) => role.id)
  const candidates = useCandidatesForRoles(roleIds)
  const languages = useLanguagesCatalog()
  // v_candidates carries language codes; show the names.
  const languageName = (code: string) =>
    (languages.data ?? []).find((language) => language.code === code)?.name ?? code

  const [editingRole, setEditingRole] = useState<RoleRow | null>(null)
  const [addingRole, setAddingRole] = useState(false)
  const [roleDraft, setRoleDraft] = useState<RoleInput>({ name: '', roleType: 'supporting' })
  const [reviewing, setReviewing] = useState<CandidateViewRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (casting.isLoading || (!casting.data && !casting.error)) {
    return (
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!casting.data) {
    return (
      <div className="flex flex-col gap-4">
        <FormError>{errorMessage(casting.error, 'This casting call is not available')}</FormError>
        <Link to="/studio/casting-calls" className="text-sm font-semibold text-link hover:underline">
          Back to casting calls
        </Link>
      </div>
    )
  }

  const data = casting.data
  const published = data.status === 'published'

  async function run(action: () => Promise<unknown>, message: string, success?: string) {
    setError(null)
    try {
      await action()
      if (success) toast(success)
    } catch (actionError) {
      setError(errorMessage(actionError, message))
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5">
      <button
        onClick={() => navigate('/studio/casting-calls')}
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Casting calls
      </button>

      {error && <FormError>{error}</FormError>}

      {/* ── Header ── */}
      <Card className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <span className="h-28 w-20 shrink-0 overflow-hidden rounded-card bg-line">
          {data.project?.poster_url && (
            <img src={data.project.poster_url} alt="" className="h-full w-full object-cover" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[1.5rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[1.9rem]">
              {data.project?.title ?? data.title}
            </h1>
            <Tag tone={published ? 'good' : data.status === 'closed' ? 'no' : 'neutral'}>
              {data.status}
            </Tag>
          </div>
          <p className="mt-1 text-[15px] text-muted">{data.title}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted">
            {data.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {data.location}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {deadlineLabel(data.deadline_at)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {data.roles.length} role{data.roles.length === 1 ? '' : 's'} ·{' '}
              {(candidates.data ?? []).length} candidate
              {(candidates.data ?? []).length === 1 ? '' : 's'}
            </span>
            {data.compensation && <span>{data.compensation}</span>}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          {published ? (
            <Button
              variant="secondary"
              onClick={() =>
                run(
                  () => mutations.setCastingStatus.mutateAsync({ id: data.id, status: 'closed' }),
                  'Could not close the casting',
                  'Casting closed — talents can no longer apply',
                )
              }
              disabled={mutations.setCastingStatus.isPending}
            >
              Close submissions
            </Button>
          ) : (
            <Button
              icon={
                mutations.setCastingStatus.isPending ? <Spinner /> : <Send className="h-4 w-4" />
              }
              disabled={data.roles.length === 0 || mutations.setCastingStatus.isPending}
              onClick={() =>
                run(
                  () => mutations.setCastingStatus.mutateAsync({ id: data.id, status: 'published' }),
                  'Could not publish the casting',
                  'Casting published — talents can apply now',
                )
              }
            >
              {data.status === 'closed' ? 'Re-open' : 'Publish casting'}
            </Button>
          )}
          {!published && data.roles.length === 0 && (
            <p className="max-w-[180px] text-right text-[12px] text-muted">
              Add at least one role before publishing.
            </p>
          )}
        </div>
      </Card>

      {/* ── Roles & candidates ── */}
      <div className="flex items-center justify-between">
        <h2 className="tech-label">Roles & candidates</h2>
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => {
            setRoleDraft({ name: '', roleType: 'supporting' })
            setAddingRole(true)
          }}
        >
          Add a role
        </Button>
      </div>

      {addingRole && (
        <Card>
          <RoleForm
            draft={roleDraft}
            onChange={setRoleDraft}
            busy={mutations.createRole.isPending}
            onCancel={() => setAddingRole(false)}
            onAdd={() =>
              run(
                async () => {
                  await mutations.createRole.mutateAsync({
                    castingId: data.id,
                    input: { ...roleDraft, sortOrder: data.roles.length },
                  })
                  setAddingRole(false)
                },
                'Could not add the role',
                'Role added',
              )
            }
          />
        </Card>
      )}

      {data.roles.length === 0 && !addingRole ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No role yet"
          description="A casting call needs at least one role before it can be published."
          action={
            <Button size="sm" onClick={() => setAddingRole(true)}>
              Add a role
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {data.roles.map((role) => {
            const roleCandidates = (candidates.data ?? []).filter(
              (candidate) => candidate.role_id === role.id,
            )

            return (
              <Card key={role.id} className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-[18px] font-bold text-ink">{role.name}</h3>
                      <Tag tone={role.role_type === 'lead' ? 'gold' : 'neutral'}>
                        {role.role_type}
                      </Tag>
                      {role.playing_age_min !== null && role.playing_age_max !== null && (
                        <Tag>
                          {role.playing_age_min}–{role.playing_age_max}
                        </Tag>
                      )}
                      {role.gender_pref && <Tag>{role.gender_pref}</Tag>}
                    </div>
                    {role.description && (
                      <p className="mt-1.5 max-w-2xl text-[14px] text-muted">{role.description}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => setEditingRole(role)}
                      aria-label={`Edit ${role.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() =>
                        run(
                          () => mutations.deleteRole.mutateAsync(role.id),
                          'Could not delete the role',
                          'Role deleted',
                        )
                      }
                      aria-label={`Delete ${role.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-signal-no/10 hover:text-signal-no"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {editingRole?.id === role.id && (
                  <RoleForm
                    draft={{
                      name: role.name,
                      description: role.description,
                      roleType: role.role_type,
                      genderPref: role.gender_pref,
                      playingAgeMin: role.playing_age_min,
                      playingAgeMax: role.playing_age_max,
                      location: role.location,
                      languages: role.languages,
                      skills: role.skills,
                      selftapeInstructions: role.selftape_instructions,
                    }}
                    onChange={(draft) =>
                      setEditingRole({
                        ...role,
                        name: draft.name,
                        description: draft.description ?? null,
                        role_type: draft.roleType ?? role.role_type,
                        gender_pref: draft.genderPref ?? null,
                        playing_age_min: draft.playingAgeMin ?? null,
                        playing_age_max: draft.playingAgeMax ?? null,
                        location: draft.location ?? null,
                        languages: draft.languages ?? [],
                        skills: draft.skills ?? [],
                        selftape_instructions: draft.selftapeInstructions ?? null,
                      })
                    }
                    submitLabel="Save role"
                    busy={mutations.updateRole.isPending}
                    onCancel={() => setEditingRole(null)}
                    onAdd={() =>
                      run(
                        async () => {
                          await mutations.updateRole.mutateAsync({
                            id: role.id,
                            input: {
                              name: editingRole.name,
                              description: editingRole.description,
                              roleType: editingRole.role_type,
                              genderPref: editingRole.gender_pref,
                              playingAgeMin: editingRole.playing_age_min,
                              playingAgeMax: editingRole.playing_age_max,
                              location: editingRole.location,
                              languages: editingRole.languages,
                              skills: editingRole.skills,
                              selftapeInstructions: editingRole.selftape_instructions,
                            },
                          })
                          setEditingRole(null)
                        },
                        'Could not save the role',
                        'Role updated',
                      )
                    }
                  />
                )}

                {/* candidates */}
                {candidates.isLoading ? (
                  <Skeleton className="h-16" />
                ) : roleCandidates.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<Users className="h-4 w-4" />}
                    title={published ? 'No application yet' : 'Publish to start receiving tapes'}
                    description={
                      published
                        ? 'Talents matching this role see it in their casting calls.'
                        : undefined
                    }
                  />
                ) : (
                  <ul className="flex flex-col divide-y divide-line">
                    {roleCandidates.map((candidate) => (
                      <li
                        key={candidate.application_id}
                        className="flex flex-wrap items-center gap-3 py-3"
                      >
                        <Avatar
                          src={candidate.avatar_url ?? undefined}
                          name={candidate.name}
                          size="sm"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-bold text-ink">
                            {candidate.name}
                          </span>
                          <span className="block truncate text-[12px] text-muted">
                            {[
                              candidate.city,
                              candidate.playing_age_min && candidate.playing_age_max
                                ? `${candidate.playing_age_min}–${candidate.playing_age_max}`
                                : null,
                              candidate.languages.length > 0
                                ? candidate.languages.map(languageName).join(', ')
                                : null,
                              `applied ${relativeTime(candidate.submitted_at ?? candidate.created_at)}`,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>

                        {candidate.has_self_tape && (
                          <Tag tone="link" className="shrink-0">
                            Self-tape
                          </Tag>
                        )}

                        <span className="hidden shrink-0 items-center gap-1 sm:flex">
                          <VoteDot count={candidate.good_count} className="bg-signal-good" />
                          <VoteDot count={candidate.maybe_count} className="bg-signal-maybe" />
                          <VoteDot count={candidate.no_count} className="bg-signal-no" />
                        </span>

                        <span className="w-16 shrink-0 text-right font-display text-[15px] font-extrabold text-ink">
                          {candidate.score}
                        </span>

                        <Tag
                          tone={APPLICATION_STATUS_TONE[candidate.status]}
                          className="shrink-0"
                        >
                          {APPLICATION_STATUS_LABEL[candidate.status]}
                        </Tag>

                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Eye className="h-3.5 w-3.5" />}
                          onClick={() => setReviewing(candidate)}
                        >
                          Review
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {reviewing && (
        <CandidateReviewModal
          candidate={reviewing}
          orgId={organization?.id}
          onClose={() => setReviewing(null)}
        />
      )}
    </div>
  )
}

function VoteDot({ count, className }: { count: number; className: string }) {
  if (count === 0) return null
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted">
      <span className={cn('h-2 w-2 rounded-full', className)} />
      {count}
    </span>
  )
}
