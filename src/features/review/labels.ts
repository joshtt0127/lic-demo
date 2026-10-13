import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ReviewLabelRow, ReviewLabelTone } from '@/types/database'

/**
 * Evaluate & Label — les étiquettes d'équipe d'une audition.
 *
 * Une étiquette n'est pas un vote : elle nomme ce qu'on a vu (« Strong on
 * camera », « Accent to check »), pour retrouver et trier plus tard. Elles
 * appartiennent à l'organisation ; la base refuse qu'un viewer en pose, et le
 * comédien n'en voit aucune.
 */

/** Proposées tant que l'équipe n'a créé aucune étiquette. */
export const STARTER_LABELS: { name: string; tone: ReviewLabelTone }[] = [
  { name: 'Strong on camera', tone: 'good' },
  { name: 'Natural', tone: 'good' },
  { name: 'Callback material', tone: 'gold' },
  { name: 'Accent to check', tone: 'maybe' },
  { name: 'Availability to check', tone: 'maybe' },
  { name: 'Not for this role', tone: 'no' },
]

export const LABEL_TONE: Record<ReviewLabelTone, string> = {
  neutral: 'bg-line text-ink',
  good: 'bg-signal-good-bg text-signal-good',
  maybe: 'bg-cream text-ink',
  no: 'bg-signal-no/10 text-signal-no',
  gold: 'bg-gold/25 text-ink',
  link: 'bg-link/10 text-link',
}

const labelsKey = (orgId: string | undefined) => ['review-labels', orgId]

export function useOrgLabels(orgId: string | undefined) {
  return useQuery({
    queryKey: labelsKey(orgId),
    queryFn: async (): Promise<ReviewLabelRow[]> => {
      const { data, error } = await supabase
        .from('review_labels')
        .select('*')
        .eq('org_id', orgId as string)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: Boolean(orgId),
  })
}

/** Étiquettes posées, par candidature. */
export function useApplicationLabels(applicationIds: string[]) {
  const key = [...applicationIds].sort().join(',')
  return useQuery({
    queryKey: ['application-labels', key],
    queryFn: async (): Promise<Record<string, string[]>> => {
      if (applicationIds.length === 0) return {}
      const { data, error } = await supabase
        .from('application_labels')
        .select('application_id, label_id')
        .in('application_id', applicationIds)
      if (error) throw error
      const out: Record<string, string[]> = {}
      for (const row of data ?? []) (out[row.application_id] ??= []).push(row.label_id)
      return out
    },
    enabled: applicationIds.length > 0,
  })
}

export function useLabelMutations(orgId: string | undefined, profileId: string | undefined) {
  const client = useQueryClient()
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['application-labels'] })
    void client.invalidateQueries({ queryKey: labelsKey(orgId) })
  }

  const create = useMutation({
    mutationFn: async ({ name, tone = 'neutral' }: { name: string; tone?: ReviewLabelTone }) => {
      const clean = name.trim().replace(/\s+/g, ' ').slice(0, 40)
      if (!clean) throw new Error('A label needs a name')
      // Le nom existe déjà (même casse ou non) : on réutilise l'étiquette.
      const { data: existing } = await supabase
        .from('review_labels')
        .select('*')
        .eq('org_id', orgId as string)
        .ilike('name', clean.replace(/[\\%_]/g, (char) => `\\${char}`))
        .maybeSingle()
      if (existing) return existing as ReviewLabelRow
      const { data, error } = await supabase
        .from('review_labels')
        .insert({ org_id: orgId as string, name: clean, tone, created_by: profileId as string })
        .select('*')
        .single()
      if (error) throw error
      return data as ReviewLabelRow
    },
    onSuccess: refresh,
  })

  /** Pose ou retire une étiquette sur une ou plusieurs auditions. */
  const set = useMutation({
    mutationFn: async ({ applicationIds, labelId, on }: { applicationIds: string[]; labelId: string; on: boolean }) => {
      if (applicationIds.length === 0) return
      if (on) {
        const { error } = await supabase.from('application_labels').upsert(
          applicationIds.map((applicationId) => ({
            application_id: applicationId,
            label_id: labelId,
            added_by: profileId as string,
          })),
          { onConflict: 'application_id,label_id', ignoreDuplicates: true },
        )
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('application_labels')
          .delete()
          .eq('label_id', labelId)
          .in('application_id', applicationIds)
        if (error) throw error
      }
    },
    onSuccess: refresh,
  })

  const remove = useMutation({
    mutationFn: async (labelId: string) => {
      const { error } = await supabase.from('review_labels').delete().eq('id', labelId)
      if (error) throw error
    },
    onSuccess: refresh,
  })

  return { create, set, remove }
}
