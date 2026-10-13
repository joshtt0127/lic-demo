import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { SIGNED_URL_TTL_SECONDS } from '@/lib/storage'
import { setApplicationStatus } from '@/data/repositories/candidates'
import type { ApplicationStatus, MediaAssetRow, ReviewVote } from '@/types/database'

/**
 * Données propres à l'Audition Review Queue™ : ce que la file ajoute aux
 * candidatures déjà lues par le dashboard (v_candidates + intelligence feed).
 */

export type QueueTape = { url: string; durationSeconds: number | null }

/**
 * La dernière self-tape de chaque candidature, signée en UN appel : une file de
 * plusieurs dizaines de cartes ne fait pas plusieurs dizaines de signatures.
 */
async function listLatestTapes(applicationIds: string[]): Promise<Record<string, QueueTape>> {
  if (applicationIds.length === 0) return {}
  const { data, error } = await supabase
    .from('self_tapes')
    .select('application_id, duration_s, submitted_at, media_assets ( bucket, path )')
    .in('application_id', applicationIds)
    .order('submitted_at', { ascending: false })
  if (error) throw error
  type Row = { application_id: string; duration_s: number | null; media_assets: Pick<MediaAssetRow, 'bucket' | 'path'> | null }
  const latest = new Map<string, Row>()
  for (const row of (data ?? []) as unknown as Row[]) {
    if (row.media_assets && !latest.has(row.application_id)) latest.set(row.application_id, row)
  }
  const byBucket = new Map<string, Row[]>()
  for (const row of latest.values()) {
    const bucket = row.media_assets!.bucket
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), row])
  }
  const out: Record<string, QueueTape> = {}
  for (const [bucket, rows] of byBucket) {
    const { data: signed, error: signError } = await supabase.storage
      .from(bucket)
      .createSignedUrls(rows.map((row) => row.media_assets!.path), SIGNED_URL_TTL_SECONDS)
    if (signError) throw signError
    signed.forEach((item, index) => {
      if (item.signedUrl) out[rows[index].application_id] = { url: item.signedUrl, durationSeconds: rows[index].duration_s }
    })
  }
  return out
}

export function useQueueTapes(applicationIds: string[]) {
  const key = [...applicationIds].sort().join(',')
  return useQuery({
    queryKey: ['queue-tapes', key],
    queryFn: () => listLatestTapes(applicationIds),
    enabled: applicationIds.length > 0,
    // Les URL signées vivent 30 minutes : on les renouvelle avant.
    staleTime: 20 * 60_000,
  })
}

/**
 * Ce que CETTE personne a déjà ouvert. « Vu » est personnel : qu'un
 * coéquipier ait regardé une tape ne veut pas dire que je l'ai vue.
 */
async function listMySeen(profileId: string, applicationIds: string[]): Promise<string[]> {
  if (applicationIds.length === 0) return []
  const { data, error } = await supabase
    .from('events')
    .select('entity_id')
    .eq('actor_id', profileId)
    .eq('entity_type', 'application')
    .in('type', ['AUDITION_OPENED', 'AUDITION_COMPLETED', 'AUDITION_REWATCHED'])
    .in('entity_id', applicationIds)
  if (error) throw error
  return [...new Set((data ?? []).map((row) => row.entity_id as string))]
}

export function useMySeen(profileId: string | undefined, applicationIds: string[]) {
  const key = [...applicationIds].sort().join(',')
  return useQuery({
    queryKey: ['queue-seen', profileId, key],
    queryFn: () => listMySeen(profileId as string, applicationIds),
    enabled: Boolean(profileId) && applicationIds.length > 0,
  })
}

/** Mon vote sur chaque candidature : les autres votes restent ceux des autres. */
async function listMyVotes(profileId: string, applicationIds: string[]): Promise<Record<string, ReviewVote>> {
  if (applicationIds.length === 0) return {}
  const { data, error } = await supabase
    .from('candidate_reviews')
    .select('application_id, vote')
    .eq('reviewer_id', profileId)
    .in('application_id', applicationIds)
  if (error) throw error
  return Object.fromEntries((data ?? []).map((row) => [row.application_id, row.vote as ReviewVote]))
}

export function useMyVotes(profileId: string | undefined, applicationIds: string[]) {
  const key = [...applicationIds].sort().join(',')
  return useQuery({
    queryKey: ['queue-votes', profileId, key],
    queryFn: () => listMyVotes(profileId as string, applicationIds),
    enabled: Boolean(profileId) && applicationIds.length > 0,
  })
}

/**
 * Décision groupée. Chaque candidature passe par la même écriture que la
 * décision individuelle (et donc par le même garde-fou en base) ; celles qui
 * échouent sont rendues, pas avalées.
 */
export function useBatchStatus() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: ApplicationStatus }) => {
      const results = await Promise.allSettled(ids.map((id) => setApplicationStatus(id, status)))
      const failed = ids.filter((_, index) => results[index].status === 'rejected')
      return { done: ids.length - failed.length, failed }
    },
    onSettled: () => {
      for (const key of ['candidates-roles', 'candidates-project', 'intelligence-feed', 'studio-casting']) {
        void client.invalidateQueries({ queryKey: [key] })
      }
    },
  })
}
