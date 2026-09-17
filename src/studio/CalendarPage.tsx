import { Link } from 'react-router-dom'
import { CalendarDays, Clapperboard, Film } from 'lucide-react'
import { Card, FormError, Tag } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentOrganization } from '@/features/organizations/queries'
import { useOrgCastings, useOrgProjects } from '@/features/studio/queries'
import { formatDate } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'

/**
 * Calendar — the dates that already exist in the data: when submissions close,
 * and when each project shoots. No separate event table to keep in sync.
 */

type Entry = {
  id: string
  date: string
  label: string
  detail: string
  kind: 'deadline' | 'shoot'
  href: string
}

export function CalendarPage() {
  const { profile } = useAuth()
  const { organization } = useCurrentOrganization(profile?.id)
  const castings = useOrgCastings(organization?.id)
  const projects = useOrgProjects(organization?.id)

  const entries: Entry[] = []

  for (const casting of castings.data ?? []) {
    if (casting.deadline_at) {
      entries.push({
        id: `deadline-${casting.id}`,
        date: casting.deadline_at,
        label: 'Submissions close',
        detail: `${casting.project?.title ?? casting.title} — ${casting.title}`,
        kind: 'deadline',
        href: `/studio/casting/${casting.id}`,
      })
    }
  }

  for (const project of projects.data ?? []) {
    if (project.shooting_start) {
      entries.push({
        id: `shoot-start-${project.id}`,
        date: project.shooting_start,
        label: 'Shoot starts',
        detail: project.title,
        kind: 'shoot',
        href: '/studio/projects',
      })
    }
    if (project.shooting_end) {
      entries.push({
        id: `shoot-end-${project.id}`,
        date: project.shooting_end,
        label: 'Shoot wraps',
        detail: project.title,
        kind: 'shoot',
        href: '/studio/projects',
      })
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date))
  const now = Date.now()
  const upcoming = entries.filter((entry) => new Date(entry.date).getTime() >= now)
  const past = entries.filter((entry) => new Date(entry.date).getTime() < now).reverse()

  const loading = castings.isLoading || projects.isLoading

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-5">
      <header>
        <h1 className="font-display text-[1.7rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[2.1rem]">
          Calendar
        </h1>
        <p className="mt-1 text-[15px] text-muted">
          Deadlines and shooting dates from your castings and projects.
        </p>
      </header>

      {(castings.error || projects.error) && (
        <FormError>
          {errorMessage(castings.error ?? projects.error, 'Could not load your dates')}
        </FormError>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-5 w-5" />}
          title="Nothing scheduled yet"
          description="Set a submission deadline on a casting, or shooting dates on a project, and they appear here."
        />
      ) : (
        <>
          <Section title="Coming up" entries={upcoming} />
          {past.length > 0 && <Section title="Past" entries={past} muted />}
        </>
      )}
    </div>
  )
}

function Section({
  title,
  entries,
  muted,
}: {
  title: string
  entries: Entry[]
  muted?: boolean
}) {
  if (entries.length === 0) {
    return (
      <Card className="flex flex-col gap-2">
        <span className="tech-label">{title}</span>
        <p className="text-[14px] text-muted">Nothing here.</p>
      </Card>
    )
  }

  return (
    <Card className={muted ? 'flex flex-col gap-3 opacity-70' : 'flex flex-col gap-3'}>
      <span className="tech-label">{title}</span>
      <ul className="flex flex-col divide-y divide-line">
        {entries.map((entry) => (
          <li key={entry.id}>
            <Link to={entry.href} className="flex items-center gap-4 py-3 first:pt-0">
              <span className="w-24 shrink-0 font-mono text-[12px] text-muted">
                {formatDate(entry.date)}
              </span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper text-muted">
                {entry.kind === 'deadline' ? (
                  <Clapperboard className="h-4 w-4" />
                ) : (
                  <Film className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-ink">
                  {entry.label}
                </span>
                <span className="block truncate text-[13px] text-muted">{entry.detail}</span>
              </span>
              <Tag tone={entry.kind === 'deadline' ? 'no' : 'neutral'}>{entry.kind}</Tag>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
