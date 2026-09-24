import { supabase } from '@/lib/supabase'
import type { MediaKind } from '@/types/database'

/**
 * File uploads.
 *
 * Path convention `<profile_id>/<uuid>.<ext>` — the storage policies derive
 * ownership from the first folder, so nobody can write into another user's
 * folder (`supabase/migrations/*_storage.sql`).
 *
 * Uploads go through XHR rather than `supabase.storage.upload()` for one
 * reason: real progress events. A 300 MB self-tape with an indeterminate
 * spinner is not an acceptable upload experience.
 */

export const BUCKET_BY_KIND: Record<MediaKind, string> = {
  avatar: 'avatars',
  cover: 'avatars',
  logo: 'avatars',
  headshot: 'media',
  portfolio: 'media',
  showreel: 'media',
  poster: 'media',
  selftape: 'selftapes',
}

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
const VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/webm']

const MB = 1024 * 1024

/**
 * Les limites de fichiers, à un seul endroit.
 *
 * Elles sont volontairement lues ici par **tous** les écrans — dropzone,
 * galerie, enregistreur — plutôt que recopiées : une limite écrite à trois
 * endroits finit par en valoir trois. Les mêmes valeurs sont déclarées sur les
 * buckets Supabase, qui refusent côté serveur ce que l'écran a laissé passer.
 *
 * Pour les changer : cette table **et** la migration des buckets. Les deux,
 * jamais l'une sans l'autre.
 */
export const RULES: Record<MediaKind, { mimes: string[]; maxBytes: number; label: string }> = {
  avatar: { mimes: IMAGE_MIMES, maxBytes: 5 * MB, label: 'JPG, PNG · 5 MB max' },
  cover: { mimes: IMAGE_MIMES, maxBytes: 5 * MB, label: 'JPG, PNG · 5 MB max' },
  logo: { mimes: IMAGE_MIMES, maxBytes: 5 * MB, label: 'JPG, PNG, WebP or AVIF up to 5 MB' },
  headshot: { mimes: IMAGE_MIMES, maxBytes: 20 * MB, label: 'JPG, PNG, WebP or AVIF up to 20 MB' },
  portfolio: { mimes: IMAGE_MIMES, maxBytes: 20 * MB, label: 'JPG, PNG, WebP or AVIF up to 20 MB' },
  poster: { mimes: IMAGE_MIMES, maxBytes: 20 * MB, label: 'JPG, PNG, WebP or AVIF up to 20 MB' },
  showreel: { mimes: VIDEO_MIMES, maxBytes: 200 * MB, label: 'MP4, MOV or WebM up to 200 MB' },
  selftape: { mimes: VIDEO_MIMES, maxBytes: 500 * MB, label: 'MP4, MOV or WebM up to 500 MB' },
}

export function formatBytes(bytes: number): string {
  if (bytes >= MB) return `${(bytes / MB).toFixed(bytes >= 10 * MB ? 0 : 1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Client-side validation — the bucket enforces the same rules server-side. */
export function validateFile(file: File, kind: MediaKind): string | null {
  const rule = RULES[kind]
  if (file.size === 0) return 'This file is empty'
  if (!rule.mimes.includes(file.type)) {
    return rule.mimes === VIDEO_MIMES
      ? 'Unsupported video format — use MP4, MOV or WebM'
      : 'Unsupported image format — use JPG, PNG, WebP or AVIF'
  }
  if (file.size > rule.maxBytes) {
    return `Too large (${formatBytes(file.size)}) — the limit is ${formatBytes(rule.maxBytes)}`
  }
  return null
}

function extensionOf(file: File): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop() : ''
  if (fromName && fromName.length <= 5) return fromName.toLowerCase()
  const fromMime = file.type.split('/')[1]
  return (fromMime || 'bin').toLowerCase()
}

export function storagePath(ownerId: string, file: File): string {
  return `${ownerId}/${crypto.randomUUID()}.${extensionOf(file)}`
}

export type UploadHandle = {
  promise: Promise<void>
  abort: () => void
}

/** Raw upload with progress. Resolves once storage has the object. */
export function uploadToBucket({
  bucket,
  path,
  file,
  accessToken,
  onProgress,
}: {
  bucket: string
  path: string
  file: File
  accessToken: string
  onProgress?: (percent: number) => void
}): UploadHandle {
  const xhr = new XMLHttpRequest()
  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${bucket}/${path}`

  const promise = new Promise<void>((resolve, reject) => {
    xhr.open('POST', endpoint, true)
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
    xhr.setRequestHeader('x-upsert', 'true')
    xhr.setRequestHeader('cache-control', 'max-age=3600')
    if (file.type) xhr.setRequestHeader('content-type', file.type)

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return
      onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100)
        resolve()
        return
      }
      let message = `Upload failed (${xhr.status})`
      try {
        const parsed = JSON.parse(xhr.responseText) as { message?: string; error?: string }
        message = parsed.message || parsed.error || message
      } catch {
        // keep the status-based message
      }
      reject(new Error(message))
    }
    xhr.onerror = () => reject(new Error('Upload failed — check your connection'))
    xhr.onabort = () => reject(new Error('Upload cancelled'))
    xhr.send(file)
  })

  return { promise, abort: () => xhr.abort() }
}

/** Public CDN URL (avatars / media buckets). */
export function publicUrl(bucket: string, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

/**
 * Combien de temps une URL de lecture reste valable.
 *
 * Une self-tape se regarde, elle ne se distribue pas : l'URL signée est faite
 * pour la durée d'une revue, pas pour être collée dans un message. Trente
 * minutes couvrent largement une session de visionnage et rendent un lien
 * recopié inutile peu après.
 *
 * (Les médias publics — photos, showreels — n'utilisent pas ce chemin.)
 */
export const SIGNED_URL_TTL_SECONDS = 30 * 60

/** Time-limited URL for the private `selftapes` bucket. */
export async function signedUrl(
  bucket: string,
  path: string,
  expiresIn = SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error) throw error
  return data.signedUrl
}

export async function removeFromBucket(bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) throw error
}
