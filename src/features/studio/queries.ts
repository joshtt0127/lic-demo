import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCasting,
  createProject,
  createRole,
  deleteRole,
  getOrgCasting,
  listOrgCastings,
  listProjects,
  setCastingStatus,
  setProjectStatus,
  setRoleStatus,
  updateCasting,
  updateProject,
  updateRole,
  type CastingInput,
  type CastingWithProject,
  type ProjectInput,
  type RoleInput,
} from '@/data/repositories/castings'
import {
  addNote,
  getSelfTape,
  listCandidatesForProject,
  listCandidatesForRoles,
  listNotes,
  listReviews,
  markApplicationViewed,
  setApplicationStatus,
  voteOnCandidate,
} from '@/data/repositories/candidates'
import { supabase } from '@/lib/supabase'
import type {
  ApplicationStatus,
  CandidateViewRow,
  CastingStatus,
  ProjectStatus,
  ReviewVote,
  RoleStatus,
} from '@/types/database'

/**
 * Studio hooks.
 *
 * The dashboard numbers are derived here from real rows (castings, roles,
 * applications) — there is no stored KPI to drift out of date.
 */

export const studioKey = (orgId: string | undefined) => ['studio', orgId]

export function useOrgProjects(orgId: string | undefined) {
  return useQuery({
    queryKey: [...studioKey(orgId), 'projects'],
    queryFn: () => listProjects(orgId as string),
    enabled: Boolean(orgId),
  })
}

export function useOrgCastings(orgId: string | undefined) {
  return useQuery({
    queryKey: [...studioKey(orgId), 'castings'],
    queryFn: () => listOrgCastings(orgId as string),
    enabled: Boolean(orgId),
  })
}

export function useOrgCasting(castingId: string | undefined) {
  return useQuery({
    queryKey: ['studio-casting', castingId],
    queryFn: () => getOrgCasting(castingId as string),
    enabled: Boolean(castingId),
  })
}

export function useCandidatesForRoles(roleIds: string[]) {
  const key = [...roleIds].sort().join(',')
  return useQuery({
    queryKey: ['candidates-roles', key],
    queryFn: () => listCandidatesForRoles(roleIds),
    enabled: roleIds.length > 0,
  })
}

export function useProjectCandidates(projectId: string | undefined) {
  return useQuery({
    queryKey: ['candidates-project', projectId],
    queryFn: () => listCandidatesForProject(projectId as string),
    enabled: Boolean(projectId),
  })
}

export function useSelfTape(applicationId: string | undefined) {
  return useQuery({
    queryKey: ['self-tape', applicationId],
    queryFn: () => getSelfTape(applicationId as string),
    enabled: Boolean(applicationId),
    staleTime: 30 * 60_000,
  })
}

export function useCandidateReviews(applicationId: string | undefined) {
  return useQuery({
    queryKey: ['candidate-reviews', applicationId],
    queryFn: () => listReviews(applicationId as string),
    enabled: Boolean(applicationId),
  })
}

export function useCandidateNotes(applicationId: string | undefined) {
  return useQuery({
    queryKey: ['candidate-notes', applicationId],
    queryFn: () => listNotes(applicationId as string),
    enabled: Boolean(applicationId),
  })
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function useStudioMutations(orgId: string | undefined, profileId: string | undefined) {
  const queryClient = useQueryClient()

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: studioKey(orgId) })
    void queryClient.invalidateQueries({ queryKey: ['studio-casting'] })
    void queryClient.invalidateQueries({ queryKey: ['candidates-roles'] })
    void queryClient.invalidateQueries({ queryKey: ['candidates-project'] })
    // Talents see published castings through their own queries.
    void queryClient.invalidateQueries({ queryKey: ['open-castings'] })
  }

  const createProjectMutation = useMutation({
    mutationFn: (input: ProjectInput) =>
      createProject(orgId as string, profileId as string, input),
    onSuccess: invalidate,
  })

  const updateProjectMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProjectInput }) => updateProject(id, input),
    onSuccess: invalidate,
  })

  const projectStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProjectStatus }) =>
      setProjectStatus(id, status),
    onSuccess: invalidate,
  })

  const createCastingMutation = useMutation({
    mutationFn: (input: CastingInput) => createCasting(profileId as string, input),
    onSuccess: invalidate,
  })

  const updateCastingMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<Omit<CastingInput, 'projectId'>> }) =>
      updateCasting(id, input),
    onSuccess: invalidate,
  })

  const castingStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CastingStatus }) =>
      setCastingStatus(id, status),
    onSuccess: invalidate,
  })

  const createRoleMutation = useMutation({
    mutationFn: ({ castingId, input }: { castingId: string; input: RoleInput }) =>
      createRole(castingId, input),
    onSuccess: invalidate,
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: RoleInput }) => updateRole(id, input),
    onSuccess: invalidate,
  })

  const deleteRoleMutation = useMutation({ mutationFn: deleteRole, onSuccess: invalidate })

  const roleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RoleStatus }) => setRoleStatus(id, status),
    onSuccess: invalidate,
  })

  const statusMutation = useMutation({
    mutationFn: ({ applicationId, status }: { applicationId: string; status: ApplicationStatus }) =>
      setApplicationStatus(applicationId, status),
    onSuccess: invalidate,
  })

  const viewedMutation = useMutation({
    mutationFn: markApplicationViewed,
    onSuccess: invalidate,
  })

  const voteMutation = useMutation({
    mutationFn: ({
      applicationId,
      vote,
      comment,
    }: {
      applicationId: string
      vote: ReviewVote
      comment?: string | null
    }) => voteOnCandidate({ applicationId, reviewerId: profileId as string, vote, comment }),
    onSuccess: (_data, variables) => {
      invalidate()
      void queryClient.invalidateQueries({
        queryKey: ['candidate-reviews', variables.applicationId],
      })
    },
  })

  const noteMutation = useMutation({
    mutationFn: ({ applicationId, body }: { applicationId: string; body: string }) =>
      addNote({ applicationId, authorId: profileId as string, body }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['candidate-notes', variables.applicationId] })
    },
  })

  return {
    createProject: createProjectMutation,
    updateProject: updateProjectMutation,
    setProjectStatus: projectStatusMutation,
    createCasting: createCastingMutation,
    updateCasting: updateCastingMutation,
    setCastingStatus: castingStatusMutation,
    createRole: createRoleMutation,
    updateRole: updateRoleMutation,
    deleteRole: deleteRoleMutation,
    setRoleStatus: roleStatusMutation,
    setApplicationStatus: statusMutation,
    markViewed: viewedMutation,
    vote: voteMutation,
    addNote: noteMutation,
  }
}

// ── Dashboard model ──────────────────────────────────────────────────────────

export type CastingOverview = {
  casting: CastingWithProject
  submissions: number
  newSubmissions: number
  tapesToReview: number
  callbacks: number
  shortlisted: number
}

export type AttentionItem = {
  id: string
  title: string
  subtitle: string
  due: string
  urgent: boolean
  href: string
  posterUrl: string | null
  tone: 'red' | 'blue' | 'gold' | 'grey'
}

export type AgendaItem = {
  id: string
  label: string
  detail: string
  date: string
  href: string
}

export type StudioOverview = {
  castings: CastingOverview[]
  tapesToReview: number
  callbacksWaiting: number
  newSubmissions: number
  attention: AttentionItem[]
  agenda: AgendaItem[]
}

const NOT_YET_REVIEWED: ApplicationStatus[] = ['submitted', 'viewed']

function daysUntil(value: string): number {
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000)
}

/** One query set, all the numbers the studio home shows. */
export function useStudioOverview(orgId: string | undefined) {
  const castings = useOrgCastings(orgId)
  const roleIds = (castings.data ?? []).flatMap((casting) => casting.roles.map((role) => role.id))
  const candidates = useCandidatesForRoles(roleIds)

  const data: StudioOverview | undefined =
    castings.data && (candidates.data || roleIds.length === 0)
      ? buildOverview(castings.data, candidates.data ?? [])
      : undefined

  return {
    data,
    isLoading: castings.isLoading || (roleIds.length > 0 && candidates.isLoading),
    error: castings.error ?? candidates.error,
  }
}

export function buildOverview(
  castings: CastingWithProject[],
  candidates: CandidateViewRow[],
): StudioOverview {
  const byRole = new Map<string, CandidateViewRow[]>()
  for (const candidate of candidates) {
    byRole.set(candidate.role_id, [...(byRole.get(candidate.role_id) ?? []), candidate])
  }

  const overviews: CastingOverview[] = castings.map((casting) => {
    const own = casting.roles.flatMap((role) => byRole.get(role.id) ?? [])
    return {
      casting,
      submissions: own.length,
      newSubmissions: own.filter((candidate) => candidate.status === 'submitted').length,
      tapesToReview: own.filter(
        (candidate) => candidate.has_self_tape && NOT_YET_REVIEWED.includes(candidate.status),
      ).length,
      callbacks: own.filter((candidate) => candidate.status === 'callback').length,
      shortlisted: own.filter((candidate) => candidate.status === 'shortlisted').length,
    }
  })

  const attention: AttentionItem[] = []

  for (const overview of overviews) {
    const { casting } = overview
    const poster = casting.project?.poster_url ?? null
    const subtitle = casting.project?.title ?? casting.title

    if (overview.tapesToReview > 0) {
      attention.push({
        id: `tapes-${casting.id}`,
        title: `Review ${overview.tapesToReview} casting tape${overview.tapesToReview > 1 ? 's' : ''}`,
        subtitle,
        due: 'Today',
        urgent: true,
        href: `/studio/casting/${casting.id}`,
        posterUrl: poster,
        tone: 'red',
      })
    }

    const toAnswer = overview.newSubmissions - overview.tapesToReview
    if (toAnswer > 0) {
      attention.push({
        id: `new-${casting.id}`,
        title: `Open ${toAnswer} new application${toAnswer > 1 ? 's' : ''}`,
        subtitle,
        due: 'Today',
        urgent: true,
        href: `/studio/casting/${casting.id}`,
        posterUrl: poster,
        tone: 'blue',
      })
    }

    if (overview.shortlisted > 0) {
      attention.push({
        id: `shortlist-${casting.id}`,
        title: `Decide on ${overview.shortlisted} shortlisted candidate${overview.shortlisted > 1 ? 's' : ''}`,
        subtitle,
        due: 'This week',
        urgent: false,
        href: `/studio/casting/${casting.id}`,
        posterUrl: poster,
        tone: 'gold',
      })
    }

    if (casting.status === 'draft') {
      attention.push({
        id: `draft-${casting.id}`,
        title: casting.roles.length === 0 ? 'Add a role and publish' : 'Publish this casting call',
        subtitle,
        due: 'Draft',
        urgent: false,
        href: `/studio/casting/${casting.id}`,
        posterUrl: poster,
        tone: 'grey',
      })
    }

    if (casting.status === 'published' && casting.deadline_at) {
      const days = daysUntil(casting.deadline_at)
      if (days >= 0 && days <= 5) {
        attention.push({
          id: `deadline-${casting.id}`,
          title: days === 0 ? 'Casting closes today' : `Casting closes in ${days} day${days > 1 ? 's' : ''}`,
          subtitle,
          due: days === 0 ? 'Today' : `${days}d`,
          urgent: days <= 1,
          href: `/studio/casting/${casting.id}`,
          posterUrl: poster,
          tone: 'red',
        })
      }
    }
  }

  const agenda: AgendaItem[] = []
  for (const overview of overviews) {
    const { casting } = overview
    if (casting.deadline_at && daysUntil(casting.deadline_at) >= 0) {
      agenda.push({
        id: `deadline-${casting.id}`,
        label: 'Submissions close',
        detail: casting.project?.title ?? casting.title,
        date: casting.deadline_at,
        href: `/studio/casting/${casting.id}`,
      })
    }
  }

  agenda.sort((a, b) => a.date.localeCompare(b.date))

  return {
    castings: overviews.sort((a, b) => b.newSubmissions - a.newSubmissions),
    tapesToReview: overviews.reduce((total, item) => total + item.tapesToReview, 0),
    callbacksWaiting: overviews.reduce((total, item) => total + item.callbacks, 0),
    newSubmissions: overviews.reduce((total, item) => total + item.newSubmissions, 0),
    attention: attention.sort((a, b) => Number(b.urgent) - Number(a.urgent)).slice(0, 6),
    agenda,
  }
}

// ── Talent search ────────────────────────────────────────────────────────────

export type TalentSearchFilters = {
  query?: string
  city?: string
  gender?: string | null
  playingAge?: number | null
  language?: string | null
  skill?: string | null
}

export type TalentSearchResult = {
  profileId: string
  name: string
  avatarUrl: string | null
  city: string | null
  country: string | null
  headline: string | null
  gender: string | null
  playingAgeMin: number | null
  playingAgeMax: number | null
  experienceLevel: string | null
  availability: string | null
  skills: string[]
  languages: string[]
}

/**
 * Talent search over the real profiles. Filtering happens in Postgres where it
 * can (city, gender, playing age) and on the joined arrays client-side for the
 * long tail (skills, languages) — enough for the POC's data volume, and honest
 * about what it matches.
 */
export async function searchTalents(filters: TalentSearchFilters): Promise<TalentSearchResult[]> {
  let query = supabase
    .from('talent_profiles')
    .select(`
      profile_id, headline, gender, playing_age_min, playing_age_max, experience_level, availability,
      profiles!talent_profiles_profile_id_fkey!inner (
        id, first_name, last_name, avatar_url, city, country, account_type
      ),
      talent_skills ( level, skills ( name ) ),
      talent_languages ( language, languages ( name ) )
    `)
    .limit(60)

  if (filters.gender) query = query.eq('gender', filters.gender)
  if (filters.playingAge) {
    query = query
      .lte('playing_age_min', filters.playingAge)
      .gte('playing_age_max', filters.playingAge)
  }

  const { data, error } = await query
  if (error) throw error

  type Joined = {
    profile_id: string
    headline: string | null
    gender: string | null
    playing_age_min: number | null
    playing_age_max: number | null
    experience_level: string | null
    availability: string | null
    profiles: {
      id: string
      first_name: string | null
      last_name: string | null
      avatar_url: string | null
      city: string | null
      country: string | null
      account_type: string | null
    } | null
    talent_skills: { level: number; skills: { name: string } | null }[] | null
    talent_languages: { language: string; languages: { name: string } | null }[] | null
  }

  const needle = filters.query?.trim().toLowerCase()
  const city = filters.city?.trim().toLowerCase()

  return ((data ?? []) as unknown as Joined[])
    .filter((row) => row.profiles && row.profiles.account_type === 'talent')
    .map((row) => ({
      profileId: row.profile_id,
      name:
        [row.profiles?.first_name, row.profiles?.last_name].filter(Boolean).join(' ') || 'Talent',
      avatarUrl: row.profiles?.avatar_url ?? null,
      city: row.profiles?.city ?? null,
      country: row.profiles?.country ?? null,
      headline: row.headline,
      gender: row.gender,
      playingAgeMin: row.playing_age_min,
      playingAgeMax: row.playing_age_max,
      experienceLevel: row.experience_level,
      availability: row.availability,
      skills: (row.talent_skills ?? [])
        .map((skill) => skill.skills?.name)
        .filter((name): name is string => Boolean(name)),
      languages: (row.talent_languages ?? [])
        .map((language) => language.languages?.name ?? language.language)
        .filter(Boolean),
    }))
    .filter((talent) => {
      if (city && !(talent.city ?? '').toLowerCase().includes(city)) return false
      if (filters.skill && !talent.skills.some((skill) => skill === filters.skill)) return false
      if (filters.language && !talent.languages.some((language) => language === filters.language)) {
        return false
      }
      if (!needle) return true
      return [talent.name, talent.headline, talent.city, ...talent.skills]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
}

export function useTalentSearch(filters: TalentSearchFilters) {
  return useQuery({
    queryKey: ['talent-search', filters],
    queryFn: () => searchTalents(filters),
  })
}

// ── Casting call dashboard ───────────────────────────────────────────────────

export type ActivityEntry = {
  id: string
  actorName: string
  actorAvatar: string | null
  verb: string
  target: string
  tag: string | null
  tone: 'good' | 'maybe' | 'no' | 'neutral' | 'link'
  at: string
}

type ActorProfile = { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }

function actorName(actor: ActorProfile | null | undefined): string {
  if (!actor) return 'Someone'
  return [actor.first_name, actor.last_name].filter(Boolean).join(' ') || 'Someone'
}

/**
 * The activity of a casting call: votes, notes and decisions, read from the
 * rows that recorded them. No activity table to keep in sync — and nothing
 * shows up here that did not happen.
 */
export async function listCastingActivity(candidates: CandidateViewRow[]): Promise<ActivityEntry[]> {
  if (candidates.length === 0) return []

  const applicationIds = candidates.map((candidate) => candidate.application_id)
  const nameOf = new Map(candidates.map((candidate) => [candidate.application_id, candidate.name]))

  const [reviewsRes, notesRes] = await Promise.all([
    supabase
      .from('candidate_reviews')
      .select('id, application_id, vote, created_at, profiles!candidate_reviews_reviewer_id_fkey(id, first_name, last_name, avatar_url)')
      .in('application_id', applicationIds)
      .order('created_at', { ascending: false })
      .limit(40),
    supabase
      .from('candidate_notes')
      .select('id, application_id, created_at, profiles!candidate_notes_author_id_fkey(id, first_name, last_name, avatar_url)')
      .in('application_id', applicationIds)
      .order('created_at', { ascending: false })
      .limit(40),
  ])
  if (reviewsRes.error) throw reviewsRes.error
  if (notesRes.error) throw notesRes.error

  type ReviewJoin = {
    id: string
    application_id: string
    vote: ReviewVote
    created_at: string
    profiles: ActorProfile | null
  }
  type NoteJoin = {
    id: string
    application_id: string
    created_at: string
    profiles: ActorProfile | null
  }

  const entries: ActivityEntry[] = []

  for (const review of (reviewsRes.data ?? []) as unknown as ReviewJoin[]) {
    entries.push({
      id: `review-${review.id}`,
      actorName: actorName(review.profiles),
      actorAvatar: review.profiles?.avatar_url ?? null,
      verb: 'rated',
      target: nameOf.get(review.application_id) ?? 'a candidate',
      tag: review.vote === 'good' ? 'Good match' : review.vote === 'maybe' ? 'Maybe' : 'No go',
      tone: review.vote === 'good' ? 'good' : review.vote === 'maybe' ? 'maybe' : 'no',
      at: review.created_at,
    })
  }

  for (const note of (notesRes.data ?? []) as unknown as NoteJoin[]) {
    entries.push({
      id: `note-${note.id}`,
      actorName: actorName(note.profiles),
      actorAvatar: note.profiles?.avatar_url ?? null,
      verb: 'left a note on',
      target: nameOf.get(note.application_id) ?? 'a candidate',
      tag: 'Note',
      tone: 'neutral',
      at: note.created_at,
    })
  }

  // Decisions and submissions come from the applications themselves.
  for (const candidate of candidates) {
    if (candidate.submitted_at) {
      entries.push({
        id: `submitted-${candidate.application_id}`,
        actorName: candidate.name,
        actorAvatar: candidate.avatar_url,
        verb: 'applied for',
        target: candidate.role_name,
        tag: candidate.has_self_tape ? 'Self-tape' : null,
        tone: 'link',
        at: candidate.submitted_at,
      })
    }
    if (['shortlisted', 'callback', 'offer', 'cast', 'not_selected'].includes(candidate.status)) {
      entries.push({
        id: `decision-${candidate.application_id}`,
        actorName: 'Your team',
        actorAvatar: null,
        verb: 'moved',
        target: candidate.name,
        tag: candidate.status.replace('_', ' '),
        tone: candidate.status === 'not_selected' ? 'no' : 'good',
        at: candidate.viewed_at ?? candidate.submitted_at ?? candidate.created_at,
      })
    }
  }

  return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25)
}

export function useCastingActivity(candidates: CandidateViewRow[] | undefined) {
  const key = (candidates ?? []).map((candidate) => candidate.application_id).sort().join(',')
  return useQuery({
    queryKey: ['casting-activity', key],
    queryFn: () => listCastingActivity(candidates ?? []),
    enabled: (candidates?.length ?? 0) > 0,
  })
}

export type SubmissionPoint = { day: string; label: string; submissions: number }

/** Submissions per day over the last 14 days — counted, not modelled. */
export function submissionsOverTime(candidates: CandidateViewRow[], days = 14): SubmissionPoint[] {
  const points: SubmissionPoint[] = []
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today)
    date.setDate(today.getDate() - offset)
    const key = date.toISOString().slice(0, 10)
    points.push({
      day: key,
      label: `D${days - offset}`,
      submissions: candidates.filter(
        (candidate) => (candidate.submitted_at ?? '').slice(0, 10) === key,
      ).length,
    })
  }

  return points
}

export type CastingHealth = {
  tone: 'good' | 'maybe' | 'no'
  title: string
  detail: string
}

/**
 * A readable health check, with an explicit rule rather than a vibe:
 *  · red    — the casting is a draft, or a published role has no candidate
 *  · amber  — tapes are waiting, or the deadline is within three days
 *  · green  — every role has candidates and nothing is overdue
 */
export function castingHealth(input: {
  status: CastingStatus
  roles: number
  rolesWithoutCandidates: number
  tapesToReview: number
  deadlineAt: string | null
}): CastingHealth {
  if (input.status === 'draft') {
    return {
      tone: 'no',
      title: 'Not published',
      detail: input.roles === 0 ? 'Add a role, then publish.' : 'Publish it so talents can apply.',
    }
  }

  if (input.roles > 0 && input.rolesWithoutCandidates > 0) {
    return {
      tone: 'no',
      title: 'Needs attention',
      detail: `${input.rolesWithoutCandidates} role${input.rolesWithoutCandidates > 1 ? 's' : ''} without a single candidate.`,
    }
  }

  if (input.tapesToReview > 0) {
    return {
      tone: 'maybe',
      title: 'Review pending',
      detail: `${input.tapesToReview} tape${input.tapesToReview > 1 ? 's' : ''} waiting on your team.`,
    }
  }

  if (input.deadlineAt) {
    const days = daysUntil(input.deadlineAt)
    if (days < 0) {
      return { tone: 'maybe', title: 'Deadline passed', detail: 'Close the casting or extend it.' }
    }
    if (days <= 3) {
      return {
        tone: 'maybe',
        title: 'Closing soon',
        detail: `Submissions close in ${days} day${days === 1 ? '' : 's'}.`,
      }
    }
  }

  return { tone: 'good', title: 'On track', detail: 'Every role has candidates. Keep going.' }
}

// ── Match scoring ────────────────────────────────────────────────────────────

export type MatchBreakdown = { label: string; earned: number; possible: number; met: boolean }

export type Match = { score: number; breakdown: MatchBreakdown[] }

/**
 * How well a talent fits a role — computed, explainable, and honest.
 *
 * There is no model behind this: each criterion the role actually states is
 * weighted, and the talent earns it or does not. A role with no criteria gives
 * every talent the same neutral score, which is the truth rather than a
 * flattering number.
 */
export function matchTalentToRole(
  talent: TalentSearchResult,
  role: {
    playing_age_min: number | null
    playing_age_max: number | null
    gender_pref: string | null
    languages: string[]
    skills: string[]
    location: string | null
  },
  languageName: (code: string) => string,
): Match {
  const breakdown: MatchBreakdown[] = []

  if (role.playing_age_min !== null && role.playing_age_max !== null) {
    const overlaps =
      talent.playingAgeMin !== null &&
      talent.playingAgeMax !== null &&
      talent.playingAgeMin <= role.playing_age_max &&
      talent.playingAgeMax >= role.playing_age_min
    breakdown.push({ label: 'Playing age', earned: overlaps ? 30 : 0, possible: 30, met: overlaps })
  }

  if (role.gender_pref) {
    const met = (talent.gender ?? '').toLowerCase() === role.gender_pref.toLowerCase()
    breakdown.push({ label: 'Gender', earned: met ? 15 : 0, possible: 15, met })
  }

  if (role.languages.length > 0) {
    const spoken = new Set(talent.languages.map((language) => language.toLowerCase()))
    const asked = role.languages.map((code) => languageName(code).toLowerCase())
    const hits = asked.filter((language) => spoken.has(language)).length
    const met = hits === asked.length
    breakdown.push({
      label: 'Languages',
      earned: Math.round((hits / asked.length) * 20),
      possible: 20,
      met,
    })
  }

  if (role.skills.length > 0) {
    const owned = new Set(talent.skills.map((skill) => skill.toLowerCase()))
    const hits = role.skills.filter((skill) => owned.has(skill.toLowerCase())).length
    breakdown.push({
      label: 'Skills',
      earned: Math.round((hits / role.skills.length) * 25),
      possible: 25,
      met: hits === role.skills.length,
    })
  }

  if (role.location) {
    const met = (talent.city ?? '').toLowerCase().includes(role.location.toLowerCase())
    breakdown.push({ label: 'Location', earned: met ? 10 : 0, possible: 10, met })
  }

  const possible = breakdown.reduce((total, item) => total + item.possible, 0)
  if (possible === 0) {
    return { score: 50, breakdown: [{ label: 'No criteria on this role', earned: 0, possible: 0, met: false }] }
  }

  const earned = breakdown.reduce((total, item) => total + item.earned, 0)
  return { score: Math.round((earned / possible) * 100), breakdown }
}

// ── Saved talents (the recruiter's own shortlist) ────────────────────────────

export function useSavedTalents(profileId: string | undefined) {
  return useQuery({
    queryKey: ['saved-talents', profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('saved_talents')
        .select('talent_id')
        .eq('production_id', profileId as string)
      if (error) throw error
      return (data ?? []).map((row) => row.talent_id)
    },
    enabled: Boolean(profileId),
  })
}

export function useSaveTalent(profileId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ talentId, saved }: { talentId: string; saved: boolean }) => {
      if (saved) {
        const { error } = await supabase
          .from('saved_talents')
          .delete()
          .eq('production_id', profileId as string)
          .eq('talent_id', talentId)
        if (error) throw error
        return
      }
      const { error } = await supabase
        .from('saved_talents')
        .insert({ production_id: profileId as string, talent_id: talentId })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['saved-talents', profileId] })
    },
  })
}

// ── Saved searches ───────────────────────────────────────────────────────────

export function useSavedSearches(profileId: string | undefined) {
  return useQuery({
    queryKey: ['saved-searches', profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('saved_searches')
        .select('*')
        .eq('owner_id', profileId as string)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: Boolean(profileId),
  })
}

export function useSavedSearchMutations(profileId: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['saved-searches', profileId] })
  }

  const save = useMutation({
    mutationFn: async ({ name, filters }: { name: string; filters: Record<string, unknown> }) => {
      const { error } = await supabase
        .from('saved_searches')
        .insert({ owner_id: profileId as string, name: name.trim(), filters })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('saved_searches').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { save, remove }
}
