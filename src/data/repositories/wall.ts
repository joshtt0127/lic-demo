import { supabase } from '@/lib/supabase'
import { SIGNED_URL_TTL_SECONDS } from '@/lib/storage'
import type {
  CandidateViewRow,
  MediaAssetRow,
  OrganizationRow,
  ProfileRow,
  ProjectRow,
  TapeStillRow,
  WallRoleViewRow,
  WallSelectionHistoryRow,
} from '@/types/database'

/**
 * The Wall™ — accès aux données.
 *
 * Le mur ne stocke que deux choses : la sélection active de chaque rôle
 * (`wall_selections`, écrite uniquement par `set_wall_selection()`) et l'ordre
 * choisi par l'équipe (`projects.wall_order`). Tout le reste — compteurs,
 * noms, tapes — est lu depuis les tables du casting, donc jamais en retard.
 */

export const STILLS_BUCKET = 'tape-stills'

export type WallProject = Pick<
  ProjectRow,
  | 'id'
  | 'org_id'
  | 'title'
  | 'subtitle'
  | 'synopsis'
  | 'poster_url'
  | 'genre'
  | 'production_type'
  | 'company_name'
  | 'director_name'
  | 'casting_director_name'
  | 'status'
  | 'wall_order'
> & { organization: Pick<OrganizationRow, 'id' | 'name' | 'logo_url'> | null }

export async function getWallProject(projectId: string): Promise<WallProject | null> {
  const { data, error } = await supabase
    .from('projects')
    .select(
      'id, org_id, title, subtitle, synopsis, poster_url, genre, production_type, company_name, director_name, casting_director_name, status, wall_order, organizations ( id, name, logo_url )',
    )
    .eq('id', projectId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const { organizations, ...project } = data as unknown as Omit<WallProject, 'organization'> & {
    organizations: WallProject['organization']
  }
  return { ...project, organization: organizations }
}

export async function listWallRoles(projectId: string): Promise<WallRoleViewRow[]> {
  const { data, error } = await supabase.from('v_wall_roles').select('*').eq('project_id', projectId)
  if (error) throw error
  return data ?? []
}

/** Poser un comédien sur la carte d'un rôle, ou la vider (`null`). */
export async function setWallSelection(roleId: string, applicationId: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_wall_selection', {
    p_role: roleId,
    p_application: applicationId,
  })
  if (error) throw error
}

/** L'ordre choisi par l'équipe ; `null` rend l'ordre d'importance. */
export async function setWallOrder(projectId: string, order: string[] | null): Promise<void> {
  const { error } = await supabase.rpc('set_wall_order', { p_project: projectId, p_order: order })
  if (error) throw error
}

export type WallHistoryEntry = WallSelectionHistoryRow & {
  changer: Pick<ProfileRow, 'id' | 'first_name' | 'last_name' | 'avatar_url'> | null
}

export async function listSelectionHistory(roleId: string): Promise<WallHistoryEntry[]> {
  const { data, error } = await supabase
    .from('wall_selection_history')
    .select('*, profiles!wall_selection_history_changed_by_fkey ( id, first_name, last_name, avatar_url )')
    .eq('role_id', roleId)
    .order('changed_at', { ascending: false })
    .limit(30)
  if (error) throw error
  type Joined = WallSelectionHistoryRow & { profiles: WallHistoryEntry['changer'] }
  return ((data ?? []) as unknown as Joined[]).map(({ profiles, ...row }) => ({ ...row, changer: profiles }))
}

/** Un candidat qu'on peut poser sur la carte : une audition envoyée, avec sa tape. */
export type WallCandidate = CandidateViewRow & { self_tape_id: string; duration_s: number | null }

export async function listWallCandidates(roleId: string): Promise<WallCandidate[]> {
  const { data, error } = await supabase
    .from('v_candidates')
    .select('*')
    .eq('role_id', roleId)
    .not('status', 'in', '(draft,withdrawn)')
    .eq('has_self_tape', true)
  if (error) throw error
  const candidates = data ?? []
  if (candidates.length === 0) return []

  const { data: tapes, error: tapesError } = await supabase
    .from('self_tapes')
    .select('id, application_id, duration_s, submitted_at')
    .in(
      'application_id',
      candidates.map((candidate) => candidate.application_id),
    )
    .order('submitted_at', { ascending: false })
  if (tapesError) throw tapesError
  const latest = new Map<string, { id: string; duration_s: number | null }>()
  for (const tape of tapes ?? []) if (!latest.has(tape.application_id)) latest.set(tape.application_id, tape)

  return candidates.flatMap((candidate) => {
    const tape = latest.get(candidate.application_id)
    return tape ? [{ ...candidate, self_tape_id: tape.id, duration_s: tape.duration_s }] : []
  })
}

// ── Self-tapes : vidéo signée et image tirée de la tape ─────────────────────

/** L'URL signée de la vidéo d'une self-tape (pour la lire ou en tirer une image). */
export async function signSelfTapes(selfTapeIds: string[]): Promise<Record<string, string>> {
  if (selfTapeIds.length === 0) return {}
  const { data, error } = await supabase
    .from('self_tapes')
    .select('id, media_assets ( bucket, path )')
    .in('id', selfTapeIds)
  if (error) throw error
  type Row = { id: string; media_assets: Pick<MediaAssetRow, 'bucket' | 'path'> | null }
  const rows = ((data ?? []) as unknown as Row[]).filter((row) => row.media_assets)
  const byBucket = new Map<string, Row[]>()
  for (const row of rows) {
    const bucket = row.media_assets!.bucket
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), row])
  }
  const out: Record<string, string> = {}
  for (const [bucket, group] of byBucket) {
    const { data: signed, error: signError } = await supabase.storage
      .from(bucket)
      .createSignedUrls(
        group.map((row) => row.media_assets!.path),
        SIGNED_URL_TTL_SECONDS,
      )
    if (signError) throw signError
    signed.forEach((item, index) => {
      if (item.signedUrl) out[group[index].id] = item.signedUrl
    })
  }
  return out
}

export type TapeStill = Pick<TapeStillRow, 'self_tape_id' | 'width' | 'height' | 'at_s'> & { url: string }

/** Les images déjà tirées, signées en un appel. */
export async function listTapeStills(selfTapeIds: string[]): Promise<Record<string, TapeStill>> {
  if (selfTapeIds.length === 0) return {}
  const { data, error } = await supabase
    .from('tape_stills')
    .select('self_tape_id, path, width, height, at_s')
    .in('self_tape_id', selfTapeIds)
  if (error) throw error
  const rows = data ?? []
  if (rows.length === 0) return {}
  const { data: signed, error: signError } = await supabase.storage
    .from(STILLS_BUCKET)
    .createSignedUrls(
      rows.map((row) => row.path),
      SIGNED_URL_TTL_SECONDS,
    )
  if (signError) throw signError
  const out: Record<string, TapeStill> = {}
  signed.forEach((item, index) => {
    const row = rows[index]
    if (item.signedUrl) {
      out[row.self_tape_id] = {
        self_tape_id: row.self_tape_id,
        width: row.width,
        height: row.height,
        at_s: row.at_s,
        url: item.signedUrl,
      }
    }
  })
  return out
}

/**
 * Range l'image tirée d'une tape : le fichier d'abord, la ligne ensuite. Deux
 * personnes qui ouvrent le mur en même temps peuvent produire la même image ;
 * la seconde écrase le fichier (identique) et la ligne existe déjà.
 */
export async function saveTapeStill(input: {
  selfTapeId: string
  orgId: string
  blob: Blob
  atSeconds: number
  width: number
  height: number
  profileId: string
}): Promise<void> {
  const path = `${input.orgId}/${input.selfTapeId}.jpg`
  const { error: uploadError } = await supabase.storage
    .from(STILLS_BUCKET)
    .upload(path, input.blob, { contentType: 'image/jpeg', upsert: true })
  if (uploadError) throw uploadError
  const { error } = await supabase.from('tape_stills').insert({
    self_tape_id: input.selfTapeId,
    org_id: input.orgId,
    path,
    at_s: Math.round(input.atSeconds * 100) / 100,
    width: input.width,
    height: input.height,
    created_by: input.profileId,
  })
  // 23505 : une autre session l'a enregistrée entre-temps — c'est la même image.
  if (error && error.code !== '23505') throw error
}

/**
 * Les changements du mur en direct. Le journal reçoit une ligne pour chaque
 * changement (y compris un retrait), filtrable par projet.
 */
export function subscribeToWall(projectId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`wall-${projectId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'wall_selection_history', filter: `project_id=eq.${projectId}` },
      () => onChange(),
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}
