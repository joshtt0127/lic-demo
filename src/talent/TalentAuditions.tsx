import { Link } from 'react-router-dom'
import { Check, Film, MapPin, Video, X } from 'lucide-react'
import { Button, Card, FormError, Tag } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  useApplicationMutations,
  useMyApplications,
  type MyApplication,
} from '@/features/applications/queries'
import {
  APPLICATION_STATUS_LABEL,
  APPLICATION_STATUS_TONE,
  APPLICATION_STEPS,
  deadlineLabel,
  relativeTime,
  statusStepIndex,
} from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'

/**
 * Auditions = your applications. The very rows the production reads in its
 * casting console — same id, same status, same timestamps.
 */
export function TalentAuditions() {
  const { profile } = useAuth()
  const applications = useMyApplications(profile?.id)

  const items = applications.data ?? []
  const active = items.filter((item) => !['withdrawn', 'not_selected'].includes(item.status))
  const closed = items.filter((item) => ['withdrawn', 'not_selected'].includes(item.status))

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-[1.6rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[1.9rem]">
          Auditions
        </h1>
        <p className="mt-1 text-[15px] text-muted">
          {applications.isLoading
            ? 'Loading your auditions…'
            : items.length === 0
              ? 'Nothing submitted yet'
              : `${active.length} in progress · ${items.length} total`}
        </p>
      </header>

      {applications.error && (
        <FormError>{errorMessage(applications.error, 'Could not load your auditions')}</FormError>
      )}

      {applications.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Film className="h-5 w-5" />}
          title="No audition yet"
          description="Every role you apply to shows up here, with the status the production gives it."
          action={
            <Link
              to="/talent/casting-calls"
              className="inline-flex h-10 items-center rounded-field bg-ink px-4 text-[14px] font-bold text-white"
            >
              Browse casting calls
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
              <span className="tech-label">Closed</span>
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

function AuditionCard({
  application,
  muted,
}: {
  application: MyApplication
  muted?: boolean
}) {
  const { profile } = useAuth()
  const { withdraw } = useApplicationMutations(profile?.id)

  const currentIndex = statusStepIndex(application.status)
  const terminal = ['withdrawn', 'not_selected'].includes(application.status)

  return (
    <Card className={cn('flex flex-col gap-4', muted && 'opacity-75')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
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
              {application.role?.name ?? 'Role'}
              <span className="font-normal text-muted">
                {' '}
                — {application.project?.title ?? 'Project'}
              </span>
            </p>
            <p className="mt-0.5 text-[13px] text-muted">
              Applied {relativeTime(application.submitted_at ?? application.created_at)}
              {application.casting?.deadline_at
                ? ` · ${deadlineLabel(application.casting.deadline_at)}`
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
                {application.hasSelfTape ? 'Self-tape sent' : 'No self-tape'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Tag tone={APPLICATION_STATUS_TONE[application.status]}>
            {APPLICATION_STATUS_LABEL[application.status]}
          </Tag>
          {application.role?.casting_call_id && (
            <Link
              to={`/talent/casting/${application.role.casting_call_id}`}
              className="text-[12px] font-semibold text-link hover:underline"
            >
              View casting
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
                  {APPLICATION_STATUS_LABEL[step]}
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
            ? 'You withdrew this application.'
            : 'The production did not select you for this role.'}
        </p>
      )}

      {application.note && (
        <p className="rounded-field bg-paper p-3 text-[13px] text-ink/90">
          <span className="font-semibold">Your note: </span>
          {application.note}
        </p>
      )}

      {!terminal && application.status === 'submitted' && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            disabled={withdraw.isPending}
            onClick={() => withdraw.mutate(application.id)}
          >
            Withdraw
          </Button>
        </div>
      )}
    </Card>
  )
}
