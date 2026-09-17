import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  Copy,
  Eye,
  ExternalLink,
  FileText,
  Users,
  Layers,
  LifeBuoy,
  Pencil,
  Plus,
  Search,
  Send,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react'
import { Avatar, Button, Card, FormError, Input, SelectInput, Spinner, Tag } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentOrganization, useOrgMembers } from '@/features/organizations/queries'
import {
  castingHealth,
  submissionsOverTime,
  useCandidatesForRoles,
  useCastingActivity,
  useOrgCasting,
  useStudioMutations,
  type ActivityEntry,
} from '@/features/studio/queries'
import { useLanguagesCatalog } from '@/features/talent/queries'
import {
  APPLICATION_STATUS_LABEL,
  formatDate,
  formatDateShort,
  relativeTime,
} from '@/lib/format'
import { ORG_ROLE_LABEL } from '@/lib/access'
import { colors } from '@/styles/tokens'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import type {
  ApplicationStatus,
  CandidateViewRow,
  RoleRow,
  RoleStatus,
} from '@/types/database'
import type { RoleInput } from '@/data/repositories/castings'
import { RoleForm } from './NewCastingPage'
import { CandidateReviewModal } from './CandidateReviewModal'

/**
 * Casting call dashboard — the production-side cockpit for one casting.
 *
 * Every figure is counted from the organization's own rows. The only piece of
 * state a human sets is a role's status; submissions, shortlists, callbacks and
 * the health read-out are derived, so they cannot drift.
 */

const TABS = ['overview', 'roles', 'submissions', 'shortlist', 'callbacks', 'team', 'activity'] as const
type Tab = (typeof TABS)[number]

const TAB_LABEL: Record<Tab, string> = {
  overview: 'Overview',
  roles: 'Roles',
  submissions: 'Submissions',
  shortlist: 'Shortlist',
  callbacks: 'Callbacks',
  team: 'Team',
  activity: 'Activity',
}

const ROLE_STATUSES: RoleStatus[] = ['open', 'reviewing', 'callbacks', 'booked', 'closed']

const ROLE_STATUS_LABEL: Record<RoleStatus, string> = {
  open: 'Open',
  reviewing: 'To review',
  callbacks: 'Callbacks',
  booked: 'Booked',
  closed: 'Closed',
}

const SHORTLIST_STATUSES: ApplicationStatus[] = ['shortlisted', 'callback', 'offer', 'cast']

export function CastingDashboardPage() {
  const { castingId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const { profile } = useAuth()
  const { organization } = useCurrentOrganization(profile?.id)

  const casting = useOrgCasting(castingId)
  const roleIds = (casting.data?.roles ?? []).map((role) => role.id)
  const candidates = useCandidatesForRoles(roleIds)
  const activity = useCastingActivity(candidates.data)
  const members = useOrgMembers(organization?.id)
  const languages = useLanguagesCatalog()
  const mutations = useStudioMutations(organization?.id, profile?.id)

  const tab = (params.get('tab') as Tab) ?? 'overview'
  const setTab = (next: Tab) => {
    const search = new URLSearchParams(params)
    if (next === 'overview') search.delete('tab')
    else search.set('tab', next)
    setParams(search, { replace: true })
  }

  const [reviewing, setReviewing] = useState<CandidateViewRow | null>(null)
  const [addingRole, setAddingRole] = useState(false)
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null)
  const [roleDraft, setRoleDraft] = useState<RoleInput>({ name: '', roleType: 'supporting' })
  const [roleQuery, setRoleQuery] = useState('')
  const [roleScope, setRoleScope] = useState<'all' | 'lead' | 'supporting' | 'booked'>('all')
  const [error, setError] = useState<string | null>(null)

  const rows = candidates.data ?? []

  const stats = useMemo(() => {
    const roles = casting.data?.roles ?? []
    const perRole = new Map<string, CandidateViewRow[]>()
    for (const candidate of rows) {
      perRole.set(candidate.role_id, [...(perRole.get(candidate.role_id) ?? []), candidate])
    }

    const submissions = rows.length
    const today = rows.filter(
      (candidate) =>
        candidate.submitted_at &&
        Date.now() - new Date(candidate.submitted_at).getTime() < 86_400_000,
    ).length
    const shortlist = rows.filter((candidate) => SHORTLIST_STATUSES.includes(candidate.status))
    const callbacks = rows.filter((candidate) => candidate.status === 'callback')
    const booked = rows.filter((candidate) => candidate.status === 'cast')
    const tapesToReview = rows.filter(
      (candidate) => candidate.has_self_tape && ['submitted', 'viewed'].includes(candidate.status),
    ).length

    return {
      perRole,
      roles,
      leads: roles.filter((role) => role.role_type === 'lead').length,
      supporting: roles.filter((role) => role.role_type !== 'lead').length,
      submissions,
      today,
      shortlist: shortlist.length,
      readyForCallback: rows.filter((candidate) => candidate.status === 'shortlisted').length,
      callbacks: callbacks.length,
      booked: booked.length,
      tapesToReview,
      rolesWithoutCandidates: roles.filter((role) => (perRole.get(role.id) ?? []).length === 0)
        .length,
    }
  }, [casting.data?.roles, rows])

  if (casting.isLoading || (!casting.data && !casting.error)) {
    return (
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-24" />
        <Skeleton className="h-72" />
      </div>
    )
  }

  if (!casting.data) {
    return (
      <div className="flex flex-col gap-4">
        <FormError>{errorMessage(casting.error, 'This casting call is not available')}</FormError>
        <Link to="/studio/casting-calls" className="text-sm font-semibold text-link hover:underline">
          Back to casting calls
        </Link>
      </div>
    )
  }

  const data = casting.data
  const published = data.status === 'published'
  const health = castingHealth({
    status: data.status,
    roles: stats.roles.length,
    rolesWithoutCandidates: stats.rolesWithoutCandidates,
    tapesToReview: stats.tapesToReview,
    deadlineAt: data.deadline_at,
  })
  const publicLink = `${window.location.origin}${import.meta.env.BASE_URL}casting/${data.id}`
  const languageName = (code: string) =>
    (languages.data ?? []).find((language) => language.code === code)?.name ?? code

  async function run(action: () => Promise<unknown>, message: string, success?: string) {
    setError(null)
    try {
      await action()
      if (success) toast(success)
    } catch (actionError) {
      setError(errorMessage(actionError, message))
    }
  }

  const filteredRoles = stats.roles
    .filter((role) =>
      roleQuery.trim() ? role.name.toLowerCase().includes(roleQuery.trim().toLowerCase()) : true,
    )
    .filter((role) => {
      if (roleScope === 'lead') return role.role_type === 'lead'
      if (roleScope === 'supporting') return role.role_type !== 'lead'
      if (roleScope === 'booked') {
        return (stats.perRole.get(role.id) ?? []).some((candidate) => candidate.status === 'cast')
      }
      return true
    })

  const bookedRoles = stats.roles.filter((role) =>
    (stats.perRole.get(role.id) ?? []).some((candidate) => candidate.status === 'cast'),
  ).length

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5">
      <button
        onClick={() => navigate('/studio/casting-calls')}
        className="-ml-2 inline-flex h-9 w-fit items-center gap-2 rounded-btn px-2 text-[15px] font-medium text-muted transition-colors hover:bg-ink/5 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to all castings
      </button>

      {error && <FormError>{error}</FormError>}

      {/* ── Header ── */}
      <Card className="flex flex-col gap-5 lg:flex-row lg:items-center">
        <span className="h-28 w-20 shrink-0 overflow-hidden rounded-card bg-line">
          {data.project?.poster_url && (
            <img
              src={data.project.poster_url}
              alt=""
              className="h-full w-full object-cover object-top"
            />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
            {[data.project?.production_type, data.project?.company_name, data.project?.genre]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <h1 className="mt-1 font-display text-[1.7rem] font-extrabold tracking-[-0.03em] text-ink sm:text-[2.2rem]">
            {data.project?.title ?? data.title}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-muted">
            <span>
              {data.deadline_at ? `Casting closes ${formatDate(data.deadline_at)}` : 'No deadline'}
            </span>
            {(data.project?.shooting_start || data.project?.shooting_end) && (
              <span>
                · Shooting {formatDateShort(data.project?.shooting_start)}
                {data.project?.shooting_end ? `–${formatDateShort(data.project.shooting_end)}` : ''}
              </span>
            )}
            {data.location && <span>· {data.location}</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<Copy className="h-3.5 w-3.5" />}
            onClick={() => {
              void navigator.clipboard.writeText(publicLink)
              toast('Casting link copied')
            }}
          >
            Share
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={() => window.open(publicLink, '_blank', 'noopener')}
          >
            View as talent
          </Button>
          <Button
            variant="premium"
            size="sm"
            icon={<Layers className="h-3.5 w-3.5" />}
            onClick={() => setTab('submissions')}
          >
            Casting console
          </Button>
          {published ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={mutations.setCastingStatus.isPending}
              onClick={() =>
                run(
                  () => mutations.setCastingStatus.mutateAsync({ id: data.id, status: 'closed' }),
                  'Could not close the casting',
                  'Casting closed',
                )
              }
            >
              Close submissions
            </Button>
          ) : (
            <Button
              size="sm"
              icon={mutations.setCastingStatus.isPending ? <Spinner /> : <Send className="h-3.5 w-3.5" />}
              disabled={stats.roles.length === 0 || mutations.setCastingStatus.isPending}
              onClick={() =>
                run(
                  () => mutations.setCastingStatus.mutateAsync({ id: data.id, status: 'published' }),
                  'Could not publish the casting',
                  'Casting published — talents can apply now',
                )
              }
            >
              {data.status === 'closed' ? 'Re-open' : 'Publish'}
            </Button>
          )}
        </div>
      </Card>

      {/* ── Tabs ── */}
      <nav className="no-scrollbar flex items-center gap-1 overflow-x-auto border-b border-line">
        {TABS.map((item) => {
          const count =
            item === 'roles'
              ? stats.roles.length
              : item === 'submissions'
                ? stats.submissions
                : item === 'shortlist'
                  ? stats.shortlist
                  : item === 'callbacks'
                    ? stats.callbacks
                    : null
          return (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={cn(
                'relative shrink-0 px-3.5 pb-3 pt-2 text-[15px] font-semibold transition-colors',
                tab === item ? 'text-ink' : 'text-muted hover:text-ink',
              )}
            >
              {TAB_LABEL[item]}
              {count !== null && count > 0 && (
                <span className="ml-1.5 font-mono text-[11px] text-muted">{count}</span>
              )}
              {tab === item && <span className="absolute inset-x-2 -bottom-px h-[2px] bg-ink" />}
            </button>
          )
        })}
      </nav>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Kpi
              icon={<Users className="h-4 w-4" />}
              label="Roles"
              value={stats.roles.length}
              detail={`${stats.leads} lead · ${stats.supporting} supporting`}
            />
            <Kpi
              icon={<FileText className="h-4 w-4" />}
              label="Submissions"
              value={stats.submissions}
              detail={stats.today > 0 ? `↑ +${stats.today} today` : 'None today'}
              detailTone={stats.today > 0 ? 'good' : undefined}
            />
            <Kpi
              icon={<Star className="h-4 w-4" />}
              label="Shortlist"
              value={stats.shortlist}
              detail={`${stats.readyForCallback} ready for callback`}
            />
            <Kpi
              icon={<CalendarDays className="h-4 w-4" />}
              label="Callbacks"
              value={stats.callbacks}
              detail={stats.callbacks > 0 ? 'To schedule' : 'None yet'}
            />
            <Kpi
              icon={<Check className="h-4 w-4" />}
              label="Booked"
              value={stats.booked}
              detail={`of ${stats.roles.length} role${stats.roles.length === 1 ? '' : 's'}`}
            />
            <div
              className={cn(
                'flex flex-col justify-center gap-1 rounded-card border p-4',
                health.tone === 'good' && 'border-signal-good/30 bg-signal-good-bg',
                health.tone === 'maybe' && 'border-signal-maybe/30 bg-signal-maybe/10',
                health.tone === 'no' && 'border-signal-no/30 bg-signal-no/5',
              )}
            >
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 text-[13px] font-bold',
                  health.tone === 'good' && 'text-signal-good',
                  health.tone === 'maybe' && 'text-[#8A6D00]',
                  health.tone === 'no' && 'text-signal-no',
                )}
              >
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    health.tone === 'good' && 'bg-signal-good',
                    health.tone === 'maybe' && 'bg-signal-maybe',
                    health.tone === 'no' && 'bg-signal-no',
                  )}
                />
                {health.title}
              </span>
              <span className="text-[13px] leading-snug text-ink/80">{health.detail}</span>
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-5">
              <Card className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-[19px] font-bold text-ink">Roles</h2>
                  <div className="flex items-center gap-2">
                    <Input
                      icon={<Search className="h-4 w-4" />}
                      placeholder="Search roles…"
                      value={roleQuery}
                      onChange={(event) => setRoleQuery(event.target.value)}
                      className="w-[200px]"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Plus className="h-3.5 w-3.5" />}
                      onClick={() => {
                        setRoleDraft({ name: '', roleType: 'supporting' })
                        setAddingRole(true)
                        setTab('roles')
                      }}
                    >
                      Add role
                    </Button>
                  </div>
                </div>

                <RolesTable
                  compact
                  roles={filteredRoles.slice(0, 5)}
                  perRole={stats.perRole}
                  onStatus={(role, status) =>
                    run(
                      () => mutations.setRoleStatus.mutateAsync({ id: role.id, status }),
                      'Could not change the role status',
                    )
                  }
                  onOpen={() => setTab('submissions')}
                />

                {stats.roles.length > 5 && (
                  <button
                    onClick={() => setTab('roles')}
                    className="self-start text-[13px] font-semibold text-link hover:underline"
                  >
                    Showing 5 of {stats.roles.length} roles — see all
                  </button>
                )}
              </Card>

              <TeamCard members={members.data ?? []} loading={members.isLoading} />
            </div>

            <div className="flex min-w-0 flex-col gap-5">
              <Card className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-[17px] font-bold text-ink">
                    Submissions over time
                  </h2>
                  <span className="text-[12px] text-muted">Last 14 days</span>
                </div>
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={submissionsOverTime(rows)}>
                      <defs>
                        <linearGradient id="submissions" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={colors.link} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={colors.link} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: colors.muted }}
                        interval={2}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: colors.muted }}
                        width={24}
                        allowDecimals={false}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: `1px solid ${colors.line}`,
                          fontSize: 12,
                        }}
                        labelFormatter={(_label, payload) =>
                          payload?.[0]?.payload ? formatDate(payload[0].payload.day) : ''
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="submissions"
                        stroke={colors.link}
                        strokeWidth={2}
                        fill="url(#submissions)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[12px] text-muted">
                  Counted from the applications this casting received.
                </p>
              </Card>

              <Card className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-[17px] font-bold text-ink">Recent activity</h2>
                  <button
                    onClick={() => setTab('activity')}
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink"
                  >
                    See all
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <ActivityList entries={(activity.data ?? []).slice(0, 4)} loading={activity.isLoading} />
              </Card>

              <Card className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cream text-ink">
                  <LifeBuoy className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-ink">Need help?</p>
                  <p className="text-[13px] text-muted">
                    Publishing makes roles visible to talents instantly — closing stops new
                    submissions without hiding what you received.
                  </p>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* ── Roles ── */}
      {tab === 'roles' && (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ['all', `All roles (${stats.roles.length})`],
                  ['lead', `Lead (${stats.leads})`],
                  ['supporting', `Supporting (${stats.supporting})`],
                  ['booked', `Booked (${bookedRoles})`],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setRoleScope(value)}
                  className={cn(
                    'rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors',
                    roleScope === value
                      ? 'bg-ink text-white'
                      : 'bg-paper text-muted hover:text-ink',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                icon={<Search className="h-4 w-4" />}
                placeholder="Search roles…"
                value={roleQuery}
                onChange={(event) => setRoleQuery(event.target.value)}
                className="w-[200px]"
              />
              <Button
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => {
                  setRoleDraft({ name: '', roleType: 'supporting' })
                  setAddingRole(true)
                }}
              >
                Add role
              </Button>
            </div>
          </div>

          {addingRole && (
            <RoleForm
              draft={roleDraft}
              onChange={setRoleDraft}
              busy={mutations.createRole.isPending}
              onCancel={() => setAddingRole(false)}
              onAdd={() =>
                run(
                  async () => {
                    await mutations.createRole.mutateAsync({
                      castingId: data.id,
                      input: { ...roleDraft, sortOrder: stats.roles.length },
                    })
                    setAddingRole(false)
                  },
                  'Could not add the role',
                  'Role added',
                )
              }
            />
          )}

          {stats.roles.length === 0 && !addingRole ? (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="No role yet"
              description="A casting call needs at least one role before it can be published."
              action={<Button size="sm" onClick={() => setAddingRole(true)}>Add a role</Button>}
            />
          ) : (
            <RolesTable
              roles={filteredRoles}
              perRole={stats.perRole}
              editable
              onStatus={(role, status) =>
                run(
                  () => mutations.setRoleStatus.mutateAsync({ id: role.id, status }),
                  'Could not change the role status',
                )
              }
              onEdit={(role) => setEditingRole(role)}
              onDelete={(role) =>
                run(
                  () => mutations.deleteRole.mutateAsync(role.id),
                  'Could not delete the role',
                  'Role deleted',
                )
              }
              onOpen={() => setTab('submissions')}
            />
          )}

          {editingRole && (
            <RoleForm
              draft={{
                name: editingRole.name,
                description: editingRole.description,
                roleType: editingRole.role_type,
                genderPref: editingRole.gender_pref,
                playingAgeMin: editingRole.playing_age_min,
                playingAgeMax: editingRole.playing_age_max,
                location: editingRole.location,
                languages: editingRole.languages,
                skills: editingRole.skills,
                selftapeInstructions: editingRole.selftape_instructions,
              }}
              onChange={(draft) =>
                setEditingRole({
                  ...editingRole,
                  name: draft.name,
                  description: draft.description ?? null,
                  role_type: draft.roleType ?? editingRole.role_type,
                  gender_pref: draft.genderPref ?? null,
                  playing_age_min: draft.playingAgeMin ?? null,
                  playing_age_max: draft.playingAgeMax ?? null,
                  location: draft.location ?? null,
                  languages: draft.languages ?? [],
                  skills: draft.skills ?? [],
                  selftape_instructions: draft.selftapeInstructions ?? null,
                })
              }
              submitLabel="Save role"
              busy={mutations.updateRole.isPending}
              onCancel={() => setEditingRole(null)}
              onAdd={() =>
                run(
                  async () => {
                    await mutations.updateRole.mutateAsync({
                      id: editingRole.id,
                      input: {
                        name: editingRole.name,
                        description: editingRole.description,
                        roleType: editingRole.role_type,
                        genderPref: editingRole.gender_pref,
                        playingAgeMin: editingRole.playing_age_min,
                        playingAgeMax: editingRole.playing_age_max,
                        location: editingRole.location,
                        languages: editingRole.languages,
                        skills: editingRole.skills,
                        selftapeInstructions: editingRole.selftape_instructions,
                      },
                    })
                    setEditingRole(null)
                  },
                  'Could not save the role',
                  'Role updated',
                )
              }
            />
          )}
        </Card>
      )}

      {/* ── Candidate lists ── */}
      {(tab === 'submissions' || tab === 'shortlist' || tab === 'callbacks') && (
        <CandidateList
          title={TAB_LABEL[tab]}
          candidates={
            tab === 'submissions'
              ? rows
              : tab === 'shortlist'
                ? rows.filter((candidate) => SHORTLIST_STATUSES.includes(candidate.status))
                : rows.filter((candidate) => candidate.status === 'callback')
          }
          roles={stats.roles}
          loading={candidates.isLoading}
          languageName={languageName}
          onReview={setReviewing}
          onStatus={(candidate, status) =>
            run(
              () =>
                mutations.setApplicationStatus.mutateAsync({
                  applicationId: candidate.application_id,
                  status,
                }),
              'Could not change the status',
            )
          }
        />
      )}

      {/* ── Team ── */}
      {tab === 'team' && <TeamCard members={members.data ?? []} loading={members.isLoading} full />}

      {/* ── Activity ── */}
      {tab === 'activity' && (
        <Card className="flex flex-col gap-4">
          <h2 className="font-display text-[19px] font-bold text-ink">Activity</h2>
          <ActivityList entries={activity.data ?? []} loading={activity.isLoading} />
        </Card>
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

function Kpi({
  icon,
  label,
  value,
  detail,
  detailTone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  detail: string
  detailTone?: 'good'
}) {
  return (
    <Card className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-muted">{label}</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-paper text-muted">
          {icon}
        </span>
      </div>
      <span className="font-display text-[2rem] font-extrabold leading-none tracking-[-0.02em] text-ink">
        {value}
      </span>
      <span
        className={cn('text-[12px]', detailTone === 'good' ? 'text-signal-good' : 'text-muted')}
      >
        {detail}
      </span>
    </Card>
  )
}

function RolesTable({
  roles,
  perRole,
  editable,
  compact,
  onStatus,
  onEdit,
  onDelete,
  onOpen,
}: {
  roles: RoleRow[]
  perRole: Map<string, CandidateViewRow[]>
  editable?: boolean
  /** Overview keeps the essentials; the Roles tab shows everything. */
  compact?: boolean
  onStatus: (role: RoleRow, status: RoleStatus) => void
  onEdit?: (role: RoleRow) => void
  onDelete?: (role: RoleRow) => void
  onOpen: () => void
}) {
  if (roles.length === 0) {
    return <EmptyState compact title="No role matches" />
  }

  const headers = compact
    ? ['Role', 'Type', 'Submissions', 'Shortlist', 'Status']
    : ['Role', 'Type', 'Submissions', 'Shortlist', 'Status', 'Dates', '']

  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <table className={cn('w-full border-collapse', compact ? 'min-w-[560px]' : 'min-w-[720px]')}>
        <thead>
          <tr className="border-b border-line text-left">
            {headers.map((head) => (
              <th
                key={head}
                className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted"
              >
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => {
            const own = perRole.get(role.id) ?? []
            const booked = own.find((candidate) => candidate.status === 'cast')
            const shortlist = own.filter((candidate) =>
              SHORTLIST_STATUSES.includes(candidate.status),
            ).length

            return (
              <tr key={role.id} className="border-b border-line/70 last:border-0">
                <td className="px-2 py-3">
                  <button onClick={onOpen} className="flex items-center gap-3 text-left">
                    <Avatar
                      src={booked?.avatar_url ?? undefined}
                      name={booked?.name ?? role.name}
                      size="sm"
                    />
                    <span>
                      <span className="block text-[15px] font-bold text-ink">{role.name}</span>
                      <span className="block text-[12px] text-muted">
                        {[
                          role.gender_pref,
                          role.playing_age_min !== null && role.playing_age_max !== null
                            ? `${role.playing_age_min}–${role.playing_age_max}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'No criteria set'}
                      </span>
                    </span>
                  </button>
                </td>
                <td className="px-2 py-3">
                  <Tag tone={role.role_type === 'lead' ? 'link' : 'cream'}>
                    {role.role_type === 'lead'
                      ? 'Lead'
                      : role.role_type === 'contestant'
                        ? 'Contestant'
                        : 'Supporting'}
                  </Tag>
                </td>
                <td className="px-2 py-3 text-[15px] font-semibold text-ink">{own.length}</td>
                <td className="px-2 py-3 text-[15px] font-semibold text-ink">{shortlist}</td>
                <td className="px-2 py-3">
                  <SelectInput
                    aria-label={`Status of ${role.name}`}
                    value={role.status}
                    onChange={(event) => onStatus(role, event.target.value as RoleStatus)}
                    className="w-[150px]"
                  >
                    {ROLE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {ROLE_STATUS_LABEL[status]}
                      </option>
                    ))}
                  </SelectInput>
                </td>
                {!compact && (
                  <td className="px-2 py-3 text-[13px] text-muted">
                    {role.shooting_start ? formatDateShort(role.shooting_start) : '—'}
                  </td>
                )}
                {!compact && (
                <td className="px-2 py-3">
                  {editable && (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={() => onEdit?.(role)}
                        aria-label={`Edit ${role.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDelete?.(role)}
                        aria-label={`Delete ${role.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-signal-no/10 hover:text-signal-no"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  )}
                </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CandidateList({
  title,
  candidates,
  roles,
  loading,
  languageName,
  onReview,
  onStatus,
}: {
  title: string
  candidates: CandidateViewRow[]
  roles: RoleRow[]
  loading: boolean
  languageName: (code: string) => string
  onReview: (candidate: CandidateViewRow) => void
  onStatus: (candidate: CandidateViewRow, status: ApplicationStatus) => void
}) {
  const [roleFilter, setRoleFilter] = useState('')
  const [query, setQuery] = useState('')

  const rows = candidates
    .filter((candidate) => (roleFilter ? candidate.role_id === roleFilter : true))
    .filter((candidate) =>
      query.trim() ? candidate.name.toLowerCase().includes(query.trim().toLowerCase()) : true,
    )

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-[19px] font-bold text-ink">
          {title} <span className="font-mono text-[14px] text-muted">{rows.length}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            icon={<Search className="h-4 w-4" />}
            placeholder="Search a candidate…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-[200px]"
          />
          <SelectInput
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="w-[180px]"
          >
            <option value="">All roles</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </SelectInput>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-24" />
      ) : rows.length === 0 ? (
        <EmptyState
          compact
          icon={<Users className="h-4 w-4" />}
          title="Nobody here yet"
          description="Candidates appear as soon as talents apply to a published role."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((candidate) => (
            <li key={candidate.application_id} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar src={candidate.avatar_url ?? undefined} name={candidate.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-ink">
                  {candidate.name}
                </span>
                <span className="block truncate text-[12px] text-muted">
                  {[
                    candidate.role_name,
                    candidate.city,
                    candidate.playing_age_min && candidate.playing_age_max
                      ? `${candidate.playing_age_min}–${candidate.playing_age_max}`
                      : null,
                    candidate.languages.length > 0
                      ? candidate.languages.map(languageName).join(', ')
                      : null,
                    `applied ${relativeTime(candidate.submitted_at ?? candidate.created_at)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>

              {candidate.has_self_tape && (
                <Tag tone="link" className="shrink-0">
                  Self-tape
                </Tag>
              )}

              <span className="hidden shrink-0 items-center gap-2 sm:flex">
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
              </span>

              <span className="w-12 shrink-0 text-right font-display text-[15px] font-extrabold text-ink">
                {candidate.score}
              </span>

              <SelectInput
                aria-label={`Status of ${candidate.name}`}
                value={candidate.status}
                onChange={(event) => onStatus(candidate, event.target.value as ApplicationStatus)}
                className="w-[150px] shrink-0"
              >
                {(
                  [
                    'submitted',
                    'viewed',
                    'under_review',
                    'shortlisted',
                    'callback',
                    'offer',
                    'cast',
                    'not_selected',
                  ] as ApplicationStatus[]
                ).map((status) => (
                  <option key={status} value={status}>
                    {APPLICATION_STATUS_LABEL[status]}
                  </option>
                ))}
              </SelectInput>

              <Button
                size="sm"
                variant="secondary"
                icon={<Eye className="h-3.5 w-3.5" />}
                onClick={() => onReview(candidate)}
              >
                Review
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function TeamCard({
  members,
  loading,
  full,
}: {
  members: Awaited<ReturnType<typeof useOrgMembers>>['data'] extends (infer T)[] | undefined
    ? T[]
    : never
  loading: boolean
  full?: boolean
}) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[19px] font-bold text-ink">Your team</h2>
        <Link
          to="/studio/team"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink"
        >
          <Plus className="h-3.5 w-3.5" />
          Invite
        </Link>
      </div>

      {loading ? (
        <Skeleton className="h-16" />
      ) : members.length === 0 ? (
        <EmptyState compact title="Just you for now" description="Invite the rest of your team." />
      ) : (
        <ul className={cn('flex flex-wrap gap-4', full && 'flex-col')}>
          {members.map((member) => {
            const name =
              [member.profile?.first_name, member.profile?.last_name].filter(Boolean).join(' ') ||
              'Member'
            return (
              <li key={member.profile_id} className="flex min-w-0 items-center gap-2.5">
                <Avatar src={member.profile?.avatar_url ?? undefined} name={name} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold text-ink">{name}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {member.jobTitle ?? ORG_ROLE_LABEL[member.role]}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function ActivityList({ entries, loading }: { entries: ActivityEntry[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-24" />
  if (entries.length === 0) {
    return (
      <EmptyState
        compact
        icon={<Sparkles className="h-4 w-4" />}
        title="No activity yet"
        description="Votes, notes and decisions show up here as your team works."
      />
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-start gap-3">
          <Avatar src={entry.actorAvatar ?? undefined} name={entry.actorName} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] text-ink">
              <span className="font-bold">{entry.actorName}</span> {entry.verb}{' '}
              <span className="font-semibold">{entry.target}</span>
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-2">
              {entry.tag && <Tag tone={entry.tone}>{entry.tag}</Tag>}
              <span className="text-[12px] text-muted">{relativeTime(entry.at)}</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
