import { withFlag } from '@/lib/languageFlags'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowLeft,
  Bookmark,
  Calendar,
  ChevronDown,
  Clapperboard,
  Film,
  Globe,
  Languages,
  MapPin,
  Sparkles,
  User,
  Users,
} from 'lucide-react'
import { Button, FormError, Tag } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { ReadMore } from '@/components/ReadMore'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCasting, useSaveCasting, useSavedCastings } from '@/features/castings/queries'
import { useMyApplications } from '@/features/applications/queries'
import { ApplyModal } from '@/features/applications/ApplyModal'
import {
  applyGate,
  ROLE_STAGE_KEY,
  ROLE_STATUS_TONE,
  CASTING_STATUS_KEY,
} from '@/features/castings/lifecycle'
import { ReportOrBlock } from '@/components/ReportOrBlock'
import { useT } from '@/lib/i18n'
import { useProjectBriefs } from '@/features/briefs/queries'
import { BriefVideoCard } from '@/features/briefs/BriefVideoCard'
import { useLanguagesCatalog } from '@/features/talent/queries'
import {
  APPLICATION_STATUS_TONE,
  deadlineLabel,
  formatDate,
  isClosingSoon,
} from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import type { BriefVideoRow, RoleRow } from '@/types/database'
import { PosterImage } from '@/components/PosterImage'

/**
 * A published casting call and its roles — and the place where a talent really
 * applies: "Apply" writes the `applications` row the production will review.
 *
 * Direction : entrer dans un film, pas lire une base de données. L'affiche
 * porte la page, les briefs vidéo passent devant le texte, chaque rôle est une
 * carte de casting.
 */
export function TalentCastingDetail({ readOnly }: { readOnly?: boolean } = {}) {
  const t = useT()
  const { castingId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const profileId = profile?.id
  // A production account can open the same page through a shared link.
  const isTalent = !readOnly && profile?.account_type === 'talent'

  const casting = useCasting(castingId)
  const languages = useLanguagesCatalog()
  const applications = useMyApplications(profileId)
  const saved = useSavedCastings(profileId)
  const saveCasting = useSaveCasting(profileId)
  // Video Casting Breakdown™ : seulement les briefs que ce compte a le droit
  // de voir (la règle est en base — un visiteur ne reçoit que les publics).
  const briefs = useProjectBriefs(casting.data?.project?.id)
  const projectBrief = (briefs.data ?? []).find((brief) => brief.role_id === null) ?? null
  const roleBrief = (roleId: string) =>
    (briefs.data ?? []).find((brief) => brief.role_id === roleId) ?? null

  const [applyTo, setApplyTo] = useState<RoleRow | null>(null)

  if (casting.isLoading || (!casting.data && !casting.error)) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-[420px] rounded-panel" />
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
  const project = data.project
  const projectTitle = project?.title ?? data.title
  const poster = project?.poster_url ?? undefined
  const castingDirector = project?.casting_director_name ?? null
  // Roles store language codes; show the names productions and talents read.
  const languageName = (code: string) =>
    withFlag(code, (languages.data ?? []).find((language) => language.code === code)?.name ?? code)
  const isSaved = (saved.data ?? []).includes(data.id)
  const myApplications = applications.data ?? []
  // One rule for both surfaces — see features/castings/lifecycle.ts.
  const castingClosed = data.status !== 'published'
  const eyebrow = [t('casting.hero.eyebrow'), project?.production_type, project?.genre]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex flex-col gap-10 pb-12 sm:gap-14">
      <div className="flex flex-col gap-4">
        {isTalent && (
          <button
            onClick={() => navigate('/talent/casting-calls')}
            className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Casting calls
          </button>
        )}

        {!isTalent && (
          <p className="rounded-field bg-paper px-4 py-3 text-[13px] text-muted">
            This is the page talents see. Applying is only available from a talent account.
          </p>
        )}

        {/* ── Hero : l'affiche porte la page ── */}
        <section className="relative isolate overflow-hidden rounded-panel bg-ink text-white shadow-panel">
          {poster && (
            <img
              src={poster}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 -z-10 h-full w-full scale-125 object-cover opacity-45 blur-3xl"
            />
          )}
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/80 to-ink/50 md:bg-gradient-to-r md:from-ink md:via-ink/85 md:to-ink/40"
          />

          {/* Un faux casting se signale d'ici : c'est là qu'on le découvre. */}
          {!readOnly && (
            <div className="absolute right-4 top-4 rounded-full bg-white/90 sm:right-6 sm:top-6">
              <ReportOrBlock subjectType="casting_call" subjectId={data.id} authorName={projectTitle} />
            </div>
          )}

          <div className="grid gap-8 p-6 sm:p-10 md:grid-cols-[minmax(0,300px)_1fr] md:items-end md:gap-12 lg:p-12">
            <div className="mx-auto aspect-[2/3] w-full max-w-[260px] overflow-hidden rounded-card shadow-[0_30px_80px_rgba(0,0,0,0.55)] ring-1 ring-white/10 md:max-w-none">
              <PosterImage src={poster} alt={projectTitle} placeholder loading="eager" />
            </div>

            <div className="min-w-0">
              <p className="text-label font-semibold uppercase tracking-label text-white/60">{eyebrow}</p>
              <h1 className="mt-3 font-display text-[2.6rem] font-extrabold leading-[0.95] tracking-[-0.035em] sm:text-[3.6rem] lg:text-[4.4rem]">
                {projectTitle}
              </h1>
              {data.title !== projectTitle && (
                <p className="mt-3 text-[17px] text-white/75">{data.title}</p>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-white/70">
                {project?.company_name && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clapperboard className="h-3.5 w-3.5" />
                    {project.company_name}
                  </span>
                )}
                {data.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {data.location}
                  </span>
                )}
                {(project?.shooting_start || project?.shooting_end) && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(project.shooting_start)}
                    {project.shooting_end ? ` → ${formatDate(project.shooting_end)}` : ''}
                  </span>
                )}
                {data.compensation && (
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    {data.compensation}
                  </span>
                )}
              </div>

              {project?.synopsis && (
                <div className="mt-6 max-w-2xl">
                  <ReadMore
                    text={project.synopsis}
                    lines={3}
                    className="text-[15.5px] leading-relaxed text-white/85"
                    buttonClassName="text-white"
                  />
                </div>
              )}

              <div className="mt-7 flex flex-wrap items-center gap-3">
                {data.roles.length > 0 && (
                  <a
                    href="#roles"
                    className="inline-flex h-12 items-center gap-2 rounded-btn bg-cream px-5 text-[14px] font-bold text-ink transition hover:brightness-[0.97] active:scale-[0.98]"
                  >
                    {t('casting.hero.discoverRoles')}
                    <ArrowDown className="h-4 w-4" />
                  </a>
                )}
                {isTalent && (
                  <button
                    type="button"
                    onClick={() => saveCasting.mutate({ castingId: data.id, saved: isSaved })}
                    aria-pressed={isSaved}
                    className={cn(
                      'inline-flex h-12 items-center gap-2 rounded-btn border px-4 text-[14px] font-semibold transition-colors',
                      isSaved
                        ? 'border-white bg-white text-ink'
                        : 'border-white/25 text-white hover:border-white/60',
                    )}
                  >
                    <Bookmark className={cn('h-4 w-4', isSaved && 'fill-current')} />
                    {isSaved ? 'Saved' : 'Save'}
                  </button>
                )}
                <span
                  className={cn(
                    'inline-flex h-8 items-center rounded-full px-3 text-[12.5px] font-semibold',
                    isClosingSoon(data.deadline_at) ? 'bg-signal-no text-white' : 'bg-white/10 text-white/80',
                  )}
                >
                  {deadlineLabel(data.deadline_at, t)}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── Project Brief Video™ : à voir avant tout le reste ── */}
      {projectBrief && (
        <section className="flex flex-col gap-4">
          <SectionTitle eyebrow={t('casting.watchFirst')} title={t('brief.project.cardTitle')} hint={t('casting.watchFirstHint')} />
          <BriefVideoCard
            url={projectBrief.url}
            durationS={projectBrief.duration_s}
            kind="project"
            size="hero"
            title={projectTitle}
            castingDirector={castingDirector}
            className="aspect-[4/5] rounded-panel shadow-panel sm:aspect-video"
          />
        </section>
      )}

      {project?.director_brief && (
        <section className="rounded-panel border border-line bg-card px-6 py-7 sm:px-10 sm:py-9">
          <p className="tech-label">{t('casting.directorNote')}</p>
          <div className="mt-3 max-w-3xl">
            <ReadMore
              text={project.director_brief}
              lines={4}
              className="font-display text-[17px] leading-[1.65] text-ink/90 sm:text-[19px]"
              buttonClassName="text-ink"
            />
          </div>
        </section>
      )}

      {/* ── Roles : des cartes de casting, pas des formulaires ── */}
      <section id="roles" className="flex scroll-mt-24 flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle
            eyebrow={t('casting.rolesCount', { count: data.roles.length })}
            title={t('casting.theRoles')}
            hint={data.roles.length > 1 ? t('casting.rolesSubtitle', { count: data.roles.length }) : undefined}
          />
          {castingClosed && <Tag tone="no">{t(CASTING_STATUS_KEY[data.status])}</Tag>}
        </div>

        {data.roles.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title={t('casting.noRole')}
            description={t('casting.noRoleHint')}
          />
        ) : (
          <ul className={cn('grid gap-6', data.roles.length > 1 && 'md:grid-cols-2')}>
            {data.roles.map((role) => {
              const application = myApplications.find((item) => item.role_id === role.id)
              const gate = applyGate(role, data)
              return (
                <li key={role.id} className="flex">
                  <RoleCard
                    role={role}
                    brief={roleBrief(role.id)}
                    poster={poster}
                    castingDirector={castingDirector}
                    location={role.location ?? data.location}
                    languageName={languageName}
                    action={
                      !isTalent ? null : application ? (
                        <div className="flex items-center justify-between gap-3 rounded-field bg-paper px-4 py-3">
                          <Tag tone={APPLICATION_STATUS_TONE[application.status]}>
                            {t(`status.${application.status}`)}
                          </Tag>
                          <Link
                            to="/talent/auditions"
                            className="text-[13px] font-semibold text-link hover:underline"
                          >
                            {t('casting.seeAudition')}
                          </Link>
                        </div>
                      ) : gate.canApply ? (
                        <Button variant="premium" className="w-full" onClick={() => setApplyTo(role)}>
                          {t('casting.apply')}
                        </Button>
                      ) : (
                        // No dead button: say why instead.
                        <div className="rounded-field bg-paper px-4 py-3 text-center">
                          <Tag tone={ROLE_STATUS_TONE[role.status]}>{gate.reason ? t(gate.reason) : ''}</Tag>
                        </div>
                      )
                    }
                  />
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {applyTo && (
        <ApplyModal role={applyTo} castingTitle={projectTitle} onClose={() => setApplyTo(null)} />
      )}
    </div>
  )
}

function SectionTitle({ eyebrow, title, hint }: { eyebrow: string; title: string; hint?: string }) {
  return (
    <div>
      <p className="tech-label">{eyebrow}</p>
      <h2 className="mt-1.5 font-display text-[1.8rem] font-extrabold leading-tight tracking-[-0.025em] text-ink sm:text-[2.3rem]">
        {title}
      </h2>
      {hint && <p className="mt-1 text-[14.5px] text-muted">{hint}</p>}
    </div>
  )
}

function RoleCard({
  role,
  brief,
  poster,
  castingDirector,
  location,
  languageName,
  action,
}: {
  role: RoleRow
  brief: BriefVideoRow | null
  poster: string | undefined
  castingDirector: string | null
  location: string | null
  languageName: (code: string) => string
  action: React.ReactNode
}) {
  const t = useT()
  const stage = ROLE_STAGE_KEY[role.status]
  const typeLabel =
    role.role_type === 'lead'
      ? t('casting.lead')
      : role.role_type === 'contestant'
        ? t('casting.contestant')
        : t('casting.supporting')
  const criteria = [
    role.playing_age_min !== null && role.playing_age_max !== null
      ? { icon: <User className="h-3.5 w-3.5" />, text: t('casting.years', { min: role.playing_age_min, max: role.playing_age_max }) }
      : null,
    role.gender_pref ? { icon: <Sparkles className="h-3.5 w-3.5" />, text: role.gender_pref } : null,
    role.languages.length > 0
      ? { icon: <Languages className="h-3.5 w-3.5" />, text: role.languages.map(languageName).join(', ') }
      : null,
    location ? { icon: <MapPin className="h-3.5 w-3.5" />, text: location } : null,
  ].filter((item): item is { icon: React.ReactElement; text: string } => item !== null)

  return (
    <article className="flex w-full flex-col overflow-hidden rounded-card border border-line bg-card shadow-card transition-shadow hover:shadow-card-hover">
      {/* Le visuel du rôle : son brief vidéo, sinon l'affiche du projet. */}
      {brief ? (
        <BriefVideoCard
          url={brief.url}
          durationS={brief.duration_s}
          kind="role"
          title={t('brief.role.cardTitle', { name: role.name })}
          castingDirector={castingDirector}
          className="aspect-[16/10]"
        />
      ) : (
        <div className="relative aspect-[16/10] overflow-hidden bg-ink">
          {poster && (
            <img
              src={poster}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-2xl"
            />
          )}
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-transparent" />
          <p className="absolute inset-x-0 bottom-0 p-5 font-display text-[2.2rem] font-extrabold leading-none tracking-[-0.03em] text-white">
            {role.name}
          </p>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone={role.role_type === 'lead' ? 'gold' : 'neutral'}>{typeLabel}</Tag>
            {stage && <Tag tone={ROLE_STATUS_TONE[role.status]}>{t(stage)}</Tag>}
          </div>
          <h3 className="mt-3 font-display text-[1.75rem] font-extrabold leading-tight tracking-[-0.025em] text-ink">
            {role.name}
          </h3>
          {criteria.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {criteria.map((item) => (
                <li
                  key={item.text}
                  className="inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1 text-[12.5px] font-medium text-ink/80"
                >
                  {item.icon}
                  {item.text}
                </li>
              ))}
            </ul>
          )}
        </div>

        {role.description && (
          <ReadMore text={role.description} lines={3} className="text-[14.5px] leading-relaxed text-ink/85" buttonClassName="text-ink" />
        )}

        {role.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {role.skills.map((skill) => (
              <Tag key={skill} tone="neutral">
                {skill}
              </Tag>
            ))}
          </div>
        )}

        {(role.selftape_instructions || role.sides_url) && (
          <details className="group rounded-field border border-line">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[13.5px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                <Film className="h-4 w-4 text-muted" />
                {t('casting.selftapeInstructions')}
              </span>
              <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <div className="flex flex-col gap-3 border-t border-line px-4 py-3.5">
              {role.selftape_instructions && (
                <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink/85">
                  {role.selftape_instructions}
                </p>
              )}
              {role.sides_url && (
                <a
                  href={role.sides_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-link hover:underline"
                >
                  <Globe className="h-3.5 w-3.5" />
                  {t('casting.sides')}
                </a>
              )}
            </div>
          </details>
        )}

        {action && <div className="mt-auto pt-1">{action}</div>}
      </div>
    </article>
  )
}
