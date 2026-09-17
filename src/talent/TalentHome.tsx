import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Bell,
  Clapperboard,
  Film,
  MapPin,
  MessageCircle,
  Pencil,
  Sparkles,
} from 'lucide-react'
import { Avatar, Button, Card, FormError, Tag } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { useAuth } from '@/features/auth/AuthProvider'
import { profileCompletion } from '@/features/talent/completion'
import { useTalentProfile } from '@/features/talent/queries'
import { useMyApplications, useTalentApplicationStats } from '@/features/applications/queries'
import { useOpenCastings } from '@/features/castings/queries'
import { useConversations, participantName } from '@/features/messaging/queries'
import { useNotifications } from '@/features/notifications/queries'
import {
  APPLICATION_STATUS_LABEL,
  APPLICATION_STATUS_TONE,
  deadlineLabel,
  greeting,
  isClosingSoon,
  relativeTime,
} from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'

/**
 * Talent home — everything on this screen comes from the database for the
 * signed-in account: your own profile, your own applications, the casting calls
 * that are actually published, your conversations and notifications.
 */
export function TalentHome() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const profileId = profile?.id

  const talent = useTalentProfile(profileId)
  const stats = useTalentApplicationStats(profileId)
  const applications = useMyApplications(profileId)
  const castings = useOpenCastings()
  const conversations = useConversations(profileId)
  const notifications = useNotifications(profileId)

  if (talent.isLoading || (!talent.data && !talent.error)) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Skeleton className="h-72" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-56" />
          <Skeleton className="h-40" />
        </div>
      </div>
    )
  }

  if (!talent.data) {
    return <FormError>{errorMessage(talent.error, 'Could not load your profile')}</FormError>
  }

  const data = talent.data
  const completion = profileCompletion(data)
  const name = data.talent.professional_name ||
    [data.profile.first_name, data.profile.last_name].filter(Boolean).join(' ') ||
    'there'
  const firstName = data.profile.first_name || name

  const activeApplications = (applications.data ?? []).filter(
    (application) => !['withdrawn', 'not_selected'].includes(application.status),
  )
  const appliedRoleIds = new Set((applications.data ?? []).map((application) => application.role_id))
  const openCastings = (castings.data ?? []).filter((casting) =>
    casting.roles.some((role) => !appliedRoleIds.has(role.id)),
  )
  const unreadNotifications = (notifications.data ?? []).filter((item) => !item.read_at)

  return (
    <div className="flex flex-col gap-6">
      {/* ── Greeting ── */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.75rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[2.1rem]">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-[15px] text-muted">
            {activeApplications.length > 0
              ? `${activeApplications.length} audition${activeApplications.length > 1 ? 's' : ''} in progress · ${openCastings.length} casting call${openCastings.length === 1 ? '' : 's'} open to you`
              : `${openCastings.length} casting call${openCastings.length === 1 ? '' : 's'} open to you right now`}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* ── Left: identity + strength ── */}
        <aside className="flex min-w-0 flex-col gap-4">
          <Card flush className="overflow-hidden">
            <div className="h-20 bg-[#EDEBE5]">
              {data.talent.cover_url && (
                <img src={data.talent.cover_url} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="px-5 pb-5">
              <div className="-mt-9 mb-3">
                <Avatar
                  src={data.profile.avatar_url ?? undefined}
                  name={name}
                  size="lg"
                  className="border-4 border-card"
                />
              </div>
              <p className="font-display text-[17px] font-bold text-ink">{name}</p>
              <p className="mt-0.5 text-[13px] text-muted">
                {data.talent.headline || 'Add a headline to your profile'}
              </p>
              {(data.profile.city || data.talent.agency_name) && (
                <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted">
                  <MapPin className="h-3.5 w-3.5" />
                  {[data.profile.city, data.talent.agency_name].filter(Boolean).join(' · ')}
                </p>
              )}

              <div className="mt-4 rounded-field bg-paper p-3">
                <div className="flex items-center justify-between text-[12px] font-semibold text-ink">
                  <span className="uppercase tracking-[0.18em] text-muted">Profile</span>
                  <span className="font-mono">{completion.percent}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-ink transition-[width] duration-500"
                    style={{ width: `${completion.percent}%` }}
                  />
                </div>
                {completion.missing.length > 0 && (
                  <p className="mt-2 text-[12px] text-muted">
                    Next: {completion.missing[0].label.toLowerCase()}
                  </p>
                )}
              </div>

              <Button
                variant="secondary"
                size="sm"
                className="mt-4 w-full"
                icon={<Pencil className="h-3.5 w-3.5" />}
                onClick={() => navigate('/talent/profile')}
              >
                Edit profile
              </Button>
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <span className="tech-label">Your numbers</span>
            <StatRow label="Auditions sent" value={stats.data?.submitted ?? 0} />
            <StatRow label="Shortlisted" value={stats.data?.shortlisted ?? 0} />
            <StatRow label="Booked" value={stats.data?.booked ?? 0} />
            <p className="text-[12px] text-muted">
              Counted from your applications — nothing here is estimated.
            </p>
          </Card>
        </aside>

        {/* ── Right: what to do now ── */}
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="flex flex-col gap-4">
            <SectionHead
              icon={<Clapperboard className="h-4 w-4" />}
              title="Casting calls open to you"
              to="/talent/casting-calls"
              count={openCastings.length}
            />

            {castings.isLoading ? (
              <Skeleton className="h-24" />
            ) : openCastings.length === 0 ? (
              <EmptyState
                compact
                icon={<Clapperboard className="h-5 w-5" />}
                title="No open casting calls right now"
                description="As soon as a production publishes a casting, it lands here."
              />
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {openCastings.slice(0, 4).map((casting) => (
                  <li key={casting.id}>
                    <Link
                      to={`/talent/casting/${casting.id}`}
                      className="group flex items-center gap-4 py-3 first:pt-0"
                    >
                      <span className="h-14 w-11 shrink-0 overflow-hidden rounded-btn bg-line">
                        {casting.project?.poster_url && (
                          <img
                            src={casting.project.poster_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold text-ink">
                          {casting.project?.title ?? casting.title}
                        </span>
                        <span className="block truncate text-[13px] text-muted">
                          {[
                            casting.project?.production_type,
                            casting.location,
                            `${casting.roles.length} role${casting.roles.length === 1 ? '' : 's'}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <span className="hidden shrink-0 sm:block">
                        <Tag tone={isClosingSoon(casting.deadline_at) ? 'no' : 'neutral'}>
                          {deadlineLabel(casting.deadline_at)}
                        </Tag>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="flex flex-col gap-4">
            <SectionHead
              icon={<Film className="h-4 w-4" />}
              title="Your auditions"
              to="/talent/auditions"
              count={activeApplications.length}
            />

            {applications.isLoading ? (
              <Skeleton className="h-20" />
            ) : activeApplications.length === 0 ? (
              <EmptyState
                compact
                icon={<Film className="h-5 w-5" />}
                title="No auditions yet"
                description="Apply to a role and it will appear here with its status."
                action={
                  <Button size="sm" onClick={() => navigate('/talent/casting-calls')}>
                    Browse casting calls
                  </Button>
                }
              />
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {activeApplications.slice(0, 4).map((application) => (
                  <li
                    key={application.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-bold text-ink">
                        {application.role?.name ?? 'Role'}
                        <span className="font-normal text-muted">
                          {' '}
                          — {application.project?.title ?? 'Project'}
                        </span>
                      </span>
                      <span className="block text-[13px] text-muted">
                        Applied {relativeTime(application.submitted_at ?? application.created_at)}
                        {application.hasSelfTape ? ' · self-tape sent' : ''}
                      </span>
                    </span>
                    <Tag tone={APPLICATION_STATUS_TONE[application.status]}>
                      {APPLICATION_STATUS_LABEL[application.status]}
                    </Tag>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2">
            <Card className="flex flex-col gap-4">
              <SectionHead
                icon={<MessageCircle className="h-4 w-4" />}
                title="Messages"
                to="/talent/messages"
              />
              {(conversations.data ?? []).length === 0 ? (
                <EmptyState
                  compact
                  icon={<MessageCircle className="h-5 w-5" />}
                  title="No messages"
                  description="Productions can message you once you apply."
                />
              ) : (
                <ul className="flex flex-col gap-3">
                  {(conversations.data ?? []).slice(0, 3).map((conversation) => (
                    <li key={conversation.id} className="min-w-0">
                      <Link to="/talent/messages" className="flex min-w-0 items-center gap-3">
                        <Avatar
                          src={conversation.participants[0]?.avatar_url ?? undefined}
                          name={participantName(conversation.participants[0])}
                          size="sm"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold text-ink">
                            {participantName(conversation.participants[0])}
                          </span>
                          <span className="block truncate text-[13px] text-muted">
                            {conversation.lastMessage?.body ?? 'No message yet'}
                          </span>
                        </span>
                        {conversation.unread > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-signal-no px-1.5 font-mono text-[10px] font-bold text-white">
                            {conversation.unread}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="flex flex-col gap-4">
              <SectionHead
                icon={<Bell className="h-4 w-4" />}
                title="Notifications"
                to="/talent/notifications"
                count={unreadNotifications.length}
              />
              {(notifications.data ?? []).length === 0 ? (
                <EmptyState
                  compact
                  icon={<Sparkles className="h-5 w-5" />}
                  title="Nothing yet"
                  description="Status changes and messages show up here."
                />
              ) : (
                <ul className="flex flex-col gap-3">
                  {(notifications.data ?? []).slice(0, 3).map((item) => (
                    <li key={item.id} className="flex min-w-0 items-start gap-2.5">
                      <span
                        className={cn(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          item.read_at ? 'bg-line' : 'bg-link',
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-ink">
                          {item.title}
                        </span>
                        <span className="block truncate text-[13px] text-muted">{item.body}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <p className="text-[12px] text-muted">
            Signed in as {user?.email}. Everything on this page is read from your account.
          </p>
        </div>
      </div>
    </div>
  )
}

function SectionHead({
  icon,
  title,
  to,
  count,
}: {
  icon: React.ReactNode
  title: string
  to: string
  count?: number
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="tech-label inline-flex items-center gap-1.5">
        {icon}
        {title}
        {count !== undefined && count > 0 && (
          <span className="ml-1 rounded-full bg-paper px-2 py-0.5 font-mono text-[10px] text-muted">
            {count}
          </span>
        )}
      </span>
      <Link to={to} className="text-[13px] font-semibold text-link hover:underline">
        See all
      </Link>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[14px] text-muted">{label}</span>
      <span className="font-display text-[20px] font-extrabold text-ink">{value}</span>
    </div>
  )
}
