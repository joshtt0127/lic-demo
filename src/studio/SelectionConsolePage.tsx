import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  Film,
  LayoutGrid,
  Search,
  Users,
} from 'lucide-react'
import { Avatar, Button, Card, FormError, Input, SelectInput, Tag } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { SegmentedControl } from '@/components/form/SegmentedControl'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentOrganization } from '@/features/organizations/queries'
import {
  useCandidatesForRoles,
  useOrgCasting,
  useStudioMutations,
} from '@/features/studio/queries'
import { can } from '@/lib/access'
import { APPLICATION_STATUS_LABEL } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import type { ApplicationStatus, CandidateViewRow } from '@/types/database'
import { CandidateReviewModal } from './CandidateReviewModal'

/**
 * Selection console — the casting decision surface.
 *
 * **Board**: every candidate of the casting, in the column of their real
 * status. Moving a card writes that status on the application, which is the
 * same row the talent sees on their audition. Drag if you have a mouse, use the
 * card's own selector otherwise — the console is not drag-only.
 *
 * **Wall**: one tile per role, showing who is cast (or how far the role is
 * from it). This is the view a director asks for: "where are we?".
 */

type ColumnKey = 'new' | 'reviewing' | 'shortlist' | 'callback' | 'offer' | 'cast' | 'out'

const COLUMNS: {
  key: ColumnKey
  label: string
  statuses: ApplicationStatus[]
  /** The status a card takes when dropped here. */
  target: ApplicationStatus
  tone: string
}[] = [
  { key: 'new', label: 'New', statuses: ['submitted'], target: 'submitted', tone: 'bg-paper' },
  {
    key: 'reviewing',
    label: 'Reviewing',
    statuses: ['viewed', 'under_review'],
    target: 'under_review',
    tone: 'bg-signal-maybe/5',
  },
  {
    key: 'shortlist',
    label: 'Shortlist',
    statuses: ['shortlisted'],
    target: 'shortlisted',
    tone: 'bg-signal-good-bg/60',
  },
  {
    key: 'callback',
    label: 'Callback',
    statuses: ['callback'],
    target: 'callback',
    tone: 'bg-link/5',
  },
  { key: 'offer', label: 'Offer', statuses: ['offer'], target: 'offer', tone: 'bg-cream/40' },
  { key: 'cast', label: 'Cast', statuses: ['cast'], target: 'cast', tone: 'bg-gold/10' },
  {
    key: 'out',
    label: 'Not selected',
    statuses: ['not_selected', 'withdrawn'],
    target: 'not_selected',
    tone: 'bg-line/30',
  },
]

const MOVE_TO: ApplicationStatus[] = [
  'submitted',
  'viewed',
  'under_review',
  'shortlisted',
  'callback',
  'offer',
  'cast',
  'not_selected',
]

export function SelectionConsolePage() {
  const { castingId } = useParams()
  const toast = useToast()
  const { profile } = useAuth()
  const { organization } = useCurrentOrganization(profile?.id)
  const casting = useOrgCasting(castingId)
  const roles = useMemo(() => casting.data?.roles ?? [], [casting.data])
  const candidates = useCandidatesForRoles(roles.map((role) => role.id))
  const mutations = useStudioMutations(organization?.id, profile?.id)

  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<'board' | 'wall'>('board')
  const [roleFilter, setRoleFilter] = useState(params.get('role') ?? '')
  const [query, setQuery] = useState('')
  const [reviewing, setReviewing] = useState<CandidateViewRow | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<ColumnKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mayDecide = can(organization?.role, 'candidate:decide')

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (candidates.data ?? [])
      .filter((candidate) => (roleFilter ? candidate.role_id === roleFilter : true))
      .filter((candidate) => (needle ? candidate.name.toLowerCase().includes(needle) : true))
  }, [candidates.data, query, roleFilter])

  const byColumn = useMemo(() => {
    const map = new Map<ColumnKey, CandidateViewRow[]>()
    for (const column of COLUMNS) map.set(column.key, [])
    for (const candidate of rows) {
      const column = COLUMNS.find((item) => item.statuses.includes(candidate.status))
      if (column) map.get(column.key)?.push(candidate)
    }
    // Best first inside a column — the score is counted from the team's votes.
    for (const list of map.values()) list.sort((a, b) => b.score - a.score)
    return map
  }, [rows])

  async function move(candidate: CandidateViewRow, status: ApplicationStatus) {
    if (candidate.status === status) return
    setError(null)
    try {
      await mutations.setApplicationStatus.mutateAsync({
        applicationId: candidate.application_id,
        status,
      })
      toast(`${candidate.name} → ${APPLICATION_STATUS_LABEL[status]}`)
    } catch (moveError) {
      setError(errorMessage(moveError, 'Could not move this candidate'))
    }
  }

  function updateRoleFilter(value: string) {
    setRoleFilter(value)
    const next = new URLSearchParams(params)
    if (value) next.set('role', value)
    else next.delete('role')
    setParams(next, { replace: true })
  }

  if (casting.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (!casting.data) {
    return (
      <div className="flex flex-col gap-4">
        <FormError>{errorMessage(casting.error, 'This casting is not available')}</FormError>
        <Link to="/studio/casting-calls" className="text-sm font-semibold text-link hover:underline">
          Back to castings
        </Link>
      </div>
    )
  }

  const data = casting.data

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/studio/casting/${data.id}`}
            className="-ml-1 inline-flex h-8 items-center gap-1.5 rounded-btn px-1 text-[13px] font-semibold text-muted hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {data.project?.title ?? data.title}
          </Link>
          <h1 className="font-display text-[1.6rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[2rem]">
            Selection console
          </h1>
          <p className="mt-0.5 text-[14px] text-muted">
            {rows.length} candidate{rows.length === 1 ? '' : 's'} ·{' '}
            {roles.length} role{roles.length === 1 ? '' : 's'}
            {mayDecide ? '' : ' · read-only for your role'}
          </p>
        </div>

        <SegmentedControl
          options={[
            { value: 'board', label: 'Board' },
            { value: 'wall', label: 'Wall' },
          ]}
          value={view}
          onChange={(value) => value && setView(value as typeof view)}
        />
      </header>

      {error && <FormError>{error}</FormError>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[200px] flex-1">
          <Input
            icon={<Search className="h-4 w-4" />}
            placeholder="Find a candidate…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <SelectInput
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(event) => updateRoleFilter(event.target.value)}
          className="w-[200px]"
        >
          <option value="">All roles</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </SelectInput>
      </div>

      {candidates.isLoading ? (
        <Skeleton className="h-80" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title={query || roleFilter ? 'No candidate matches' : 'No candidate yet'}
          description={
            query || roleFilter
              ? undefined
              : 'Candidates appear here as soon as talents apply to a published role.'
          }
        />
      ) : view === 'wall' ? (
        <WallView
          roles={roles}
          rows={rows}
          onOpen={setReviewing}
          onFocusRole={(roleId) => {
            // "Work on this role" means: the board, on that role only.
            updateRoleFilter(roleId)
            setView('board')
          }}
        />
      ) : (
        <div className="w-full overflow-x-auto pb-2">
          <div className="flex min-w-[900px] items-start gap-3">
            {COLUMNS.map((column) => {
              const items = byColumn.get(column.key) ?? []
              return (
                <section
                  key={column.key}
                  onDragOver={(event) => {
                    if (!mayDecide) return
                    event.preventDefault()
                    setOver(column.key)
                  }}
                  onDragLeave={() => setOver((current) => (current === column.key ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault()
                    setOver(null)
                    const id = event.dataTransfer.getData('text/plain') || dragging
                    const candidate = rows.find((item) => item.application_id === id)
                    if (candidate) void move(candidate, column.target)
                  }}
                  className={cn(
                    'flex w-[230px] shrink-0 flex-col gap-2 rounded-card border p-2.5 transition-colors',
                    column.tone,
                    over === column.key ? 'border-ink' : 'border-line',
                  )}
                >
                  <header className="flex items-center justify-between px-1">
                    <span className="tech-label">{column.label}</span>
                    <span className="font-mono text-[11px] text-muted">{items.length}</span>
                  </header>

                  {items.length === 0 ? (
                    <p className="px-1 pb-2 text-[12px] text-muted">
                      {mayDecide ? 'Drop a candidate here' : 'Nobody'}
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {items.map((candidate) => (
                        <li key={candidate.application_id}>
                          <CandidateCard
                            candidate={candidate}
                            draggable={mayDecide}
                            dragging={dragging === candidate.application_id}
                            onDragStart={(event) => {
                              event.dataTransfer.setData('text/plain', candidate.application_id)
                              setDragging(candidate.application_id)
                            }}
                            onDragEnd={() => setDragging(null)}
                            onOpen={() => setReviewing(candidate)}
                            onMove={(status) => void move(candidate, status)}
                            canMove={mayDecide}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
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

function CandidateCard({
  candidate,
  draggable,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
  onMove,
  canMove,
}: {
  candidate: CandidateViewRow
  draggable: boolean
  dragging: boolean
  onDragStart: (event: React.DragEvent) => void
  onDragEnd: () => void
  onOpen: () => void
  onMove: (status: ApplicationStatus) => void
  canMove: boolean
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'flex flex-col gap-2 rounded-field border border-line bg-card p-2.5 shadow-card transition-opacity',
        draggable && 'cursor-grab active:cursor-grabbing',
        dragging && 'opacity-40',
      )}
    >
      <button onClick={onOpen} className="flex min-w-0 items-center gap-2 text-left">
        <Avatar src={candidate.avatar_url ?? undefined} name={candidate.name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-bold text-ink">{candidate.name}</span>
          <span className="block truncate text-[11.5px] text-muted">{candidate.role_name}</span>
        </span>
        <span className="shrink-0 font-display text-[14px] font-extrabold text-ink">
          {candidate.score}
        </span>
      </button>

      <div className="flex items-center gap-1.5">
        {candidate.has_self_tape && (
          <Tag tone="link" className="px-2 py-0">
            <Film className="h-3 w-3" />
          </Tag>
        )}
        {candidate.good_count > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted">
            <span className="h-2 w-2 rounded-full bg-signal-good" />
            {candidate.good_count}
          </span>
        )}
        {candidate.maybe_count > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted">
            <span className="h-2 w-2 rounded-full bg-signal-maybe" />
            {candidate.maybe_count}
          </span>
        )}
        {candidate.no_count > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted">
            <span className="h-2 w-2 rounded-full bg-signal-no" />
            {candidate.no_count}
          </span>
        )}
      </div>

      {/* Not drag-only: the same move, with a keyboard. */}
      <SelectInput
        aria-label={`Move ${candidate.name}`}
        value={candidate.status}
        disabled={!canMove}
        onChange={(event) => onMove(event.target.value as ApplicationStatus)}
        className="h-8 text-[12px]"
      >
        {MOVE_TO.map((status) => (
          <option key={status} value={status}>
            {APPLICATION_STATUS_LABEL[status]}
          </option>
        ))}
      </SelectInput>
    </div>
  )
}

/** One tile per role: who is cast, or how close the role is to being cast. */
function WallView({
  roles,
  rows,
  onOpen,
  onFocusRole,
}: {
  roles: { id: string; name: string; role_type: string }[]
  rows: CandidateViewRow[]
  onOpen: (candidate: CandidateViewRow) => void
  onFocusRole: (roleId: string) => void
}) {
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {roles.map((role) => {
        const own = rows.filter((candidate) => candidate.role_id === role.id)
        const chosen =
          own.find((candidate) => candidate.status === 'cast') ??
          own.find((candidate) => candidate.status === 'offer') ??
          null
        const shortlisted = own.filter((candidate) =>
          ['shortlisted', 'callback'].includes(candidate.status),
        )

        return (
          <li key={role.id}>
            <Card flush className="flex h-full flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-display text-[15px] font-bold text-ink">
                    {role.name}
                  </span>
                  <span className="block text-[12px] text-muted">
                    {own.length} candidate{own.length === 1 ? '' : 's'}
                  </span>
                </span>
                {chosen ? (
                  <Tag tone={chosen.status === 'cast' ? 'gold' : 'cream'}>
                    {APPLICATION_STATUS_LABEL[chosen.status]}
                  </Tag>
                ) : (
                  <Tag>{shortlisted.length} shortlisted</Tag>
                )}
              </div>

              {chosen ? (
                <button
                  onClick={() => onOpen(chosen)}
                  className="flex flex-1 items-center gap-3 p-4 text-left"
                >
                  <Avatar src={chosen.avatar_url ?? undefined} name={chosen.name} size="lg" />
                  <span className="min-w-0">
                    <span className="block truncate font-display text-[16px] font-bold text-ink">
                      {chosen.name}
                    </span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[12.5px] text-signal-good">
                      <Check className="h-3.5 w-3.5" />
                      {chosen.status === 'cast' ? 'Cast for this role' : 'Offer sent'}
                    </span>
                  </span>
                </button>
              ) : (
                <div className="flex flex-1 flex-col justify-between gap-3 p-4">
                  <div className="flex -space-x-2">
                    {own.slice(0, 5).map((candidate) => (
                      <Avatar
                        key={candidate.application_id}
                        src={candidate.avatar_url ?? undefined}
                        name={candidate.name}
                        size="sm"
                        ring
                      />
                    ))}
                    {own.length === 0 && (
                      <span className="text-[13px] text-muted">Nobody has applied yet.</span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<LayoutGrid className="h-3.5 w-3.5" />}
                    onClick={() => onFocusRole(role.id)}
                  >
                    Work on this role
                  </Button>
                </div>
              )}
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
