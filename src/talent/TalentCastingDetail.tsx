import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Bookmark,
  Calendar,
  Check,
  Clapperboard,
  Film,
  Globe,
  Languages,
  MapPin,
  Sparkles,
  Users,
} from 'lucide-react'
import { Avatar, Button, Card, FormError, Spinner, Tag } from '@/components/ui'
import { EditModal, Field, TextArea } from '@/components/EditModal'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCasting, useSaveCasting, useSavedCastings } from '@/features/castings/queries'
import { useApplicationMutations, useMyApplications } from '@/features/applications/queries'
import { useLanguagesCatalog, useTalentProfile } from '@/features/talent/queries'
import {
  APPLICATION_STATUS_LABEL,
  APPLICATION_STATUS_TONE,
  deadlineLabel,
  formatDate,
  isClosingSoon,
} from '@/lib/format'
import { publicUrl } from '@/lib/storage'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import type { RoleRow } from '@/types/database'

/**
 * A published casting call and its roles — and the place where a talent really
 * applies: "Apply" writes the `applications` row the production will review.
 */
export function TalentCastingDetail() {
  const { castingId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const profileId = profile?.id

  const casting = useCasting(castingId)
  const languages = useLanguagesCatalog()
  const applications = useMyApplications(profileId)
  const saved = useSavedCastings(profileId)
  const saveCasting = useSaveCasting(profileId)

  const [applyTo, setApplyTo] = useState<RoleRow | null>(null)

  if (casting.isLoading || (!casting.data && !casting.error)) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!casting.data) {
    return (
      <div className="flex flex-col gap-4">
        <FormError>
          {errorMessage(casting.error, 'This casting call is not available any more.')}
        </FormError>
        <Link to="/talent/casting-calls" className="text-sm font-semibold text-link hover:underline">
          Back to casting calls
        </Link>
      </div>
    )
  }

  const data = casting.data
  // Roles store language codes; show the names productions and talents read.
  const languageName = (code: string) =>
    (languages.data ?? []).find((language) => language.code === code)?.name ?? code
  const isSaved = (saved.data ?? []).includes(data.id)
  const myApplications = applications.data ?? []
  const closed = data.status !== 'published' || (data.deadline_at && new Date(data.deadline_at) < new Date())

  return (
    <div className="flex flex-col gap-5 pb-10">
      <button
        onClick={() => navigate('/talent/casting-calls')}
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Casting calls
      </button>

      {/* ── Project header ── */}
      <Card flush className="overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:gap-6">
          <div className="h-56 w-full shrink-0 overflow-hidden rounded-card bg-line sm:h-64 sm:w-44">
            {data.project?.poster_url && (
              <img src={data.project.poster_url} alt="" className="h-full w-full object-cover" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[1.6rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[2rem]">
                {data.project?.title ?? data.title}
              </h1>
              {data.project?.production_type && <Tag>{data.project.production_type}</Tag>}
              {data.project?.genre && <Tag tone="cream">{data.project.genre}</Tag>}
            </div>

            <p className="mt-1 text-[15px] text-muted">{data.title}</p>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted">
              {data.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {data.location}
                </span>
              )}
              {data.project?.company_name && (
                <span className="inline-flex items-center gap-1.5">
                  <Clapperboard className="h-3.5 w-3.5" />
                  {data.project.company_name}
                </span>
              )}
              {(data.project?.shooting_start || data.project?.shooting_end) && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Shooting {formatDate(data.project.shooting_start)}
                  {data.project.shooting_end ? ` → ${formatDate(data.project.shooting_end)}` : ''}
                </span>
              )}
              {data.compensation && (
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  {data.compensation}
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Tag tone={isClosingSoon(data.deadline_at) ? 'no' : 'neutral'}>
                {deadlineLabel(data.deadline_at)}
              </Tag>
              <button
                type="button"
                onClick={() => saveCasting.mutate({ castingId: data.id, saved: isSaved })}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-field border px-3.5 text-[13px] font-semibold transition-colors',
                  isSaved
                    ? 'border-ink bg-ink text-white'
                    : 'border-line bg-card text-ink hover:border-ink/30',
                )}
              >
                <Bookmark className={cn('h-4 w-4', isSaved && 'fill-current')} />
                {isSaved ? 'Saved' : 'Save'}
              </button>
            </div>

            {data.project?.synopsis && (
              <p className="mt-4 text-[14px] leading-relaxed text-ink/90">{data.project.synopsis}</p>
            )}
          </div>
        </div>

        {data.project?.director_brief && (
          <div className="border-t border-line bg-paper px-5 py-4">
            <span className="tech-label">Director’s brief</span>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink/90">
              {data.project.director_brief}
            </p>
          </div>
        )}
      </Card>

      {/* ── Roles ── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="tech-label inline-flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            Roles ({data.roles.length})
          </h2>
          {closed && <Tag tone="no">Closed</Tag>}
        </div>

        {data.roles.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="No role published yet"
            description="The production has not opened a role on this casting call."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {data.roles.map((role) => {
              const application = myApplications.find((item) => item.role_id === role.id)
              return (
                <li key={role.id}>
                  <Card className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-[18px] font-bold text-ink">
                            {role.name}
                          </h3>
                          <Tag tone={role.role_type === 'lead' ? 'gold' : 'neutral'}>
                            {role.role_type === 'lead'
                              ? 'Lead'
                              : role.role_type === 'contestant'
                                ? 'Contestant'
                                : 'Supporting'}
                          </Tag>
                        </div>
                        {role.description && (
                          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink/90">
                            {role.description}
                          </p>
                        )}
                      </div>

                      {application ? (
                        <div className="flex flex-col items-end gap-1.5">
                          <Tag tone={APPLICATION_STATUS_TONE[application.status]}>
                            {APPLICATION_STATUS_LABEL[application.status]}
                          </Tag>
                          <Link
                            to="/talent/auditions"
                            className="text-[12px] font-semibold text-link hover:underline"
                          >
                            See your audition
                          </Link>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="premium"
                          disabled={Boolean(closed)}
                          onClick={() => setApplyTo(role)}
                        >
                          {closed ? 'Closed' : 'Apply for this role'}
                        </Button>
                      )}
                    </div>

                    <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3 text-[13px] sm:grid-cols-4">
                      <Detail
                        icon={<Users className="h-3.5 w-3.5" />}
                        label="Playing age"
                        value={
                          role.playing_age_min !== null && role.playing_age_max !== null
                            ? `${role.playing_age_min}–${role.playing_age_max}`
                            : null
                        }
                      />
                      <Detail
                        icon={<Sparkles className="h-3.5 w-3.5" />}
                        label="Gender"
                        value={role.gender_pref}
                      />
                      <Detail
                        icon={<Languages className="h-3.5 w-3.5" />}
                        label="Languages"
                        value={
                          role.languages.length > 0
                            ? role.languages.map(languageName).join(', ')
                            : null
                        }
                      />
                      <Detail
                        icon={<MapPin className="h-3.5 w-3.5" />}
                        label="Location"
                        value={role.location ?? data.location}
                      />
                    </dl>

                    {role.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {role.skills.map((skill) => (
                          <Tag key={skill} tone="neutral">
                            {skill}
                          </Tag>
                        ))}
                      </div>
                    )}

                    {role.selftape_instructions && (
                      <div className="rounded-field bg-paper p-3.5">
                        <span className="tech-label inline-flex items-center gap-1.5">
                          <Film className="h-3.5 w-3.5" />
                          Self-tape instructions
                        </span>
                        <p className="mt-1.5 text-[14px] leading-relaxed text-ink/90">
                          {role.selftape_instructions}
                        </p>
                      </div>
                    )}

                    {role.sides_url && (
                      <a
                        href={role.sides_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-link hover:underline"
                      >
                        <Globe className="h-3.5 w-3.5" />
                        Download the sides
                      </a>
                    )}
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {applyTo && (
        <ApplyModal
          role={applyTo}
          castingTitle={data.project?.title ?? data.title}
          onClose={() => setApplyTo(null)}
        />
      )}
    </div>
  )
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string | null
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-label font-semibold uppercase tracking-label text-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-ink">{value || '—'}</dd>
    </div>
  )
}

/** The apply form: a note, a headshot and a showreel picked from your media. */
function ApplyModal({
  role,
  castingTitle,
  onClose,
}: {
  role: RoleRow
  castingTitle: string
  onClose: () => void
}) {
  const toast = useToast()
  const { profile } = useAuth()
  const profileId = profile?.id
  const talent = useTalentProfile(profileId)
  const { apply } = useApplicationMutations(profileId)

  const media = talent.data?.media ?? []
  const headshots = media.filter((asset) => asset.kind === 'headshot' || asset.kind === 'portfolio')
  const showreels = media.filter((asset) => asset.kind === 'showreel')

  const [note, setNote] = useState('')
  const [headshotId, setHeadshotId] = useState<string | null>(headshots[0]?.id ?? null)
  const [showreelId, setShowreelId] = useState<string | null>(showreels[0]?.id ?? null)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    try {
      await apply.mutateAsync({ roleId: role.id, note, headshotId, showreelId })
      toast(`Application sent for ${role.name}`)
      onClose()
    } catch (applyError) {
      setError(errorMessage(applyError, 'Could not send your application'))
    }
  }

  return (
    <EditModal
      open
      title={`Apply — ${role.name}`}
      onClose={onClose}
      onSave={submit}
      saveLabel={apply.isPending ? 'Sending…' : 'Submit application'}
    >
      {error && <FormError>{error}</FormError>}

      <p className="text-[13px] text-muted">
        {castingTitle} · your profile is attached automatically. The production sees your name,
        casting details, skills and credits.
      </p>

      <Field label="Note to the casting director">
        <TextArea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional — anything they should know."
        />
      </Field>

      <Field label="Headshot">
        {headshots.length === 0 ? (
          <p className="text-[13px] text-muted">
            No headshot on your profile yet — you can still apply and add one later.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {headshots.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => setHeadshotId(asset.id)}
                className={cn(
                  'h-20 w-16 overflow-hidden rounded-btn border-2 transition-colors',
                  headshotId === asset.id ? 'border-ink' : 'border-transparent opacity-70',
                )}
              >
                <img
                  src={publicUrl(asset.bucket, asset.path)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </Field>

      <Field label="Showreel">
        {showreels.length === 0 ? (
          <p className="text-[13px] text-muted">No showreel on your profile yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {showreels.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => setShowreelId(asset.id === showreelId ? null : asset.id)}
                className={cn(
                  'flex items-center gap-2.5 rounded-btn border px-3 py-2 text-left text-[13px] transition-colors',
                  showreelId === asset.id
                    ? 'border-ink bg-paper text-ink'
                    : 'border-line text-muted hover:border-ink/30',
                )}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink/5">
                  {showreelId === asset.id ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Film className="h-3.5 w-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {asset.caption ?? asset.path.split('/').pop()}
                </span>
              </button>
            ))}
          </div>
        )}
      </Field>

      {apply.isPending && (
        <span className="flex items-center gap-2 text-[13px] text-muted">
          <Spinner />
          Sending your application…
        </span>
      )}

      <p className="flex items-center gap-2 text-[12px] text-muted">
        <Avatar src={profile?.avatar_url ?? undefined} name="You" size="xs" />
        Submitted as {[profile?.first_name, profile?.last_name].filter(Boolean).join(' ')}
      </p>
    </EditModal>
  )
}
