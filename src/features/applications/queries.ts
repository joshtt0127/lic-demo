import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  ApplicationRow,
  ApplicationStatus,
  CastingCallRow,
  ProjectRow,
  RoleRow,
} from '@/types/database'

/**
 * Application-side reads shared by both experiences. The full application flow
 * lands in `feat/applications`; these counters are already backed by the real
 * `applications` table, so they read 0 until the first submission — never a
 * decorative number.
 */

export type TalentApplicationStats = {
  total: number
  submitted: number
  shortlisted: number
  booked: number
}

const SUBMITTED: ApplicationStatus[] = [
  'submitted',
  'viewed',
  'under_review',
  'shortlisted',
  'callback',
  'offer',
  'cast',
  'not_selected',
]

const SHORTLISTED: ApplicationStatus[] = ['shortlisted', 'callback', 'offer', 'cast']

export async function getTalentApplicationStats(talentId: string): Promise<TalentApplicationStats> {
  const { data, error } = await supabase
    .from('applications')
    .select('status')
    .eq('talent_id', talentId)

  if (error) throw error

  const rows = data ?? []
  return {
    total: rows.length,
    submitted: rows.filter((row) => SUBMITTED.includes(row.status)).length,
    shortlisted: rows.filter((row) => SHORTLISTED.includes(row.status)).length,
    booked: rows.filter((row) => row.status === 'cast').length,
  }
}

export function useTalentApplicationStats(talentId: string | undefined) {
  return useQuery({
    queryKey: ['talent-application-stats', talentId],
    queryFn: () => getTalentApplicationStats(talentId as string),
    enabled: Boolean(talentId),
  })
}

// ── Talent: my applications ──────────────────────────────────────────────────

export type MyApplication = ApplicationRow & {
  role: Pick<
    RoleRow,
    'id' | 'name' | 'role_type' | 'status' | 'selftape_instructions' | 'casting_call_id'
  > | null
  casting: Pick<CastingCallRow, 'id' | 'title' | 'deadline_at' | 'location' | 'status'> | null
  project: Pick<ProjectRow, 'id' | 'title' | 'poster_url' | 'production_type'> | null
  hasSelfTape: boolean
}

export async function listMyApplications(talentId: string): Promise<MyApplication[]> {
  const { data, error } = await supabase
    .from('applications')
    .select(`
      *,
      roles (
        id, name, role_type, status, selftape_instructions, casting_call_id,
        casting_calls (
          id, title, deadline_at, location, status,
          projects ( id, title, poster_url, production_type )
        )
      ),
      self_tapes ( id )
    `)
    .eq('talent_id', talentId)
    .order('created_at', { ascending: false })

  if (error) throw error

  type Joined = ApplicationRow & {
    roles:
      | (MyApplication['role'] & {
          casting_calls: (MyApplication['casting'] & { projects: MyApplication['project'] }) | null
        })
      | null
    self_tapes: { id: string }[] | null
  }

  return ((data ?? []) as unknown as Joined[]).map(({ roles, self_tapes, ...application }) => {
    const casting = roles?.casting_calls ?? null
    return {
      ...application,
      role: roles
        ? {
            id: roles.id,
            name: roles.name,
            role_type: roles.role_type,
            status: roles.status,
            selftape_instructions: roles.selftape_instructions,
            casting_call_id: roles.casting_call_id,
          }
        : null,
      casting: casting
        ? {
            id: casting.id,
            title: casting.title,
            deadline_at: casting.deadline_at,
            location: casting.location,
            status: casting.status,
          }
        : null,
      project: casting?.projects ?? null,
      hasSelfTape: (self_tapes ?? []).length > 0,
    }
  })
}

export function useMyApplications(talentId: string | undefined) {
  return useQuery({
    queryKey: ['my-applications', talentId],
    queryFn: () => listMyApplications(talentId as string),
    enabled: Boolean(talentId),
  })
}

export type ApplyInput = {
  roleId: string
  note?: string | null
  headshotId?: string | null
  showreelId?: string | null
}

/** Applying is one row in `applications` — the same row production will review. */
export async function applyToRole(talentId: string, input: ApplyInput): Promise<ApplicationRow> {
  const { data, error } = await supabase
    .from('applications')
    .insert({
      role_id: input.roleId,
      talent_id: talentId,
      status: 'submitted',
      note: input.note?.trim() || null,
      headshot_id: input.headshotId ?? null,
      showreel_id: input.showreelId ?? null,
      submitted_at: new Date().toISOString(),
      source: 'talent_apply',
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export function useApplicationMutations(talentId: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['my-applications', talentId] })
    void queryClient.invalidateQueries({ queryKey: ['talent-application-stats', talentId] })
    void queryClient.invalidateQueries({ queryKey: ['open-castings'] })
  }

  const apply = useMutation({
    mutationFn: (input: ApplyInput) => applyToRole(talentId as string, input),
    onSuccess: invalidate,
  })

  const withdraw = useMutation({
    mutationFn: async (applicationId: string) => {
      const { error } = await supabase
        .from('applications')
        .update({ status: 'withdrawn' })
        .eq('id', applicationId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { apply, withdraw }
}
