import { supabase } from '@/lib/supabase'
import {
  BUCKET_BY_KIND,
  publicUrl,
  removeFromBucket,
  signedUrl,
  storagePath,
  uploadToBucket,
  validateFile,
} from '@/lib/storage'
import type { MediaAssetRow, MediaKind } from '@/types/database'

/**
 * Media = one storage object + one `media_assets` row. The row is the entity;
 * business tables (applications, self-tapes, profiles) reference it by id and
 * never store a bare URL.
 */

export type UploadResult = MediaAssetRow & { url: string }

/** Public URL for public buckets, signed URL for self-tapes. */
export async function urlForAsset(asset: MediaAssetRow): Promise<string> {
  if (asset.bucket === 'selftapes') return signedUrl(asset.bucket, asset.path)
  return publicUrl(asset.bucket, asset.path)
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Your session expired — sign in again to upload')
  return token
}

/** Reads the natural size of an image / the duration of a video, best effort. */
async function probeDimensions(
  file: File,
): Promise<{ width?: number; height?: number; duration?: number }> {
  const url = URL.createObjectURL(file)
  try {
    if (file.type.startsWith('image/')) {
      return await new Promise((resolve) => {
        const image = new Image()
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
        image.onerror = () => resolve({})
        image.src = url
      })
    }
    if (file.type.startsWith('video/')) {
      return await new Promise((resolve) => {
        const video = document.createElement('video')
        video.preload = 'metadata'
        video.onloadedmetadata = () =>
          resolve({
            width: video.videoWidth,
            height: video.videoHeight,
            duration: Number.isFinite(video.duration) ? video.duration : undefined,
          })
        video.onerror = () => resolve({})
        video.src = url
      })
    }
    return {}
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function uploadMedia({
  ownerId,
  kind,
  file,
  caption,
  sortOrder = 0,
  onProgress,
}: {
  ownerId: string
  kind: MediaKind
  file: File
  caption?: string | null
  sortOrder?: number
  onProgress?: (percent: number) => void
}): Promise<UploadResult> {
  const invalid = validateFile(file, kind)
  if (invalid) throw new Error(invalid)

  const bucket = BUCKET_BY_KIND[kind]
  const path = storagePath(ownerId, file)
  const token = await accessToken()

  const { promise } = uploadToBucket({ bucket, path, file, accessToken: token, onProgress })
  await promise

  const probed = await probeDimensions(file)

  const { data, error } = await supabase
    .from('media_assets')
    .insert({
      owner_id: ownerId,
      kind,
      bucket,
      path,
      mime: file.type,
      bytes: file.size,
      width: probed.width ?? null,
      height: probed.height ?? null,
      duration_s: probed.duration ?? null,
      caption: caption ?? null,
      sort_order: sortOrder,
    })
    .select('*')
    .single()

  if (error) {
    // Do not leave an orphan object behind if the row could not be written.
    await removeFromBucket(bucket, path).catch(() => {})
    throw error
  }

  return { ...data, url: await urlForAsset(data) }
}

export async function listMedia(ownerId: string, kinds?: MediaKind[]): Promise<MediaAssetRow[]> {
  let query = supabase
    .from('media_assets')
    .select('*')
    .eq('owner_id', ownerId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (kinds?.length) query = query.in('kind', kinds)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function updateMedia(
  id: string,
  patch: Partial<Pick<MediaAssetRow, 'caption' | 'sort_order' | 'kind'>>,
): Promise<MediaAssetRow> {
  const { data, error } = await supabase
    .from('media_assets')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

/** Deletes the row and the underlying object. */
export async function deleteMedia(asset: MediaAssetRow): Promise<void> {
  const { error } = await supabase.from('media_assets').delete().eq('id', asset.id)
  if (error) throw error
  await removeFromBucket(asset.bucket, asset.path).catch(() => {
    // The row is gone; a leftover object is harmless and swept by bucket cleanup.
  })
}
