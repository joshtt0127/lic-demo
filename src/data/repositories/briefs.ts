import { supabase } from '@/lib/supabase'
import type { BriefExtractionRow, BriefVideoRow, BriefVisibility } from '@/types/database'

/**
 * Video Casting Breakdown™ — accès aux briefs vidéo et à leurs extractions.
 *
 * Les règles (qui voit quoi, qui écrit) vivent en base
 * (migration 20261004121000). Ici, on lit et on écrit, rien de plus.
 */

/** Tous les briefs lisibles d'un projet : le brief projet et ceux des rôles. */
export async function listProjectBriefs(projectId: string): Promise<BriefVideoRow[]> {
  const { data, error } = await supabase
    .from('brief_videos')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export type BriefInput = {
  projectId: string
  roleId: string | null
  url: string
  mediaAssetId: string | null
  durationS: number | null
  visibility: BriefVisibility
}

/**
 * Pose (ou remplace) LA vidéo d'une cible. Une cible n'a qu'un brief : on met
 * à jour la ligne existante plutôt que d'empiler des versions.
 */
export async function saveBrief(input: BriefInput): Promise<BriefVideoRow> {
  let existing = supabase
    .from('brief_videos')
    .select('id')
    .eq('project_id', input.projectId)
  existing = input.roleId ? existing.eq('role_id', input.roleId) : existing.is('role_id', null)
  const { data: found, error: findError } = await existing.maybeSingle()
  if (findError) throw findError

  const payload = {
    url: input.url,
    media_asset_id: input.mediaAssetId,
    duration_s: input.durationS,
    visibility: input.visibility,
  }
  const query = found
    ? supabase.from('brief_videos').update(payload).eq('id', found.id)
    : supabase
        .from('brief_videos')
        .insert({ ...payload, project_id: input.projectId, role_id: input.roleId })
  const { data, error } = await query.select('*').single()
  if (error) throw error
  return data
}

export async function setBriefVisibility(id: string, visibility: BriefVisibility): Promise<void> {
  const { error } = await supabase.from('brief_videos').update({ visibility }).eq('id', id)
  if (error) throw error
}

export async function deleteBrief(id: string): Promise<void> {
  const { error } = await supabase.from('brief_videos').delete().eq('id', id)
  if (error) throw error
}

// ── Extraction ───────────────────────────────────────────────────────────────

/**
 * Crée la ligne en attente puis lance la fonction `extract-brief`, qui écrit
 * elle-même le résultat. On relit ensuite la ligne jusqu'à ce qu'elle soit
 * prête : la fonction peut rendre la main avant (délai réseau) ou échouer en
 * le notant sur la ligne.
 */
export async function extractBrief(input: {
  orgId: string
  target: 'project' | 'role'
  videoUrl: string
  briefVideoId?: string | null
}): Promise<BriefExtractionRow> {
  const { data: row, error } = await supabase
    .from('brief_extractions')
    .insert({
      org_id: input.orgId,
      target: input.target,
      video_url: input.videoUrl,
      brief_video_id: input.briefVideoId ?? null,
    })
    .select('*')
    .single()
  if (error) throw error

  const invoked = await supabase.functions.invoke('extract-brief', {
    body: { extractionId: row.id },
  })
  const result = await getExtraction(row.id)
  if (result?.status === 'ready' || result?.status === 'failed') return result
  if (invoked.error) throw new Error(invoked.error.message)

  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    const latest = await getExtraction(row.id)
    if (latest && latest.status !== 'pending') return latest
  }
  throw new Error('The brief is taking too long to analyse — try again in a moment')
}

export async function getExtraction(id: string): Promise<BriefExtractionRow | null> {
  const { data, error } = await supabase
    .from('brief_extractions')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Relie un brouillon d'extraction à la vidéo enregistrée ensuite. */
export async function linkExtraction(id: string, briefVideoId: string): Promise<void> {
  const { error } = await supabase
    .from('brief_extractions')
    .update({ brief_video_id: briefVideoId })
    .eq('id', id)
  if (error) throw error
}
