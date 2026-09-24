import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { inviteTalentToCasting } from '@/data/repositories/castings'
import { supabase } from '@/lib/supabase'
import type { CastingCallRow, OrganizationRow, ProjectRow, RoleRow } from '@/types/database'

/**
 * Casting calls, talent side.
 *
 * RLS already limits reads to published + public casting calls (plus your own
 * organization's), so these queries carry no visibility logic of their own.
 */

/** The production behind a casting call — the "author" of a feed post. */
export type CastingAuthor = Pick<
  OrganizationRow,
  'id' | 'name' | 'logo_url' | 'company_type' | 'city' | 'country'
>

export type CastingCallWithContext = CastingCallRow & {
  project:
    | (Pick<
        ProjectRow,
        'id' | 'title' | 'production_type' | 'genre' | 'company_name' | 'poster_url' | 'synopsis' | 'director_name' | 'shooting_location' | 'shooting_start' | 'shooting_end' | 'director_brief'
      > & { organization: CastingAuthor | null })
    | null
  roles: RoleRow[]
}

const CASTING_SELECT = `
  *,
  projects (
    id, title, production_type, genre, company_name, poster_url, synopsis,
    director_name, shooting_location, shooting_start, shooting_end, director_brief,
    organizations ( id, name, logo_url, company_type, city, country )
  ),
  roles (*)
`

type ProjectJoin = NonNullable<CastingCallWithContext['project']> & {
  organizations: CastingAuthor | null
}

type CastingJoin = CastingCallRow & {
  projects: ProjectJoin | null
  roles: RoleRow[] | null
}

function shape(row: CastingJoin): CastingCallWithContext {
  const { projects, roles, ...casting } = row
  const project = projects
    ? { ...projects, organization: projects.organizations ?? null }
    : null
  return {
    ...casting,
    project,
    roles: [...(roles ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }
}

/** Combien d'annonces par page. Assez pour remplir un écran, pas la base. */
export const CASTINGS_PAGE_SIZE = 20

/**
 * Les annonces ouvertes, par page.
 *
 * Le curseur est la **date de publication**, pas un décalage : avec un `offset`,
 * une annonce publiée pendant qu'on lit décale toute la suite et fait réapparaître
 * ou disparaître des lignes entre deux pages. Un curseur de date ne bouge pas.
 *
 * Et seules les annonces `public` sont listées : `private_link` existe, mais par
 * définition elle ne se trouve pas en parcourant le catalogue.
 */
export async function listOpenCastings(options?: {
  before?: string | null
  limit?: number
}): Promise<CastingCallWithContext[]> {
  const limit = options?.limit ?? CASTINGS_PAGE_SIZE
  let query = supabase
    .from('casting_calls')
    .select(CASTING_SELECT)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .order('published_at', { ascending: false })
    .limit(limit)

  if (options?.before) query = query.lt('published_at', options.before)

  const { data, error } = await query
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

/**
 * Les annonces ouvertes, avec de quoi en demander plus.
 *
 * On renvoie une liste à plat plutôt que les pages brutes : les écrans trient,
 * filtrent et mélangent ces annonces avec d'autres objets, et n'ont rien à
 * faire de la découpe. Ils reçoivent en plus `hasMore` et `loadMore`.
 */
export function useOpenCastings() {
  const query = useInfiniteQuery({
    queryKey: ['open-castings'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => listOpenCastings({ before: pageParam }),
    getNextPageParam: (lastPage) =>
      // Une page incomplète est la dernière : inutile d'aller frapper pour rien.
      lastPage.length < CASTINGS_PAGE_SIZE
        ? undefined
        : (lastPage[lastPage.length - 1]?.published_at ?? undefined),
  })

  return {
    ...query,
    data: query.data?.pages.flat() ?? undefined,
    hasMore: query.hasNextPage,
    loadMore: query.fetchNextPage,
    loadingMore: query.isFetchingNextPage,
  }
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

/** Inviter un comédien sur un casting de son organisation. */
export function useInviteTalent(profileId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { castingId: string; talentId: string; message?: string }) =>
      inviteTalentToCasting({ ...input, invitedBy: profileId as string }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['casting-invites'] })
    },
  })
}
