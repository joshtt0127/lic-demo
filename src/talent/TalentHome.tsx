import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bell,
  Bookmark,
  Clapperboard,
  Film,
  MapPin,
  MessageCircle,
  Pencil,
  Search,
  Users,
} from 'lucide-react'
import { Avatar, Button, Card, FormError, Tag } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { InstallCard } from '@/components/InstallCard'
import { EmptyState } from '@/components/EmptyState'
import { SegmentedControl } from '@/components/form/SegmentedControl'
import { useAuth } from '@/features/auth/AuthProvider'
import { profileCompletion } from '@/features/talent/completion'
import { useTalentProfile } from '@/features/talent/queries'
import {
  useMyApplications,
  useTalentApplicationStats,
  type MyApplication,
} from '@/features/applications/queries'
import { ApplyModal } from '@/features/applications/ApplyModal'
import {
  useOpenCastings,
  useSaveCasting,
  useSavedCastings,
  type CastingCallWithContext,
} from '@/features/castings/queries'
import { useConversations, participantName } from '@/features/messaging/queries'
import {
  useFollowedOrganizations,
  useFollowedProfiles,
  useFollowMutations,
  useNetworkCounts,
  useOrganizationFollowers,
} from '@/features/social/queries'
import {
  useNetworkPosts,
  usePostMutations,
  useSuggestedProfiles,
} from '@/features/social/posts'
import type { Post } from '@/data/repositories/posts'
import { useNotifications } from '@/features/notifications/queries'
import { APPLICATION_STATUS_TONE } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import type { RoleRow } from '@/types/database'
import { CastingPost } from './feed/CastingPost'
import { ActivityPost } from './feed/ActivityPost'
import { PersonPost } from './feed/PersonPost'
import { PostComposer } from './feed/PostComposer'

/** Statuses a production decided on — worth a line in the feed. */
const DECIDED = new Set(['under_review', 'shortlisted', 'callback', 'offer', 'cast', 'not_selected'])

type FeedItem =
  | { key: string; at: string; kind: 'casting'; casting: CastingCallWithContext }
  | { key: string; at: string; kind: 'post'; post: Post }
  | { key: string; at: string; kind: 'activity'; application: MyApplication; event: 'applied' | 'decision' }

type Scope = 'recent' | 'people' | 'following' | 'closing' | 'saved' | 'applied'

/**
 * Talent home — a feed. Each published casting call is a post authored by the
 * production that opened it, each of your own applications adds its own line.
 * Everything comes from the database for the signed-in account: no sample post,
 * no estimated number.
 */
export function TalentHome() {
  const t = useT()
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const profileId = profile?.id

  const talent = useTalentProfile(profileId)
  const stats = useTalentApplicationStats(profileId)
  const applications = useMyApplications(profileId)
  const castings = useOpenCastings()
  const savedCastings = useSavedCastings(profileId)
  const saveCasting = useSaveCasting(profileId)
  const conversations = useConversations(profileId)
  const notifications = useNotifications(profileId)

  // ── The social graph: the productions this account follows ──
  const followedOrgs = useFollowedOrganizations(profileId)
  const network = useNetworkCounts(profileId)
  const orgIds = useMemo(
    () =>
      [
        ...new Set(
          (castings.data ?? [])
            .map((casting) => casting.project?.organization?.id)
            .filter((id): id is string => Boolean(id)),
        ),
      ],
    [castings.data],
  )
  const followers = useOrganizationFollowers(orgIds)
  const followedIds = useMemo(() => new Set(followedOrgs.data ?? []), [followedOrgs.data])

  // ── Les gens : ceux que l'on suit, et soi-même ──
  const followedPeople = useFollowedProfiles(profileId)
  const networkAuthors = useMemo(
    () => [...(followedPeople.data ?? []), ...(profileId ? [profileId] : [])],
    [followedPeople.data, profileId],
  )
  const posts = useNetworkPosts(profileId, networkAuthors)
  const suggestions = useSuggestedProfiles(profileId)
  const postMutations = usePostMutations(profileId)
  const follow = useFollowMutations(profileId)

  const [scope, setScope] = useState<Scope>('recent')
  const [applyTo, setApplyTo] = useState<{ role: RoleRow; castingTitle: string } | null>(null)

  const savedIds = useMemo(() => new Set(savedCastings.data ?? []), [savedCastings.data])

  const applicationsByRole = useMemo(() => {
    const map = new Map<string, MyApplication>()
    for (const application of applications.data ?? []) map.set(application.role_id, application)
    return map
  }, [applications.data])

  const feed = useMemo<FeedItem[]>(() => {
    const allCastings = castings.data ?? []
    const mine = applications.data ?? []

    const postItems: FeedItem[] = (posts.data ?? []).map((post) => ({
      key: `post-${post.id}`,
      at: post.createdAt,
      kind: 'post' as const,
      post,
    }))

    if (scope === 'people') return sortFeed(postItems, scope)

    const castingItems: FeedItem[] = allCastings
      .filter((casting) => {
        if (scope === 'following') {
          const orgId = casting.project?.organization?.id
          return Boolean(orgId && followedIds.has(orgId))
        }
        if (scope === 'saved') return savedIds.has(casting.id)
        if (scope === 'applied') return casting.roles.some((role) => applicationsByRole.has(role.id))
        if (scope === 'closing') return Boolean(casting.deadline_at)
        return true
      })
      .map((casting) => ({
        key: `casting-${casting.id}`,
        at: casting.published_at ?? casting.created_at,
        kind: 'casting' as const,
        casting,
      }))

    if (scope === 'saved' || scope === 'closing' || scope === 'following') {
      return sortFeed(castingItems, scope)
    }

    const activityItems: FeedItem[] = mine.flatMap((application) => {
      const items: FeedItem[] = []
      if (application.submitted_at) {
        items.push({
          key: `applied-${application.id}`,
          at: application.submitted_at,
          kind: 'activity',
          application,
          event: 'applied',
        })
      }
      if (DECIDED.has(application.status)) {
        items.push({
          key: `decision-${application.id}`,
          at: application.decided_at ?? application.updated_at,
          kind: 'activity',
          application,
          event: 'decision',
        })
      }
      return items
    })

    return sortFeed([...castingItems, ...postItems, ...activityItems], scope)
  }, [applications.data, applicationsByRole, castings.data, followedIds, posts.data, savedIds, scope])

  if (talent.isLoading || (!talent.data && !talent.error)) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_19rem]">
        <Skeleton className="hidden h-72 lg:block" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-14" />
          <Skeleton className="h-80" />
          <Skeleton className="h-72" />
        </div>
        <Skeleton className="hidden h-64 xl:block" />
      </div>
    )
  }

  if (!talent.data) {
    return <FormError>{errorMessage(talent.error, t('castings.loadFailed'))}</FormError>
  }

  const data = talent.data
  const completion = profileCompletion(data)
  const name =
    data.talent.professional_name ||
    [data.profile.first_name, data.profile.last_name].filter(Boolean).join(' ') ||
    'there'

  const activeApplications = (applications.data ?? []).filter(
    (application) => !['withdrawn', 'not_selected'].includes(application.status),
  )
  const unreadNotifications = (notifications.data ?? []).filter((item) => !item.read_at)
  const isTalent = profile?.account_type === 'talent'

  return (
    <>
      {/* The feed has no visible page title — screen readers still need one. */}
      <h1 className="sr-only">{t('feed.srTitle', { name })}</h1>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_19rem]">
        {/* ── Left rail: who you are ── */}
        <aside className="hidden min-w-0 flex-col gap-4 lg:sticky lg:top-[5.5rem] lg:flex">
          <Card flush className="overflow-hidden">
            <div className="h-20 bg-[#EDEBE5]">
              {data.talent.cover_url && (
                <img src={data.talent.cover_url} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="px-5 pb-5">
              <div className="-mt-9 mb-3">
                <Link to="/talent/profile">
                  <Avatar
                    src={data.profile.avatar_url ?? undefined}
                    name={name}
                    size="lg"
                    className="border-4 border-card"
                  />
                </Link>
              </div>
              <Link
                to="/talent/profile"
                className="-my-2 inline-block py-2 font-display text-[17px] font-bold text-ink hover:underline"
              >
                {name}
              </Link>
              <p className="mt-0.5 text-[13px] text-muted">
                {data.talent.headline || t('feed.headline')}
              </p>
              {(data.profile.city || data.talent.agency_name) && (
                <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted">
                  <MapPin className="h-3.5 w-3.5" />
                  {[data.profile.city, data.talent.agency_name].filter(Boolean).join(' · ')}
                </p>
              )}

              <ProfileStrength
                label={t('feed.profile')}
                percent={completion.percent}
                next={
                  completion.missing[0]
                    ? t('feed.next', { item: t(completion.missing[0].label).toLowerCase() })
                    : undefined
                }
              />

              <div className="mt-4 flex flex-col gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  icon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={() => navigate('/talent/profile')}
                >
                  {t('feed.editProfile')}
                </Button>
                <Link
                  to="/talent/casting-calls?scope=saved"
                  className="inline-flex min-h-[36px] items-center justify-between rounded-btn px-1 text-[13px] font-semibold text-muted hover:text-ink"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Bookmark className="h-3.5 w-3.5" />
                    {t('feed.savedCastings')}
                  </span>
                  <span className="font-mono text-[12px]">{savedIds.size}</span>
                </Link>
              </div>
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <span className="tech-label">{t('social.network')}</span>
            <StatRow label={t('social.followersLabel')} value={network.data?.followers ?? 0} />
            <StatRow label={t('social.followingLabel')} value={network.data?.following ?? 0} />
            <StatRow
              label={t('social.productionsFollowed')}
              value={network.data?.organizationsFollowed ?? 0}
            />
            <p className="text-[12px] text-muted">{t('social.networkHint')}</p>
          </Card>

          <Card className="flex flex-col gap-3">
            <span className="tech-label">{t('feed.yourNumbers')}</span>
            <StatRow label={t('feed.auditionsSent')} value={stats.data?.submitted ?? 0} />
            <StatRow label={t('feed.shortlisted')} value={stats.data?.shortlisted ?? 0} />
            <StatRow label={t('feed.booked')} value={stats.data?.booked ?? 0} />
            <p className="text-[12px] text-muted">
              {t('feed.counted')}
            </p>
          </Card>
        </aside>

        {/* ── Centre: the feed ── */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Phone/tablet identity strip — the left rail lives at ≥lg. */}
          <Card className="flex items-center gap-3 lg:hidden">
            <Link to="/talent/profile" className="shrink-0">
              <Avatar src={data.profile.avatar_url ?? undefined} name={name} size="md" />
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                to="/talent/profile"
                className="-my-2 block truncate py-2 font-display text-[15px] font-bold text-ink"
              >
                {name}
              </Link>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                  <span
                    className="block h-full rounded-full bg-ink"
                    style={{ width: `${completion.percent}%` }}
                  />
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted">
                  {completion.percent}%
                </span>
              </div>
            </div>
            <Link
              to="/talent/profile"
              className="inline-flex h-9 shrink-0 items-center rounded-btn px-2 text-[13px] font-semibold text-link hover:bg-link/5"
            >
              {t('common.edit')}
            </Link>
          </Card>

          {/* Proposée seulement si le téléphone sait vraiment installer l'app. */}
          <InstallCard />

          {isTalent && <PostComposer name={name} />}

          {/* The feed's own controls: real filters over real castings. */}
          <div className="flex items-center gap-2">
            {/* Une ligne qui défile au doigt sur téléphone, qui se replie dès
                qu'il y a la place. */}
            <div className="no-scrollbar min-w-0 flex-1 overflow-x-auto sm:overflow-visible">
              <SegmentedControl
                wrap={false}
                className="sm:flex-wrap"
                options={[
                  { value: 'recent', label: t('feed.filter.recent') },
                  { value: 'people', label: t('feed.filter.people') },
                  { value: 'following', label: t('feed.filter.following') },
                  { value: 'closing', label: t('feed.filter.closing') },
                  { value: 'saved', label: t('feed.filter.saved') },
                  { value: 'applied', label: t('feed.filter.applied') },
                ]}
                value={scope}
                onChange={(value) => value && setScope(value as Scope)}
              />
            </div>
            <Link
              to="/talent/casting-calls"
              className="hidden h-9 shrink-0 items-center gap-1.5 rounded-btn px-2 text-[13px] font-semibold text-link hover:bg-link/5 sm:inline-flex"
            >
              <Search className="h-3.5 w-3.5" />
              {t('feed.searchAll')}
            </Link>
          </div>

          {castings.error && (
            <FormError>{errorMessage(castings.error, t('castings.loadFailed'))}</FormError>
          )}

          {castings.isLoading ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-80" />
              <Skeleton className="h-72" />
            </div>
          ) : feed.length === 0 ? (
            <EmptyState
              icon={<Clapperboard className="h-5 w-5" />}
              title={
                scope === 'people'
                  ? t('feed.empty.people')
                  : scope === 'following'
                    ? t('feed.empty.following')
                    : scope === 'saved'
                      ? t('feed.empty.saved')
                      : scope === 'applied'
                        ? t('feed.empty.applied')
                        : scope === 'closing'
                          ? t('feed.empty.closing')
                          : t('feed.empty.recent')
              }
              description={
                scope === 'recent'
                  ? t('feed.empty.recentHint')
                  : scope === 'people'
                    ? t('feed.empty.peopleHint')
                    : scope === 'following'
                      ? t('feed.empty.followingHint')
                      : scope === 'saved'
                        ? t('feed.empty.savedHint')
                        : undefined
              }
              action={
                scope !== 'recent' ? (
                  <Button size="sm" variant="secondary" onClick={() => setScope('recent')}>
                    {t('feed.backToFeed')}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="flex flex-col gap-4">
              {feed.map((item) => (
                <li key={item.key}>
                  {item.kind === 'casting' ? (
                    <CastingPost
                      casting={item.casting}
                      applicationsByRole={applicationsByRole}
                      saved={savedIds.has(item.casting.id)}
                      onToggleSave={() =>
                        saveCasting.mutate({
                          castingId: item.casting.id,
                          saved: savedIds.has(item.casting.id),
                        })
                      }
                      onApply={(role) =>
                        setApplyTo({
                          role,
                          castingTitle: item.casting.project?.title ?? item.casting.title,
                        })
                      }
                      canApply={isTalent}
                      following={
                        item.casting.project?.organization
                          ? followedIds.has(item.casting.project.organization.id)
                          : false
                      }
                      followers={
                        item.casting.project?.organization
                          ? (followers.data?.get(item.casting.project.organization.id) ?? 0)
                          : 0
                      }
                      onToggleFollow={
                        item.casting.project?.organization
                          ? () =>
                              follow.organization.mutate({
                                orgId: item.casting.project!.organization!.id,
                                following: followedIds.has(item.casting.project!.organization!.id),
                              })
                          : undefined
                      }
                    />
                  ) : item.kind === 'post' ? (
                    <PersonPost
                      post={item.post}
                      isMine={item.post.author?.id === profileId}
                      onToggleLike={() =>
                        postMutations.like.mutate({
                          postId: item.post.id,
                          liked: item.post.likedByMe,
                        })
                      }
                      onDelete={() => postMutations.remove.mutate(item.post.id)}
                    />
                  ) : (
                    <ActivityPost
                      application={item.application}
                      at={item.at}
                      event={item.event}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Le fil se lit par pages. Sans ce bouton, paginer ne ferait que
              cacher le reste — le comédien croirait avoir tout vu. */}
          {(castings.hasMore || posts.hasMore) && (
            <div className="flex justify-center py-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={castings.loadingMore || posts.loadingMore}
                onClick={() => {
                  if (castings.hasMore) void castings.loadMore()
                  if (posts.hasMore) void posts.loadMore()
                }}
              >
                {castings.loadingMore || posts.loadingMore
                  ? t('feed.loadingMore')
                  : t('feed.loadMore')}
              </Button>
            </div>
          )}

          <p className="pb-2 text-[12px] text-muted">
            {t('feed.footer', { email: user?.email ?? '' })}
          </p>
        </div>

        {/* ── Right rail: what needs you ── */}
        <aside className="hidden min-w-0 flex-col gap-4 xl:sticky xl:top-[5.5rem] xl:flex">
          <Card className="flex flex-col gap-3.5">
            <RailHead
              icon={<Film className="h-4 w-4" />}
              title={t('feed.rail.auditions')}
              to="/talent/auditions"
              count={activeApplications.length}
            />
            {activeApplications.length === 0 ? (
              <p className="text-[13px] text-muted">
                {t('feed.rail.auditionsEmpty')}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {activeApplications.slice(0, 4).map((application) => (
                  <li key={application.id} className="flex min-w-0 items-center gap-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">
                        {application.role?.name ?? 'Role'}
                      </span>
                      <span className="block truncate text-[12px] text-muted">
                        {application.project?.title ?? 'Project'}
                      </span>
                    </span>
                    <Tag tone={APPLICATION_STATUS_TONE[application.status]}>
                      {t(`status.${application.status}`)}
                    </Tag>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="flex flex-col gap-3.5">
            <RailHead
              icon={<Bell className="h-4 w-4" />}
              title={t('feed.rail.notifications')}
              to="/talent/notifications"
              count={unreadNotifications.length}
            />
            {(notifications.data ?? []).length === 0 ? (
              <p className="text-[13px] text-muted">
                {t('feed.rail.notificationsEmpty')}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {(notifications.data ?? []).slice(0, 4).map((item) => (
                  <li key={item.id} className="flex min-w-0 items-start gap-2.5">
                    <span
                      className={cn(
                        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                        item.read_at ? 'bg-line' : 'bg-link',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">
                        {item.title}
                      </span>
                      <span className="block truncate text-[12px] text-muted">{item.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="flex flex-col gap-3.5">
            <span className="tech-label inline-flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              {t('social.suggestions')}
            </span>
            {(suggestions.data ?? []).length === 0 ? (
              <p className="text-[13px] text-muted">{t('social.noSuggestions')}</p>
            ) : (
              <>
                <ul className="flex flex-col gap-3">
                  {(suggestions.data ?? []).map((person) => {
                    const personName =
                      person.professionalName ||
                      [person.first_name, person.last_name].filter(Boolean).join(' ') ||
                      t('social.someone')
                    return (
                      <li key={person.id} className="flex min-w-0 items-center gap-2.5">
                        <Avatar src={person.avatar_url ?? undefined} name={personName} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold text-ink">
                            {personName}
                          </span>
                          {person.headline && (
                            <span className="block truncate text-[12px] text-muted">
                              {person.headline}
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            follow.person.mutate({ targetId: person.id, following: false })
                          }
                          className="inline-flex min-h-[32px] shrink-0 items-center rounded-full border border-ink px-3 text-[12.5px] font-bold text-ink transition-colors hover:bg-paper"
                        >
                          {t('social.follow')}
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <p className="text-[12px] text-muted">{t('social.suggestionsHint')}</p>
              </>
            )}
          </Card>

          <Card className="flex flex-col gap-3.5">
            <RailHead
              icon={<MessageCircle className="h-4 w-4" />}
              title={t('feed.rail.messages')}
              to="/talent/messages"
            />
            {(conversations.data ?? []).length === 0 ? (
              <p className="text-[13px] text-muted">
                {t('feed.rail.messagesEmpty')}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {(conversations.data ?? []).slice(0, 3).map((conversation) => (
                  <li key={conversation.id} className="min-w-0">
                    <Link to="/talent/messages" className="flex min-w-0 items-center gap-2.5">
                      <Avatar
                        src={conversation.participants[0]?.avatar_url ?? undefined}
                        name={participantName(conversation.participants[0])}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-ink">
                          {participantName(conversation.participants[0])}
                        </span>
                        <span className="block truncate text-[12px] text-muted">
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
        </aside>
      </div>

      {applyTo && (
        <ApplyModal
          role={applyTo.role}
          castingTitle={applyTo.castingTitle}
          onClose={() => setApplyTo(null)}
        />
      )}
    </>
  )
}

/** "Closing soon" orders by deadline; every other scope is reverse-chronological. */
function sortFeed(items: FeedItem[], scope: Scope): FeedItem[] {
  if (scope === 'closing') {
    const deadline = (item: FeedItem) =>
      item.kind === 'casting'
        ? new Date(item.casting.deadline_at ?? '').getTime()
        : Number.POSITIVE_INFINITY
    return [...items].sort((a, b) => deadline(a) - deadline(b))
  }
  return [...items].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}

function ProfileStrength({
  label,
  percent,
  next,
}: {
  label: string
  percent: number
  next?: string
}) {
  return (
    <div className="mt-4 rounded-field bg-paper p-3">
      <div className="flex items-center justify-between text-[12px] font-semibold text-ink">
        <span className="uppercase tracking-[0.18em] text-muted">{label}</span>
        <span className="font-mono">{percent}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-ink transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      {next && <p className="mt-2 text-[12px] text-muted">{next}</p>}
    </div>
  )
}

function RailHead({
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
  const t = useT()

  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <span className="tech-label inline-flex min-w-0 items-center gap-1.5">
        {icon}
        <span className="truncate">{title}</span>
        {count !== undefined && count > 0 && (
          <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 font-mono text-[10px] text-muted">
            {count}
          </span>
        )}
      </span>
      <Link
        to={to}
        className="inline-flex h-8 shrink-0 items-center rounded-btn px-1.5 text-[12.5px] font-semibold text-link hover:bg-link/5"
      >
        {t('common.seeAll')}
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
