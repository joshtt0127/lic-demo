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
      profile_id, headline, gender, playing_age_min, playing_age_max, experience_level,
      profiles!inner ( id, first_name, last_name, avatar_url, city, country, account_type ),
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
