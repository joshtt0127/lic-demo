import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AdminActionRow, ProfileRow, ReportRow } from '@/types/database'

/**
 * Ce que l'administration LIC lit et fait.
 *
 * Tout passe par les policies et les fonctions posées en 7.1 : ce module ne
 * décide de rien, il demande. Si le rôle de plateforme manque, la base renvoie
 * vide ou refuse — l'écran n'a pas de pouvoir que la base ne lui donne pas.
 */

export type ReportWithSubject = ReportRow & {
  reporter: Pick<ProfileRow, 'id' | 'first_name' | 'last_name'> | null
}

export function useReportQueue(status: 'open' | 'in_review' | 'resolved' | 'dismissed') {
  return useQuery({
    queryKey: ['admin-reports', status],
    queryFn: async (): Promise<ReportWithSubject[]> => {
      const { data, error } = await supabase
        .from('reports')
        .select('*, reporter:profiles!reports_reporter_id_fkey(id, first_name, last_name)')
        .eq('status', status)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as unknown as ReportWithSubject[]
    },
  })
}

export type AdminSearchResult = {
  people: Pick<
    ProfileRow,
    'id' | 'first_name' | 'last_name' | 'account_type' | 'city' | 'suspended_at'
  >[]
  organizations: { id: string; name: string; verification_status: string }[]
  castings: { id: string; title: string; status: string }[]
}

/** Une recherche, trois familles d'objets — ce que demande un ticket de support. */
export function useAdminSearch(term: string) {
  const query = term.trim()
  return useQuery({
    queryKey: ['admin-search', query],
    enabled: query.length >= 2,
    queryFn: async (): Promise<AdminSearchResult> => {
      const like = `%${query}%`
      const [people, organizations, castings] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, first_name, last_name, account_type, city, suspended_at')
          .or(`first_name.ilike.${like},last_name.ilike.${like}`)
          .limit(10),
        supabase
          .from('organizations')
          .select('id, name, verification_status')
          .ilike('name', like)
          .limit(10),
        supabase.from('casting_calls').select('id, title, status').ilike('title', like).limit(10),
      ])
      if (people.error) throw people.error
      if (organizations.error) throw organizations.error
      if (castings.error) throw castings.error
      return {
        people: people.data ?? [],
        organizations: organizations.data ?? [],
        castings: castings.data ?? [],
      }
    },
  })
}

export function useAdminTrail() {
  return useQuery({
    queryKey: ['admin-trail'],
    queryFn: async (): Promise<AdminActionRow[]> => {
      const { data, error } = await supabase
        .from('admin_actions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data ?? []
    },
  })
}

export function useAdminActions() {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-reports'] })
    void queryClient.invalidateQueries({ queryKey: ['admin-trail'] })
    void queryClient.invalidateQueries({ queryKey: ['admin-search'] })
  }

  const setReportStatus = useMutation({
    mutationFn: async (input: {
      id: string
      status: 'in_review' | 'resolved' | 'dismissed'
      resolution?: string
    }) => {
      const { error } = await supabase.rpc('admin_set_report_status', {
        p_report: input.id,
        p_status: input.status,
        p_resolution: input.resolution ?? null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const setOrganizationStatus = useMutation({
    mutationFn: async (input: {
      orgId: string
      status: 'unverified' | 'verified' | 'suspended'
      reason: string
    }) => {
      const { error } = await supabase.rpc('admin_set_organization_status', {
        p_org: input.orgId,
        p_status: input.status,
        p_reason: input.reason,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const setUserSuspended = useMutation({
    mutationFn: async (input: { profileId: string; suspended: boolean; reason: string }) => {
      const { error } = await supabase.rpc('admin_set_user_suspended', {
        p_profile: input.profileId,
        p_suspended: input.suspended,
        p_reason: input.reason,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { setReportStatus, setOrganizationStatus, setUserSuspended }
}
