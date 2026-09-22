import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clapperboard, MapPin, Search, Users } from 'lucide-react'
import { Card, FormError, Input, Tag } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { SegmentedControl } from '@/components/form/SegmentedControl'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentOrganization } from '@/features/organizations/queries'
import { useStudioOverview } from '@/features/studio/queries'
import { deadlineLabel } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import type { CastingStatus } from '@/types/database'
import { NewCastingButton } from './StudioLayout'

/** Every casting call of the organization — drafts included. */

const STATUS_TONE: Record<CastingStatus, 'good' | 'neutral' | 'no' | 'link'> = {
  published: 'good',
  draft: 'neutral',
  closed: 'no',
  archived: 'neutral',
}

export function CastingCallsPage() {
  const { profile } = useAuth()
  const { organization } = useCurrentOrganization(profile?.id)
  const overview = useStudioOverview(organization?.id)

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | CastingStatus>('all')

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (overview.data?.castings ?? [])
      .filter((item) => (status === 'all' ? true : item.casting.status === status))
      .filter((item) => {
        if (!needle) return true
        return [item.casting.title, item.casting.project?.title, item.casting.location]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle)
      })
  }, [overview.data, query, status])

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.7rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[2.1rem]">
            Casting calls
          </h1>
          <p className="mt-1 text-[15px] text-muted">
            {overview.isLoading
              ? 'Loading…'
              : `${overview.data?.castings.length ?? 0} casting call${(overview.data?.castings.length ?? 0) === 1 ? '' : 's'} · ${overview.data?.newSubmissions ?? 0} new submission${(overview.data?.newSubmissions ?? 0) === 1 ? '' : 's'}`}
          </p>
        </div>
        <NewCastingButton />
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[240px] flex-1">
          <Input
            icon={<Search className="h-4 w-4" />}
            placeholder="Search a casting or project…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <SegmentedControl
          options={[
            { value: 'all', label: 'All' },
            { value: 'published', label: 'Published' },
            { value: 'draft', label: 'Drafts' },
            { value: 'closed', label: 'Closed' },
          ]}
          value={status}
          onChange={(value) => value && setStatus(value as typeof status)}
        />
      </div>

      {overview.error && (
        <FormError>{errorMessage(overview.error, 'Could not load your castings')}</FormError>
      )}

      {overview.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Clapperboard className="h-5 w-5" />}
          title={
            (overview.data?.castings.length ?? 0) === 0
              ? 'No casting call yet'
              : 'No casting matches these filters'
          }
          description={
            (overview.data?.castings.length ?? 0) === 0
              ? 'A casting call holds your roles. Publish it and talents can apply immediately.'
              : undefined
          }
          action={(overview.data?.castings.length ?? 0) === 0 ? <NewCastingButton /> : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(({ casting, submissions, newSubmissions, shortlisted, tapesToReview }) => (
            <li key={casting.id}>
              <Card flush className="overflow-hidden">
                <Link
                  to={`/studio/casting/${casting.id}`}
                  className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5"
                >
                  <span className="h-24 w-full shrink-0 overflow-hidden rounded-btn bg-line sm:h-20 sm:w-16">
                    {casting.project?.poster_url && (
                      <img
                        src={casting.project.poster_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-[17px] font-bold text-ink">
                        {casting.project?.title ?? casting.title}
                      </span>
                      <Tag tone={STATUS_TONE[casting.status]}>{casting.status}</Tag>
                      {tapesToReview > 0 && (
                        <Tag tone="no">
                          {tapesToReview} tape{tapesToReview > 1 ? 's' : ''} to review
                        </Tag>
                      )}
                    </div>
                    <p className="mt-0.5 text-[14px] text-muted">{casting.title}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
                      {casting.location && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          {casting.location}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        {casting.roles.length} role{casting.roles.length === 1 ? '' : 's'}
                      </span>
                      <span>{deadlineLabel(casting.deadline_at)}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-6 sm:gap-8">
                    <Metric value={submissions} label="Submissions" />
                    <Metric value={newSubmissions} label="New" highlight={newSubmissions > 0} />
                    <Metric value={shortlisted} label="Shortlisted" />
                  </div>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Metric({
  value,
  label,
  highlight,
}: {
  value: number
  label: string
  highlight?: boolean
}) {
  return (
    <span className="text-center">
      <span
        className={
          highlight
            ? 'block font-display text-[18px] font-extrabold text-signal-no'
            : 'block font-display text-[18px] font-extrabold text-ink'
        }
      >
        {value}
      </span>
      <span className="block text-[11px] uppercase tracking-[0.14em] text-muted">{label}</span>
    </span>
  )
}
