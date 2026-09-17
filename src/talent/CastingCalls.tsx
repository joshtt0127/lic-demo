import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bookmark, Clapperboard, MapPin, Search, Users } from 'lucide-react'
import { Card, FormError, Input, Tag } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { SegmentedControl } from '@/components/form/SegmentedControl'
import { useAuth } from '@/features/auth/AuthProvider'
import { useOpenCastings, useSaveCasting, useSavedCastings } from '@/features/castings/queries'
import { useMyApplications } from '@/features/applications/queries'
import { deadlineLabel, isClosingSoon } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'

/**
 * Casting calls, talent side — the real published castings.
 *
 * RLS decides what is visible: a draft casting simply is not returned, so there
 * is nothing to hide here.
 */
export function CastingCalls() {
  const { profile } = useAuth()
  const profileId = profile?.id
  const castings = useOpenCastings()
  const saved = useSavedCastings(profileId)
  const applications = useMyApplications(profileId)
  const saveCasting = useSaveCasting(profileId)

  // The header search lands here with ?q=
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [scope, setScope] = useState<'all' | 'saved' | 'applied'>('all')

  function updateQuery(value: string) {
    setQuery(value)
    const next = new URLSearchParams(params)
    if (value.trim()) next.set('q', value)
    else next.delete('q')
    setParams(next, { replace: true })
  }

  const savedIds = useMemo(() => new Set(saved.data ?? []), [saved.data])
  const appliedRoleIds = useMemo(
    () => new Set((applications.data ?? []).map((application) => application.role_id)),
    [applications.data],
  )

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (castings.data ?? [])
      .filter((casting) => {
        if (scope === 'saved') return savedIds.has(casting.id)
        if (scope === 'applied') return casting.roles.some((role) => appliedRoleIds.has(role.id))
        return true
      })
      .filter((casting) => {
        if (!needle) return true
        const haystack = [
          casting.title,
          casting.location,
          casting.project?.title,
          casting.project?.production_type,
          casting.project?.company_name,
          ...casting.roles.map((role) => role.name),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(needle)
      })
  }, [appliedRoleIds, castings.data, query, savedIds, scope])

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-[1.6rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[1.9rem]">
          Casting calls
        </h1>
        <p className="mt-1 text-[15px] text-muted">
          {castings.isLoading
            ? 'Loading open castings…'
            : `${castings.data?.length ?? 0} published casting call${(castings.data?.length ?? 0) === 1 ? '' : 's'} right now`}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[240px] flex-1">
          <Input
            icon={<Search className="h-4 w-4" />}
            placeholder="Search a project, role or city…"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
          />
        </div>
        <SegmentedControl
          options={[
            { value: 'all', label: 'All' },
            { value: 'saved', label: 'Saved' },
            { value: 'applied', label: 'Applied' },
          ]}
          value={scope}
          onChange={(value) => value && setScope(value as typeof scope)}
        />
      </div>

      {castings.error && <FormError>{errorMessage(castings.error, 'Could not load castings')}</FormError>}

      {castings.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          icon={<Clapperboard className="h-5 w-5" />}
          title={
            scope === 'saved'
              ? 'Nothing saved yet'
              : scope === 'applied'
                ? 'You have not applied to a casting yet'
                : query
                  ? 'No casting matches your search'
                  : 'No casting call is open right now'
          }
          description={
            scope === 'all' && !query
              ? 'When a production publishes a casting, it shows up here immediately.'
              : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {results.map((casting) => {
            const isSaved = savedIds.has(casting.id)
            const appliedCount = casting.roles.filter((role) => appliedRoleIds.has(role.id)).length

            return (
              <li key={casting.id}>
                <Card flush className="overflow-hidden">
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
                    <Link
                      to={`/talent/casting/${casting.id}`}
                      className="h-24 w-full shrink-0 overflow-hidden rounded-btn bg-line sm:h-28 sm:w-20"
                    >
                      {casting.project?.poster_url && (
                        <img
                          src={casting.project.poster_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )}
                    </Link>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/talent/casting/${casting.id}`}
                          className="font-display text-[17px] font-bold text-ink hover:underline"
                        >
                          {casting.project?.title ?? casting.title}
                        </Link>
                        {casting.project?.production_type && (
                          <Tag>{casting.project.production_type}</Tag>
                        )}
                        {appliedCount > 0 && (
                          <Tag tone="good">
                            Applied to {appliedCount} role{appliedCount > 1 ? 's' : ''}
                          </Tag>
                        )}
                      </div>

                      <p className="mt-1 text-[14px] text-muted">{casting.title}</p>

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
                        {casting.compensation && <span>{casting.compensation}</span>}
                      </div>

                      {casting.roles.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {casting.roles.slice(0, 4).map((role) => (
                            <span
                              key={role.id}
                              className="rounded-full bg-paper px-2.5 py-1 text-[12px] font-medium text-ink"
                            >
                              {role.name}
                            </span>
                          ))}
                          {casting.roles.length > 4 && (
                            <span className="px-1 py-1 text-[12px] text-muted">
                              +{casting.roles.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                      <Tag tone={isClosingSoon(casting.deadline_at) ? 'no' : 'neutral'}>
                        {deadlineLabel(casting.deadline_at)}
                      </Tag>
                      <button
                        type="button"
                        aria-label={isSaved ? 'Remove from saved' : 'Save this casting'}
                        onClick={() =>
                          saveCasting.mutate({ castingId: casting.id, saved: isSaved })
                        }
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-full border transition-colors',
                          isSaved
                            ? 'border-ink bg-ink text-white'
                            : 'border-line bg-card text-muted hover:border-ink/30 hover:text-ink',
                        )}
                      >
                        <Bookmark className={cn('h-4 w-4', isSaved && 'fill-current')} />
                      </button>
                      <Link
                        to={`/talent/casting/${casting.id}`}
                        className="inline-flex h-9 items-center rounded-field bg-ink px-4 text-[13px] font-bold text-white transition-colors hover:bg-ink/90"
                      >
                        View roles
                      </Link>
                    </div>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
