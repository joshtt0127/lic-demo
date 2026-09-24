import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ReportReason } from '@/types/database'

/**
 * Signaler, et bloquer.
 *
 * Deux gestes très différents qu'il ne faut pas confondre :
 *   · **signaler** s'adresse à LIC — ça ouvre un dossier, ça ne supprime rien.
 *     Laisser n'importe qui faire disparaître le contenu d'un autre serait un
 *     outil d'abus de plus ;
 *   · **bloquer** est personnel et immédiat — ça coupe ce qui vient ensuite,
 *     sans toucher à l'historique professionnel des deux personnes.
 */

export function useModeration(profileId: string | undefined) {
  const queryClient = useQueryClient()

  const report = useMutation({
    mutationFn: async (input: {
      subjectType: 'profile' | 'post' | 'casting_call' | 'message'
      subjectId: string
      reason: ReportReason
      details?: string
    }) => {
      const { error } = await supabase.from('reports').insert({
        reporter_id: profileId as string,
        subject_type: input.subjectType,
        subject_id: input.subjectId,
        reason: input.reason,
        details: input.details?.trim() || null,
      })
      // Signaler deux fois la même chose n'est pas une erreur pour la personne :
      // son signalement est déjà là, elle n'a rien à refaire.
      if (error && error.code !== '23505') throw error
    },
  })

  const block = useMutation({
    mutationFn: async (blockedId: string) => {
      const { error } = await supabase
        .from('blocks')
        .insert({ blocker_id: profileId as string, blocked_id: blockedId })
      if (error && error.code !== '23505') throw error
    },
    onSuccess: () => {
      // Le fil, les abonnements et les conversations changent d'un coup.
      void queryClient.invalidateQueries()
    },
  })

  return { report, block }
}
