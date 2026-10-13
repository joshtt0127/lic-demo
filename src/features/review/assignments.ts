import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * À qui une audition est confiée. Une personne à la fois ; toute l'équipe la
 * voit quand même. La base vérifie qu'on n'attribue qu'à un membre qui peut
 * reviewer, et qu'un simple membre ne peut s'attribuer que les siennes.
 */

export function useAssignments(applicationIds: string[]) {
  const key = [...applicationIds].sort().join(',')
  return useQuery({
    queryKey: ['application-assignments', key],
    queryFn: async (): Promise<Record<string, string>> => {
      if (applicationIds.length === 0) return {}
      const { data, error } = await supabase
        .from('application_assignments')
        .select('application_id, assignee_id')
        .in('application_id', applicationIds)
      if (error) throw error
      return Object.fromEntries((data ?? []).map((row) => [row.application_id, row.assignee_id]))
    },
    enabled: applicationIds.length > 0,
  })
}

export function useAssign(profileId: string | undefined) {
  const client = useQueryClient()
  return useMutation({
    /** `assigneeId: null` rend les auditions (plus personne n'en a la charge). */
    mutationFn: async ({ applicationIds, assigneeId }: { applicationIds: string[]; assigneeId: string | null }) => {
      if (applicationIds.length === 0) return
      if (assigneeId === null) {
        const { error } = await supabase.from('application_assignments').delete().in('application_id', applicationIds)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('application_assignments').upsert(
        applicationIds.map((applicationId) => ({
          application_id: applicationId,
          assignee_id: assigneeId,
          assigned_by: profileId as string,
          assigned_at: new Date().toISOString(),
        })),
        { onConflict: 'application_id' },
      )
      if (error) throw error
    },
    onSettled: () => void client.invalidateQueries({ queryKey: ['application-assignments'] }),
  })
}
