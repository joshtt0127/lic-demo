import { supabase } from '@/lib/supabase'
import { deleteMedia, uploadMedia } from '@/data/repositories/media'
import { signedUrl } from '@/lib/storage'
import type { MediaAssetRow } from '@/types/database'

/**
 * Self-tapes.
 *
 * A tape is a storage object in the private `selftapes` bucket + a
 * `media_assets` row + a `self_tapes` row tying it to the application. That
 * third row is what makes it reviewable: the storage policy issues a signed URL
 * to the owner and to members of the organization that received the
 * application, and to nobody else.
 */

export type SelfTape = {
  id: string
  applicationId: string
  submittedAt: string
  durationSeconds: number | null
  bytes: number | null
  mime: string | null
  /** Time-limited — never store it. */
  url: string
  asset: MediaAssetRow
}

type Joined = {
  id: string
  application_id: string
  submitted_at: string
  duration_s: number | null
  media_assets: MediaAssetRow | null
}

const SELECT = 'id, application_id, submitted_at, duration_s, media_assets (*)'

async function shape(row: Joined): Promise<SelfTape | null> {
  if (!row.media_assets) return null
  return {
    id: row.id,
    applicationId: row.application_id,
    submittedAt: row.submitted_at,
    durationSeconds: row.duration_s ?? row.media_assets.duration_s,
    bytes: row.media_assets.bytes,
    mime: row.media_assets.mime,
    url: await signedUrl(row.media_assets.bucket, row.media_assets.path),
    asset: row.media_assets,
  }
}

/** Newest first — a replacement keeps the history of what was sent. */
export async function listSelfTapes(applicationId: string): Promise<SelfTape[]> {
  const { data, error } = await supabase
    .from('self_tapes')
    .select(SELECT)
    .eq('application_id', applicationId)
    .order('submitted_at', { ascending: false })
  if (error) throw error

  const tapes = await Promise.all(((data ?? []) as unknown as Joined[]).map(shape))
  return tapes.filter((tape): tape is SelfTape => tape !== null)
}

/** Which of a set of applications already have a tape (one query, not N). */
export async function selfTapeCounts(applicationIds: string[]): Promise<Map<string, number>> {
  if (applicationIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('self_tapes')
    .select('application_id')
    .in('application_id', applicationIds)
  if (error) throw error

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    counts.set(row.application_id, (counts.get(row.application_id) ?? 0) + 1)
  }
  return counts
}

export async function addSelfTape({
  applicationId,
  ownerId,
  file,
  onProgress,
}: {
  applicationId: string
  ownerId: string
  file: File
  onProgress?: (percent: number) => void
}): Promise<SelfTape> {
  const asset = await uploadMedia({ ownerId, kind: 'selftape', file, onProgress })

  const { data, error } = await supabase
    .from('self_tapes')
    .insert({
      application_id: applicationId,
      media_asset_id: asset.id,
      duration_s: asset.duration_s,
    })
    .select(SELECT)
    .single()

  if (error) {
    // Never leave an uploaded tape that no application points to.
    await deleteMedia(asset).catch(() => {})
    throw error
  }

  const tape = await shape(data as unknown as Joined)
  if (!tape) throw new Error('The tape was uploaded but could not be read back')
  return tape
}

/** Deletes the row, the media asset and the object in one go. */
export async function removeSelfTape(tape: SelfTape): Promise<void> {
  const { error } = await supabase.from('self_tapes').delete().eq('id', tape.id)
  if (error) throw error
  await deleteMedia(tape.asset)
}
