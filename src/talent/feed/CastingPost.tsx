import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bookmark,
  ChevronDown,
  Clock,
  Globe,
  Link2,
  MapPin,
  Users,
  Wallet,
  Zap,
} from 'lucide-react'
import { Card, Tag } from '@/components/ui'
import { useToast } from '@/components/Toast'
import type { CastingCallWithContext } from '@/features/castings/queries'
import type { MyApplication } from '@/features/applications/queries'
import {
  APPLICATION_STATUS_LABEL,
  APPLICATION_STATUS_TONE,
  deadlineLabel,
  isClosingSoon,
  relativeTime,
} from '@/lib/format'
import { asset } from '@/lib/asset'
import { cn } from '@/lib/cn'
import type { RoleRow } from '@/types/database'

/**
 * One casting call as a feed post — the production is the author, the roles are
 * what you can act on. Everything shown is read from the casting call itself;
 * the only counters are your own applications.
 */
export function CastingPost({
  casting,
  applicationsByRole,
  saved,
  onToggleSave,
  onApply,
  canApply,
}: {
  casting: CastingCallWithContext
  applicationsByRole: Map<string, MyApplication>
  saved: boolean
  onToggleSave: () => void
  onApply: (role: RoleRow) => void
  canApply: boolean
}) {
  const toast = useToast()
  const [expanded, setExpanded] = useState(false)
  const [allRoles, setAllRoles] = useState(false)

  const project = casting.project
  const author = project?.organization
  const authorName = author?.name || project?.company_name || 'Production'
  const authorPlace = [author?.city, author?.country].filter(Boolean).join(', ')
  const detailHref = `/talent/casting/${casting.id}`

  const description = casting.description?.trim() || project?.synopsis?.trim() || ''
  const isLong = description.length > 220

  const myApplications = casting.roles
    .map((role) => applicationsByRole.get(role.id))
    .filter((application): application is MyApplication => Boolean(application))
  const visibleRoles = allRoles ? casting.roles : casting.roles.slice(0, 2)

  async function share() {
    const url = `${window.location.origin}/casting/${casting.id}`
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copied — anyone can open this casting call')
    } catch {
      toast('Could not copy the link')
    }
  }

  return (
    <Card flush className="overflow-hidden">
      {/* ── Author ── */}
      <div className="flex items-start gap-3 px-4 pt-4 sm:px-5">
        <Link to={detailHref} className="shrink-0">
          <AuthorMark name={authorName} logo={author?.logo_url ?? null} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            to={detailHref}
            className="-my-2 block truncate py-2 font-display text-[15px] font-bold leading-tight text-ink hover:underline"
          >
            {authorName}
          </Link>
          <p className="mt-0.5 truncate text-[13px] text-muted">
            {[author?.company_type, project?.production_type, authorPlace]
              .filter(Boolean)
              .join(' · ') || 'Casting call'}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted">
            {relativeTime(casting.published_at ?? casting.created_at)}
            <span aria-hidden>·</span>
            <Globe className="h-3 w-3" aria-hidden />
            <span className="sr-only">Public casting call</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleSave}
          aria-label={saved ? 'Remove from saved' : 'Save this casting call'}
          aria-pressed={saved}
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
            saved ? 'bg-ink text-white' : 'text-muted hover:bg-ink/5 hover:text-ink',
          )}
        >
          <Bookmark className={cn('h-[18px] w-[18px]', saved && 'fill-current')} />
        </button>
      </div>

      {/* ── Post body ── */}
      <div className="px-4 pb-3.5 pt-3 sm:px-5">
        <Link to={detailHref} className="block">
          <h3 className="font-display text-[17px] font-bold leading-snug tracking-[-0.01em] text-ink">
            {project?.title ?? casting.title}
          </h3>
          {project?.title && casting.title !== project.title && (
            <p className="mt-0.5 text-[14px] font-medium text-muted">{casting.title}</p>
          )}
        </Link>

        {description && (
          <p
            className={cn(
              'mt-2 whitespace-pre-line text-[14px] leading-relaxed text-ink/90',
              !expanded && isLong && 'line-clamp-3',
            )}
          >
            {description}
          </p>
        )}
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mt-1 inline-flex min-h-[32px] items-center text-[13px] font-semibold text-muted hover:text-ink"
          >
            {expanded ? 'See less' : '…see more'}
          </button>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {casting.location && (
            <Tag icon={<MapPin className="h-3 w-3" />}>{casting.location}</Tag>
          )}
          <Tag icon={<Users className="h-3 w-3" />}>
            {casting.roles.length} role{casting.roles.length === 1 ? '' : 's'}
          </Tag>
          {casting.compensation && (
            <Tag icon={<Wallet className="h-3 w-3" />}>{casting.compensation}</Tag>
          )}
          <Tag
            tone={isClosingSoon(casting.deadline_at) ? 'no' : 'neutral'}
            icon={<Clock className="h-3 w-3" />}
          >
            {deadlineLabel(casting.deadline_at)}
          </Tag>
        </div>
      </div>

      {/* ── Media: a fixed crop keeps the feed's rhythm whatever the poster's ratio ── */}
      {project?.poster_url && (
        <Link
          to={detailHref}
          className="block h-56 overflow-hidden border-y border-line bg-paper sm:h-72"
        >
          <img
            src={asset(project.poster_url)}
            alt={project.title ?? casting.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </Link>
      )}

      {/* ── Roles: the actionable part of the post ── */}
      {casting.roles.length > 0 && (
        <ul className="flex flex-col divide-y divide-line border-b border-line">
          {visibleRoles.map((role) => {
            const application = applicationsByRole.get(role.id)
            const age = [role.playing_age_min, role.playing_age_max].filter(
              (value) => value !== null,
            )
            const meta = [
              role.role_type === 'lead' ? 'Lead' : role.role_type === 'contestant' ? 'Contestant' : 'Supporting',
              role.gender_pref,
              age.length === 2 ? `${age[0]}–${age[1]} yrs` : age.length === 1 ? `${age[0]} yrs` : null,
              role.location,
            ].filter(Boolean)

            return (
              <li
                key={role.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to={detailHref}
                    className="-my-2 block truncate py-2 text-[14px] font-bold text-ink hover:underline"
                  >
                    {role.name}
                  </Link>
                  <p className="truncate text-[12.5px] text-muted">{meta.join(' · ')}</p>
                </div>

                {application ? (
                  <Tag tone={APPLICATION_STATUS_TONE[application.status]}>
                    {APPLICATION_STATUS_LABEL[application.status]}
                  </Tag>
                ) : canApply ? (
                  <button
                    type="button"
                    onClick={() => onApply(role)}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-field bg-cream px-3.5 text-[13px] font-bold text-ink transition-colors hover:bg-cream/80"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Apply
                  </button>
                ) : (
                  <Link
                    to={detailHref}
                    className="inline-flex h-9 shrink-0 items-center rounded-field border border-line px-3.5 text-[13px] font-semibold text-ink hover:border-ink/30"
                  >
                    View
                  </Link>
                )}
              </li>
            )
          })}

          {casting.roles.length > 2 && (
            <li>
              <button
                type="button"
                onClick={() => setAllRoles((value) => !value)}
                className="flex min-h-[40px] w-full items-center justify-center gap-1.5 px-4 text-[13px] font-semibold text-muted hover:bg-paper hover:text-ink"
              >
                {allRoles ? 'Show fewer roles' : `Show all ${casting.roles.length} roles`}
                <ChevronDown className={cn('h-4 w-4 transition-transform', allRoles && 'rotate-180')} />
              </button>
            </li>
          )}
        </ul>
      )}

      {/* ── Your own activity on this post, then the actions ── */}
      {myApplications.length > 0 && (
        <p className="px-4 pt-2.5 text-[12.5px] text-muted sm:px-5">
          You applied to {myApplications.length} of {casting.roles.length} role
          {casting.roles.length === 1 ? '' : 's'}
          {myApplications.some((application) => application.hasSelfTape) ? ' · self-tape sent' : ''}
        </p>
      )}

      <div className="flex items-center gap-1 px-2 py-2 sm:px-3">
        <PostAction
          icon={<Users className="h-[18px] w-[18px]" />}
          label="View roles"
          to={detailHref}
        />
        <PostAction
          icon={<Bookmark className={cn('h-[18px] w-[18px]', saved && 'fill-current')} />}
          label={saved ? 'Saved' : 'Save'}
          onClick={onToggleSave}
          active={saved}
        />
        <PostAction icon={<Link2 className="h-[18px] w-[18px]" />} label="Share" onClick={share} />
      </div>
    </Card>
  )
}

/** Company mark: rounded square (people are round, productions are square). */
function AuthorMark({ name, logo }: { name: string; logo: string | null }) {
  const words = name.split(' ').filter(Boolean)
  // "A24" reads better as "A2" than as "A".
  const initials = (
    words.length > 1 ? words.slice(0, 2).map((part) => part[0]).join('') : name.slice(0, 2)
  ).toUpperCase()

  return (
    <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-[15px] border border-line bg-paper font-display text-[15px] font-extrabold text-muted">
      {logo ? (
        <img src={asset(logo)} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </span>
  )
}

function PostAction({
  icon,
  label,
  to,
  onClick,
  active,
}: {
  icon: React.ReactNode
  label: string
  to?: string
  onClick?: () => void
  active?: boolean
}) {
  const className = cn(
    'flex h-10 flex-1 items-center justify-center gap-1.5 rounded-btn text-[13px] font-semibold transition-colors',
    active ? 'text-ink' : 'text-muted hover:text-ink',
    'hover:bg-paper',
  )
  return to ? (
    <Link to={to} className={className}>
      {icon}
      {label}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {icon}
      {label}
    </button>
  )
}
