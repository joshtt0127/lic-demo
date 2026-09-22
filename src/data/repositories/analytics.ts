import { supabase } from '@/lib/supabase'
import type { ApplicationStatus, CandidateViewRow } from '@/types/database'

/**
 * Reports, counted from the rows that already exist.
 *
 * No analytics table, no event pipeline: every number here is derived from
 * applications, reviews and notes, so it cannot drift from what the casting
 * screens show. Anything that cannot be counted honestly (why a talent
 * dropped, where they came from) is simply absent.
 */

export type FunnelStep = { key: ApplicationStatus; label: string; count: number; share: number }

export type CastingReport = {
  id: string
  title: string
  projectTitle: string
  status: string
  deadlineAt: string | null
  roles: number
  rolesFilled: number
  submissions: number
  shortlisted: number
  cast: number
  tapes: number
}

export type TeamReport = {
  profileId: string
  name: string
  avatarUrl: string | null
  reviews: number
  notes: number
}

export type RoleRisk = {
  roleId: string
  roleName: string
  castingId: string
  castingTitle: string
  reason: string
}

export type OrgAnalytics = {
  totals: {
    castings: number
    published: number
    roles: number
    rolesFilled: number
    candidates: number
    tapes: number
    shortlisted: number
    cast: number
  }
  funnel: FunnelStep[]
  weekly: { week: string; label: string; submissions: number }[]
  /** Median hours, or null when nothing has been looked at / decided yet. */
  medianHours: { toFirstView: number | null; toDecision: number | null }
  perCasting: CastingReport[]
  team: TeamReport[]
  risks: RoleRisk[]
  candidates: CandidateViewRow[]
}

/** A status "reaches" every step before it — that is what a funnel means. */
const FUNNEL: { key: ApplicationStatus; label: string; reached: ApplicationStatus[] }[] = [
  {
    key: 'submitted',
    label: 'Applied',
    reached: [
      'submitted',
      'viewed',
      'under_review',
      'shortlisted',
      'callback',
      'offer',
      'cast',
      'not_selected',
    ],
  },
  {
    key: 'viewed',
    label: 'Watched',
    reached: ['viewed', 'under_review', 'shortlisted', 'callback', 'offer', 'cast'],
  },
  {
    key: 'shortlisted',
    label: 'Shortlisted',
    reached: ['shortlisted', 'callback', 'offer', 'cast'],
  },
  { key: 'callback', label: 'Callback', reached: ['callback', 'offer', 'cast'] },
  { key: 'offer', label: 'Offer', reached: ['offer', 'cast'] },
  { key: 'cast', label: 'Cast', reached: ['cast'] },
]

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function hoursBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null
  const delta = new Date(to).getTime() - new Date(from).getTime()
  return delta > 0 ? delta / 3_600_000 : null
}

export async function orgAnalytics(orgId: string): Promise<OrgAnalytics> {
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id, title')
    .eq('org_id', orgId)
  if (projectsError) throw projectsError

  const projectIds = (projects ?? []).map((project) => project.id)
  const empty: OrgAnalytics = {
    totals: {
      castings: 0,
      published: 0,
      roles: 0,
      rolesFilled: 0,
      candidates: 0,
      tapes: 0,
      shortlisted: 0,
      cast: 0,
    },
    funnel: [],
    weekly: [],
    medianHours: { toFirstView: null, toDecision: null },
    perCasting: [],
    team: [],
    risks: [],
    candidates: [],
  }
  if (projectIds.length === 0) return empty

  const [castingsRes, membersRes] = await Promise.all([
    supabase
      .from('casting_calls')
      .select('id, title, status, deadline_at, project_id, roles ( id, name, status )')
      .in('project_id', projectIds),
    supabase
      .from('organization_members')
      .select('profile_id, profiles ( id, first_name, last_name, avatar_url )')
      .eq('org_id', orgId)
      .eq('status', 'active'),
  ])
  if (castingsRes.error) throw castingsRes.error
  if (membersRes.error) throw membersRes.error

  type CastingJoin = {
    id: string
    title: string
    status: string
    deadline_at: string | null
    project_id: string
    roles: { id: string; name: string; status: string }[] | null
  }
  const castings = (castingsRes.data ?? []) as unknown as CastingJoin[]
  const roleIds = castings.flatMap((casting) => (casting.roles ?? []).map((role) => role.id))

  if (roleIds.length === 0) {
    return {
      ...empty,
      totals: {
        ...empty.totals,
        castings: castings.length,
        published: castings.filter((casting) => casting.status === 'published').length,
      },
    }
  }

  const [candidatesRes, applicationsRes] = await Promise.all([
    supabase.from('v_candidates').select('*').in('role_id', roleIds),
    supabase
      .from('applications')
      .select('id, role_id, status, submitted_at, viewed_at, decided_at')
      .in('role_id', roleIds),
  ])
  if (candidatesRes.error) throw candidatesRes.error
  if (applicationsRes.error) throw applicationsRes.error

  const candidates = (candidatesRes.data ?? []) as CandidateViewRow[]
  const applications = applicationsRes.data ?? []
  const applicationIds = applications.map((application) => application.id)

  const [reviewsRes, notesRes] = await Promise.all([
    supabase.from('candidate_reviews').select('reviewer_id').in('application_id', applicationIds),
    supabase.from('candidate_notes').select('author_id').in('application_id', applicationIds),
  ])
  if (reviewsRes.error) throw reviewsRes.error
  if (notesRes.error) throw notesRes.error

  // ── Funnel ──
  const total = candidates.length
  const funnel: FunnelStep[] = FUNNEL.map((step) => {
    const count = candidates.filter((candidate) => step.reached.includes(candidate.status)).length
    return {
      key: step.key,
      label: step.label,
      count,
      share: total === 0 ? 0 : Math.round((count / total) * 100),
    }
  })

  // ── Volume, by week ──
  const weekly: OrgAnalytics['weekly'] = []
  const now = new Date()
  for (let offset = 7; offset >= 0; offset -= 1) {
    const end = new Date(now)
    end.setDate(now.getDate() - offset * 7)
    const start = new Date(end)
    start.setDate(end.getDate() - 6)
    const from = start.toISOString().slice(0, 10)
    const to = end.toISOString().slice(0, 10)
    weekly.push({
      week: to,
      label: end.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      submissions: candidates.filter((candidate) => {
        const day = (candidate.submitted_at ?? '').slice(0, 10)
        return day >= from && day <= to
      }).length,
    })
  }

  // ── Reaction times ──
  const toFirstView = applications
    .map((application) => hoursBetween(application.submitted_at, application.viewed_at))
    .filter((value): value is number => value !== null)
  const toDecision = applications
    .map((application) => hoursBetween(application.submitted_at, application.decided_at))
    .filter((value): value is number => value !== null)

  // ── Per casting ──
  const perCasting: CastingReport[] = castings.map((casting) => {
    const roles = casting.roles ?? []
    const own = candidates.filter((candidate) => candidate.casting_call_id === casting.id)
    return {
      id: casting.id,
      title: casting.title,
      projectTitle:
        (projects ?? []).find((project) => project.id === casting.project_id)?.title ?? '—',
      status: casting.status,
      deadlineAt: casting.deadline_at,
      roles: roles.length,
      rolesFilled: roles.filter((role) => role.status === 'booked').length,
      submissions: own.length,
      shortlisted: own.filter((candidate) =>
        ['shortlisted', 'callback', 'offer', 'cast'].includes(candidate.status),
      ).length,
      cast: own.filter((candidate) => candidate.status === 'cast').length,
      tapes: own.filter((candidate) => candidate.has_self_tape).length,
    }
  })

  // ── Team ──
  type MemberJoin = {
    profile_id: string
    profiles: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null } | null
  }
  const team: TeamReport[] = ((membersRes.data ?? []) as unknown as MemberJoin[]).map((member) => ({
    profileId: member.profile_id,
    name:
      [member.profiles?.first_name, member.profiles?.last_name].filter(Boolean).join(' ') ||
      'Member',
    avatarUrl: member.profiles?.avatar_url ?? null,
    reviews: (reviewsRes.data ?? []).filter((review) => review.reviewer_id === member.profile_id)
      .length,
    notes: (notesRes.data ?? []).filter((note) => note.author_id === member.profile_id).length,
  }))

  // ── What needs attention ──
  const risks: RoleRisk[] = []
  for (const casting of castings) {
    if (casting.status !== 'published') continue
    for (const role of casting.roles ?? []) {
      const own = candidates.filter((candidate) => candidate.role_id === role.id)
      if (own.length === 0) {
        risks.push({
          roleId: role.id,
          roleName: role.name,
          castingId: casting.id,
          castingTitle: casting.title,
          reason: 'No candidate yet',
        })
        continue
      }
      const shortlisted = own.filter((candidate) =>
        ['shortlisted', 'callback', 'offer', 'cast'].includes(candidate.status),
      ).length
      const days = casting.deadline_at
        ? Math.ceil((new Date(casting.deadline_at).getTime() - Date.now()) / 86_400_000)
        : null
      if (shortlisted === 0 && days !== null && days <= 3) {
        risks.push({
          roleId: role.id,
          roleName: role.name,
          castingId: casting.id,
          castingTitle: casting.title,
          reason: days < 0 ? 'Deadline passed, nobody shortlisted' : `Closes in ${days}d, nobody shortlisted`,
        })
      }
    }
  }

  return {
    totals: {
      castings: castings.length,
      published: castings.filter((casting) => casting.status === 'published').length,
      roles: roleIds.length,
      rolesFilled: castings
        .flatMap((casting) => casting.roles ?? [])
        .filter((role) => role.status === 'booked').length,
      candidates: total,
      tapes: candidates.filter((candidate) => candidate.has_self_tape).length,
      shortlisted: candidates.filter((candidate) =>
        ['shortlisted', 'callback', 'offer', 'cast'].includes(candidate.status),
      ).length,
      cast: candidates.filter((candidate) => candidate.status === 'cast').length,
    },
    funnel,
    weekly,
    medianHours: { toFirstView: median(toFirstView), toDecision: median(toDecision) },
    perCasting: perCasting.sort((a, b) => b.submissions - a.submissions),
    team: team.sort((a, b) => b.reviews - a.reviews),
    risks,
    candidates,
  }
}
