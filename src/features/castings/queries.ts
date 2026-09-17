import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { CastingCallRow, ProjectRow, RoleRow } from '@/types/database'

/**
 * Casting calls, talent side.
 *
 * RLS already limits reads to published + public casting calls (plus your own
 * organization's), so these queries carry no visibility logic of their own.
 */

export type CastingCallWithContext = CastingCallRow & {
  project: Pick<
    ProjectRow,
    'id' | 'title' | 'production_type' | 'genre' | 'company_name' | 'poster_url' | 'synopsis' | 'director_name' | 'shooting_location' | 'shooting_start' | 'shooting_end' | 'director_brief'
  > | null
  roles: RoleRow[]
}

const CASTING_SELECT = `
  *,
  projects (
    id, title, production_type, genre, company_name, poster_url, synopsis,
    director_name, shooting_location, shooting_start, shooting_end, director_brief
  ),
  roles (*)
`

type CastingJoin = CastingCallRow & {
  projects: CastingCallWithContext['project']
  roles: RoleRow[] | null
}

function shape(row: CastingJoin): CastingCallWithContext {
  const { projects, roles, ...casting } = row
  return {
    ...casting,
    project: projects,
    roles: [...(roles ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }
}

export async function listOpenCastings(): Promise<CastingCallWithContext[]> {
  const { data, error } = await supabase
    .from('casting_calls')
    .select(CASTING_SELECT)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as CastingJoin[]).map(shape)
}

export async function getCasting(id: string): Promise<CastingCallWithContext | null> {
  const { data, error } = await supabase
    .from('casting_calls')
    .select(CASTING_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? shape(data as unknown as CastingJoin) : null
}

/** Casting calls attached to a project (used when arriving from a project link). */
export async function listCastingsForProject(projectId: string): Promise<CastingCallWithContext[]> {
  const { data, error } = await supabase
    .from('casting_calls')
    .select(CASTING_SELECT)
    .eq('project_id', projectId)
    .order('published_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as CastingJoin[]).map(shape)
}

export async function listSavedCastingIds(talentId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('saved_castings')
    .select('casting_call_id')
    .eq('talent_id', talentId)
  if (error) throw error
  return (data ?? []).map((row) => row.casting_call_id)
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useOpenCastings() {
  return useQuery({ queryKey: ['open-castings'], queryFn: listOpenCastings })
}

export function useCasting(id: string | undefined) {
  return useQuery({
    queryKey: ['casting', id],
    queryFn: () => getCasting(id as string),
    enabled: Boolean(id),
  })
}

export function useProjectCastings(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-castings', projectId],
    queryFn: () => listCastingsForProject(projectId as string),
    enabled: Boolean(projectId),
  })
}

export function useSavedCastings(talentId: string | undefined) {
  return useQuery({
    queryKey: ['saved-castings', talentId],
    queryFn: () => listSavedCastingIds(talentId as string),
    enabled: Boolean(talentId),
  })
}

export function useSaveCasting(talentId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ castingId, saved }: { castingId: string; saved: boolean }) => {
      if (saved) {
        const { error } = await supabase
          .from('saved_castings')
          .delete()
          .eq('talent_id', talentId as string)
          .eq('casting_call_id', castingId)
        if (error) throw error
        return
      }
      const { error } = await supabase
        .from('saved_castings')
        .insert({ talent_id: talentId as string, casting_call_id: castingId })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['saved-castings', talentId] })
    },
  })
}
