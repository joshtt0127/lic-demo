import { Link } from 'react-router-dom'
import { Check, Film, MapPin, Video, X } from 'lucide-react'
import { Button, Card, FormError, Tag } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCallbacks } from '@/features/callbacks/queries'
import { CallbackCard } from '@/talent/CallbackCard'
import {
  useApplicationMutations,
  useMyApplications,
  type MyApplication,
} from '@/features/applications/queries'
import {
  APPLICATION_STEPS,
  deadlineLabel,
  relativeTime,
  statusStepIndex,
  talentFacingStatus,
  TALENT_STATUS_TONE,
} from '@/lib/format'
import { SelfTapePanel } from '@/components/upload/SelfTapePanel'
import {
  CASTING_STATUS_KEY,
  ROLE_STAGE_KEY,
  ROLE_STATUS_TONE,
} from '@/features/castings/lifecycle'
import { useT } from '@/lib/i18n'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'

/**
 * Auditions = your applications. The very rows the production reads in its
 * casting console — same id, same status, same timestamps.
 */
export function TalentAuditions() {
  const t = useT()
  const { profile } = useAuth()
  const applications = useMyApplications(profile?.id)

  const items = applications.data ?? []
  const active = items.filter((item) => !['withdrawn', 'not_selected'].includes(item.status))
  const closed = items.filter((item) => ['withdrawn', 'not_selected'].includes(item.status))

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-[1.6rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[1.9rem]">
          {t('auditions.title')}
        </h1>
        <p className="mt-1 text-[15px] text-muted">
          {applications.isLoading
            ? t('auditions.loading')
            : items.length === 0
              ? t('auditions.none')
              : t('auditions.summary', { active: active.length, total: items.length })}
        </p>
      </header>

      {applications.error && (
        <FormError>{errorMessage(applications.error, t('auditions.loadFailed'))}</FormError>
      )}

      {applications.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Film className="h-5 w-5" />}
          title={t('auditions.empty')}
          description={t('auditions.emptyHint')}
          action={
            <Link
              to="/talent/casting-calls"
              className="inline-flex h-10 items-center rounded-field bg-ink px-4 text-[14px] font-bold text-white"
            >
              {t('auditions.browse')}
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {active.map((application) => (
              <AuditionCard key={application.id} application={application} />
            ))}
          </div>

          {closed.length > 0 && (
            <section className="flex flex-col gap-3">
              <span className="tech-label">{t('auditions.closed')}</span>
              {closed.map((application) => (
                <AuditionCard key={application.id} application={application} muted />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}

/** Les états depuis lesquels un comédien peut encore se retirer. */
const WITHDRAWABLE: string[] = ['submitted', 'viewed', 'under_review', 'shortlisted', 'callback']

function AuditionCard({
  application,
  muted,
}: {
  application: MyApplication
  muted?: boolean
}) {
  const t = useT()
  const { profile } = useAuth()
  const { withdraw } = useApplicationMutations(profile?.id)
  const callbacks = useCallbacks(application.id)

  // Le comédien ne lit pas le statut interne : voir `talentFacingStatus`.
  const talentStatus = talentFacingStatus(application.status, application.casting?.status)
  const currentIndex = statusStepIndex(application.status)
  const terminal = ['withdrawn', 'not_selected'].includes(application.status)
  const stage = application.role ? ROLE_STAGE_KEY[application.role.status] : null
  const submissionsClosed = application.casting
    ? application.casting.status !== 'published'
    : false

  return (
    <Card className={cn('flex flex-col gap-4', muted && 'opacity-75')}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="h-16 w-12 shrink-0 overflow-hidden rounded-btn bg-line">
            {application.project?.poster_url && (
              <img
                src={application.project.poster_url}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
          </span>
          <div className="min-w-0">
            <p className="font-display text-[16px] font-bold text-ink">
              {application.role?.name ?? t('activity.role')}
              <span className="font-normal text-muted">
                {' '}
                — {application.project?.title ?? t('activity.project')}
              </span>
            </p>
            <p className="mt-0.5 text-[13px] text-muted">
              {t('auditions.applied', {
                when: relativeTime(application.submitted_at ?? application.created_at, t),
              })}
              {application.casting?.deadline_at
                ? ` · ${deadlineLabel(application.casting.deadline_at, t)}`
                : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-muted">
              {application.casting?.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {application.casting.location}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Video className="h-3 w-3" />
                {application.hasSelfTape ? t('auditions.tapeSent') : t('auditions.noTape')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Tag tone={TALENT_STATUS_TONE[talentStatus]}>
            {t(`talentStatus.${talentStatus}`)}
          </Tag>
          {stage && application.role && (
            <Tag tone={ROLE_STATUS_TONE[application.role.status]}>{t(stage)}</Tag>
          )}
          {submissionsClosed && application.casting && (
            <Tag tone="neutral">
              {t('lifecycle.closedCasting', {
                status: t(CASTING_STATUS_KEY[application.casting.status]),
              })}
            </Tag>
          )}
          {application.role?.casting_call_id && (
            <Link
              to={`/talent/casting/${application.role.casting_call_id}`}
              className="inline-flex h-8 items-center rounded-btn px-2 text-[12px] font-semibold text-link hover:bg-link/5"
            >
              {t('auditions.viewCasting')}
            </Link>
          )}
        </div>
      </div>

      {/* progress ladder */}
      {!terminal ? (
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {APPLICATION_STEPS.map((step, index) => {
            const done = index < currentIndex
            const current = index === currentIndex
            return (
              <li key={step} className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold',
                    current && 'bg-ink text-white',
                    done && 'bg-signal-good-bg text-signal-good',
                    !done && !current && 'bg-paper text-muted',
                  )}
                >
                  {done && <Check className="h-3 w-3" />}
                  {t(`status.${step}`)}
                </span>
                {index < APPLICATION_STEPS.length - 1 && (
                  <span className={cn('h-px w-3', done ? 'bg-signal-good/50' : 'bg-line')} />
                )}
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <X className="h-3.5 w-3.5" />
          {application.status === 'withdrawn'
            ? t('auditions.withdrawn')
            : t('auditions.notSelected')}
        </p>
      )}

      {application.note && (
        <p className="rounded-field bg-paper p-3 text-[13px] text-ink/90">
          <span className="font-semibold">{t('auditions.yourNote')} </span>
          {application.note}
        </p>
      )}

      <SelfTapePanel
        applicationId={application.id}
        instructions={application.role?.selftape_instructions}
        locked={terminal || submissionsClosed}
      />

      {/* Le rendez-vous proposé, avec de quoi répondre. */}
      {(callbacks.data ?? []).map((callback) => (
        <CallbackCard key={callback.id} callback={callback} />
      ))}

      {/* Se retirer reste possible tant que la production n'a pas tranché —
          exactement les états que la machine à états autorise, ni plus ni
          moins. La confirmation est là parce que c'est sans retour : pour
          revenir, il faudra recandidater. */}
      {WITHDRAWABLE.includes(application.status) && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            disabled={withdraw.isPending}
            onClick={() => {
              if (!window.confirm(t('auditions.withdrawConfirm'))) return
              withdraw.mutate(application.id)
            }}
          >
            {t('auditions.withdraw')}
          </Button>
        </div>
      )}
    </Card>
  )
}
