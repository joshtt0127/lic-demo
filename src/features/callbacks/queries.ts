import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { CallbackRow, CallbackKind, CallbackResponse } from '@/types/database'

/**
 * Les callbacks d'une candidature.
 *
 * Un callback est un rendez-vous, pas un statut : il a une forme (sur place, en
 * visio, ou une nouvelle tape), ce qu'il faut pour l'honorer, et une réponse.
 * Les deux côtés lisent la même ligne — la production propose, le comédien
 * répond, et la base empêche chacun de faire le travail de l'autre.
 */

export type CallbackInput = {
  applicationId: string
  kind: CallbackKind
  title?: string
  scheduledAt?: string | null
  location?: string | null
  meetingUrl?: string | null
  instructions?: string | null
  message?: string | null
  respondBy?: string | null
}

export function useCallbacks(applicationId: string | undefined) {
  return useQuery({
    queryKey: ['callbacks', applicationId],
    queryFn: async (): Promise<CallbackRow[]> => {
      const { data, error } = await supabase
        .from('callbacks')
        .select('*')
        .eq('application_id', applicationId as string)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: Boolean(applicationId),
  })
}

export function useCallbackMutations(applicationId: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['callbacks', applicationId] })
    void queryClient.invalidateQueries({ queryKey: ['my-applications'] })
  }

  const request = useMutation({
    mutationFn: async (input: CallbackInput) => {
      const { error } = await supabase.from('callbacks').insert({
        application_id: input.applicationId,
        kind: input.kind,
        title: input.title?.trim() || null,
        scheduled_at: input.scheduledAt || null,
        // Le fuseau du navigateur : « mardi 14 h » n'a aucun sens sans lui.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        location: input.location?.trim() || null,
        meeting_url: input.meetingUrl?.trim() || null,
        instructions: input.instructions?.trim() || null,
        message: input.message?.trim() || null,
        respond_by: input.respondBy || null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const answer = useMutation({
    mutationFn: async (input: { id: string; response: CallbackResponse; note?: string }) => {
      const { error } = await supabase
        .from('callbacks')
        .update({ response: input.response, response_note: input.note?.trim() || null })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { request, answer }
}
