import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Clock,
  Film,
  Plus,
} from 'lucide-react'
import { Button, Card, FormError, SelectInput, Tag } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { SegmentedControl } from '@/components/form/SegmentedControl'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentOrganization } from '@/features/organizations/queries'
import { useOrgCastings, useOrgProjects, useStudioMutations } from '@/features/studio/queries'
import { formatDate } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'

/**
 * Calendar — the production's real dates: when submissions close, and when each
 * project shoots. There is no event table to keep in sync; every entry here is
 * a column on a casting call or a project, which is also why the calendar can
 * *set* a deadline: it writes back to the casting.
 */

type EntryKind = 'deadline' | 'shoot-start' | 'shoot-wrap' | 'shoot'

type Entry = {
  id: string
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string
  at: string
  kind: EntryKind
  label: string
  detail: string
  href: string
}

const KIND_STYLE: Record<EntryKind, { dot: string; chip: string; icon: typeof Clock }> = {
  deadline: {
    dot: 'bg-signal-no',
    chip: 'bg-signal-no/10 text-signal-no',
    icon: Clock,
  },
  'shoot-start': {
    dot: 'bg-link',
    chip: 'bg-link/10 text-link',
    icon: Film,
  },
  'shoot-wrap': {
    dot: 'bg-link',
    chip: 'bg-link/10 text-link',
    icon: Film,
  },
  shoot: {
    dot: 'bg-link/40',
    chip: 'bg-link/5 text-link',
    icon: Film,
  },
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function dayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Monday-first grid of 6 weeks covering the month of `cursor`. */
function monthGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })
}

export function CalendarPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const { organization } = useCurrentOrganization(profile?.id)
  const castings = useOrgCastings(organization?.id)
  const projects = useOrgProjects(organization?.id)
  const mutations = useStudioMutations(organization?.id, profile?.id)

  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState(dayKey(today))
  const [view, setView] = useState<'month' | 'agenda'>('month')
  const [deadlineFor, setDeadlineFor] = useState('')
  const [error, setError] = useState<string | null>(null)

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = []

    for (const casting of castings.data ?? []) {
      if (!casting.deadline_at) continue
      list.push({
        id: `deadline-${casting.id}`,
        day: dayKey(new Date(casting.deadline_at)),
        at: casting.deadline_at,
        kind: 'deadline',
        label: 'Submissions close',
        detail: `${casting.project?.title ?? casting.title} — ${casting.title}`,
        href: `/studio/casting/${casting.id}`,
      })
    }

    for (const project of projects.data ?? []) {
      if (project.shooting_start) {
        list.push({
          id: `shoot-start-${project.id}`,
          day: dayKey(new Date(project.shooting_start)),
          at: project.shooting_start,
          kind: 'shoot-start',
          label: 'Shoot starts',
          detail: project.title,
          href: '/studio/projects',
        })
      }
      if (project.shooting_end) {
        list.push({
          id: `shoot-wrap-${project.id}`,
          day: dayKey(new Date(project.shooting_end)),
          at: project.shooting_end,
          kind: 'shoot-wrap',
          label: 'Shoot wraps',
          detail: project.title,
          href: '/studio/projects',
        })
      }
      // The days in between are the shooting window, not separate events.
      if (project.shooting_start && project.shooting_end) {
        const start = new Date(project.shooting_start)
        const end = new Date(project.shooting_end)
        const day = new Date(start)
        day.setDate(day.getDate() + 1)
        while (day < end) {
          list.push({
            id: `shoot-${project.id}-${dayKey(day)}`,
            day: dayKey(day),
            at: day.toISOString(),
            kind: 'shoot',
            label: 'Shooting',
            detail: project.title,
            href: '/studio/projects',
          })
          day.setDate(day.getDate() + 1)
        }
      }
    }

    return list.sort((a, b) => a.at.localeCompare(b.at))
  }, [castings.data, projects.data])

  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const entry of entries) {
      const bucket = map.get(entry.day)
      if (bucket) bucket.push(entry)
      else map.set(entry.day, [entry])
    }
    return map
  }, [entries])

  const grid = monthGrid(cursor)
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const todayKey = dayKey(today)
  const selectedEntries = byDay.get(selected) ?? []
  const upcoming = entries.filter((entry) => entry.day >= todayKey && entry.kind !== 'shoot')

  const monthKeys = new Set(
    grid
      .filter((date) => date.getMonth() === cursor.getMonth())
      .map((date) => dayKey(date)),
  )
  const monthEntries = entries.filter((entry) => monthKeys.has(entry.day))
  const deadlinesThisMonth = monthEntries.filter((entry) => entry.kind === 'deadline').length
  const shootDaysThisMonth = monthEntries.filter((entry) => entry.kind.startsWith('shoot')).length
  const openCastings = (castings.data ?? []).filter((casting) => casting.status === 'published')
  const undated = (castings.data ?? []).filter((casting) => !casting.deadline_at)

  const loading = castings.isLoading || projects.isLoading

  function moveMonth(delta: number) {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1))
  }

  async function setDeadline() {
    const casting = undated.find((item) => item.id === deadlineFor)
    if (!casting) return
    setError(null)
    const [year, month, day] = selected.split('-').map(Number)
    const at = new Date(year, month - 1, day, 23, 59).toISOString()
    try {
      await mutations.updateCasting.mutateAsync({ id: casting.id, input: { deadlineAt: at } })
      toast(`Submissions for ${casting.title} close on ${formatDate(at)}`)
      setDeadlineFor('')
    } catch (updateError) {
      setError(errorMessage(updateError, 'Could not set that deadline'))
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.7rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[2.1rem]">
            Calendar
          </h1>
          <p className="mt-1 text-[15px] text-muted">
            Submission deadlines and shooting windows, from your castings and projects.
          </p>
        </div>
        <SegmentedControl
          options={[
            { value: 'month', label: 'Month' },
            { value: 'agenda', label: 'Agenda' },
          ]}
          value={view}
          onChange={(value) => value && setView(value as typeof view)}
        />
      </header>

      {(castings.error || projects.error) && (
        <FormError>
          {errorMessage(castings.error ?? projects.error, 'Could not load your dates')}
        </FormError>
      )}
      {error && <FormError>{error}</FormError>}

      {/* ── What this month holds ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<Clock className="h-4 w-4" />}
          value={deadlinesThisMonth}
          label="Deadlines this month"
        />
        <Stat
          icon={<Film className="h-4 w-4" />}
          value={shootDaysThisMonth}
          label="Shoot days this month"
        />
        <Stat
          icon={<Clapperboard className="h-4 w-4" />}
          value={openCastings.length}
          label="Castings published"
        />
        <Stat
          icon={<CalendarDays className="h-4 w-4" />}
          value={undated.length}
          label="Castings with no deadline"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-[30rem]" />
          <Skeleton className="h-64" />
        </div>
      ) : view === 'agenda' ? (
        <AgendaView entries={entries} todayKey={todayKey} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* ── Month ── */}
          <Card flush className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
              <h2 className="font-display text-[18px] font-bold capitalize text-ink">
                {monthLabel}
              </h2>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
                    setSelected(todayKey)
                  }}
                >
                  Today
                </Button>
                <button
                  type="button"
                  onClick={() => moveMonth(-1)}
                  aria-label="Previous month"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-ink/30 hover:text-ink"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveMonth(1)}
                  aria-label="Next month"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-ink/30 hover:text-ink"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 px-2 pt-2 sm:px-3">
              {WEEKDAYS.map((weekday) => (
                <span
                  key={weekday}
                  className="pb-1 text-center text-label font-semibold uppercase tracking-label text-muted"
                >
                  <span className="hidden sm:inline">{weekday}</span>
                  <span className="sm:hidden">{weekday[0]}</span>
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 p-2 pt-0 sm:p-3 sm:pt-0">
              {grid.map((date) => {
                const key = dayKey(date)
                const dayEntries = byDay.get(key) ?? []
                const outside = date.getMonth() !== cursor.getMonth()
                const isToday = key === todayKey
                const isSelected = key === selected

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelected(key)}
                    aria-label={`${date.getDate()} — ${dayEntries.length} entr${dayEntries.length === 1 ? 'y' : 'ies'}`}
                    aria-pressed={isSelected}
                    className={cn(
                      'flex min-h-[3.25rem] flex-col gap-1 rounded-field border p-1.5 text-left transition-colors sm:min-h-[6rem] sm:p-2',
                      isSelected
                        ? 'border-ink bg-paper'
                        : outside
                          ? 'border-transparent hover:border-line'
                          : 'border-transparent bg-paper/50 hover:border-line hover:bg-paper',
                      outside && 'opacity-40',
                      // A day that has gone by should not shout.
                      !outside && key < todayKey && 'opacity-70',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[12px]',
                        isToday ? 'bg-ink font-bold text-white' : 'text-muted',
                      )}
                    >
                      {date.getDate()}
                    </span>

                    {/* Chips on desktop, dots when the cell gets narrow. */}
                    <span className="hidden min-w-0 flex-col gap-1 sm:flex">
                      {dayEntries.slice(0, 2).map((entry) => (
                        <span
                          key={entry.id}
                          className={cn(
                            'truncate rounded-inner px-1.5 py-0.5 text-[11px] font-semibold',
                            KIND_STYLE[entry.kind].chip,
                          )}
                        >
                          {entry.kind === 'deadline' ? entry.detail : entry.label}
                        </span>
                      ))}
                      {dayEntries.length > 2 && (
                        <span className="px-1 text-[11px] text-muted">
                          +{dayEntries.length - 2}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-wrap gap-1 sm:hidden">
                      {dayEntries.slice(0, 3).map((entry) => (
                        <span
                          key={entry.id}
                          className={cn('h-1.5 w-1.5 rounded-full', KIND_STYLE[entry.kind].dot)}
                        />
                      ))}
                    </span>
                  </button>
                )
              })}
            </div>
          </Card>

          {/* ── The selected day, then what comes next ── */}
          <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[6.5rem]">
            <Card className="flex flex-col gap-3.5">
              <div>
                <span className="tech-label">
                  {selected === todayKey ? 'Today' : 'Selected day'}
                </span>
                <h2 className="mt-1 font-display text-[18px] font-bold text-ink">
                  {formatDate(`${selected}T12:00:00`)}
                </h2>
              </div>

              {selectedEntries.length === 0 ? (
                <p className="text-[13.5px] text-muted">Nothing scheduled on this day.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {selectedEntries.map((entry) => {
                    const style = KIND_STYLE[entry.kind]
                    const Icon = style.icon
                    return (
                      <li key={entry.id}>
                        <Link
                          to={entry.href}
                          className="flex items-center gap-3 rounded-field bg-paper p-2.5 transition-colors hover:bg-line/40"
                        >
                          <span
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                              style.chip,
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-bold text-ink">
                              {entry.label}
                            </span>
                            <span className="block truncate text-[12.5px] text-muted">
                              {entry.detail}
                            </span>
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}

              {/* A calendar you can write to: this really sets the casting's deadline. */}
              {undated.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-line pt-3.5">
                  <span className="tech-label">Close a casting on this day</span>
                  <SelectInput
                    aria-label="Casting to close on this day"
                    value={deadlineFor}
                    onChange={(event) => setDeadlineFor(event.target.value)}
                  >
                    <option value="">Pick a casting…</option>
                    {undated.map((casting) => (
                      <option key={casting.id} value={casting.id}>
                        {casting.project?.title ? `${casting.project.title} — ` : ''}
                        {casting.title}
                      </option>
                    ))}
                  </SelectInput>
                  <Button
                    size="sm"
                    disabled={!deadlineFor || mutations.updateCasting.isPending}
                    icon={<Plus className="h-3.5 w-3.5" />}
                    onClick={setDeadline}
                  >
                    {mutations.updateCasting.isPending ? 'Saving…' : 'Set the deadline'}
                  </Button>
                </div>
              )}
            </Card>

            <Card className="flex flex-col gap-3.5">
              <span className="tech-label">Next up</span>
              {upcoming.length === 0 ? (
                <p className="text-[13.5px] text-muted">
                  No deadline or shooting date ahead. Set one on a casting or a project.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {upcoming.slice(0, 5).map((entry) => (
                    <li key={entry.id}>
                      <Link
                        to={entry.href}
                        className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                      >
                        <span className="w-16 shrink-0 font-mono text-[11.5px] text-muted">
                          {new Date(entry.at).toLocaleDateString(undefined, {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-ink">
                            {entry.label}
                          </span>
                          <span className="block truncate text-[12px] text-muted">
                            {entry.detail}
                          </span>
                        </span>
                        <span
                          className={cn('h-2 w-2 shrink-0 rounded-full', KIND_STYLE[entry.kind].dot)}
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <div className="flex flex-wrap items-center gap-3 px-1 text-[12px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-signal-no" />
                Submissions close
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-link" />
                Shoot start / wrap
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-link/40" />
                Shooting
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode
  value: number
  label: string
}) {
  return (
    <Card className="flex flex-col gap-1.5 p-4">
      <span className="inline-flex items-center gap-1.5 text-muted">{icon}</span>
      <span className="font-display text-[24px] font-extrabold leading-none text-ink">{value}</span>
      <span className="text-[12.5px] text-muted">{label}</span>
    </Card>
  )
}

/** Everything ahead, then what already happened — grouped by month. */
function AgendaView({ entries, todayKey }: { entries: Entry[]; todayKey: string }) {
  const dated = entries.filter((entry) => entry.kind !== 'shoot')
  const upcoming = dated.filter((entry) => entry.day >= todayKey)
  const past = dated.filter((entry) => entry.day < todayKey).reverse()

  if (dated.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="h-5 w-5" />}
        title="Nothing scheduled yet"
        description="Set a submission deadline on a casting, or shooting dates on a project, and they appear here."
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4">
      <AgendaGroup title="Coming up" entries={upcoming} />
      {past.length > 0 && <AgendaGroup title="Past" entries={past} muted />}
    </div>
  )
}

function AgendaGroup({
  title,
  entries,
  muted,
}: {
  title: string
  entries: Entry[]
  muted?: boolean
}) {
  const months = new Map<string, Entry[]>()
  for (const entry of entries) {
    const label = new Date(entry.at).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    })
    const bucket = months.get(label)
    if (bucket) bucket.push(entry)
    else months.set(label, [entry])
  }

  return (
    <Card className={cn('flex flex-col gap-4', muted && 'opacity-70')}>
      <span className="tech-label">{title}</span>
      {entries.length === 0 ? (
        <p className="text-[14px] text-muted">Nothing here.</p>
      ) : (
        [...months.entries()].map(([label, monthEntries]) => (
          <div key={label} className="flex flex-col gap-2">
            <span className="text-[12.5px] font-bold capitalize text-ink">{label}</span>
            <ul className="flex flex-col divide-y divide-line">
              {monthEntries.map((entry) => {
                const style = KIND_STYLE[entry.kind]
                const Icon = style.icon
                return (
                  <li key={entry.id}>
                    <Link to={entry.href} className="flex items-center gap-3 py-3 first:pt-0">
                      <span className="w-24 shrink-0 font-mono text-[12px] text-muted">
                        {formatDate(entry.at)}
                      </span>
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                          style.chip,
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-ink">
                          {entry.label}
                        </span>
                        <span className="block truncate text-[13px] text-muted">
                          {entry.detail}
                        </span>
                      </span>
                      <Tag tone={entry.kind === 'deadline' ? 'no' : 'link'}>
                        {entry.kind === 'deadline' ? 'deadline' : 'shoot'}
                      </Tag>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))
      )}
    </Card>
  )
}
