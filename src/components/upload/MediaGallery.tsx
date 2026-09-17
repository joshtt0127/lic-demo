import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { FileDropzone, UploadProgress } from '@/components/upload/FileDropzone'
import { useMediaMutations } from '@/features/talent/queries'
import { publicUrl } from '@/lib/storage'
import { track } from '@/lib/analytics'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import type { MediaAssetRow, MediaKind } from '@/types/database'

/**
 * Editable gallery for one media kind (headshots, portfolio, showreels).
 * Upload, preview, delete — all persisted. Public buckets only: self-tapes are
 * private and rendered through their own signed-URL player.
 */
export function MediaGallery({
  profileId,
  kind,
  assets,
  aspect = 'portrait',
  addLabel = 'Add',
  emptyHint,
  editable = true,
}: {
  profileId: string
  kind: Extract<MediaKind, 'headshot' | 'portfolio' | 'showreel' | 'poster' | 'cover'>
  assets: MediaAssetRow[]
  aspect?: 'portrait' | 'video' | 'square'
  addLabel?: string
  emptyHint?: string
  editable?: boolean
}) {
  const media = useMediaMutations(profileId)
  const [percent, setPercent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const ratio =
    aspect === 'video' ? 'aspect-video' : aspect === 'square' ? 'aspect-square' : 'aspect-[3/4]'

  async function handleFile(file: File) {
    setError(null)
    setPercent(0)
    try {
      await media.upload.mutateAsync({ kind, file, onProgress: setPercent })
      track('media_uploaded', { kind })
    } catch (uploadError) {
      setError(errorMessage(uploadError, 'Upload failed'))
    } finally {
      setPercent(null)
    }
  }

  async function handleRemove(asset: MediaAssetRow) {
    setError(null)
    setRemoving(asset.id)
    try {
      await media.remove.mutateAsync(asset)
    } catch (removeError) {
      setError(errorMessage(removeError, 'Could not delete this file'))
    } finally {
      setRemoving(null)
    }
  }

  const isVideo = kind === 'showreel'

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {assets.map((asset) => {
          const url = publicUrl(asset.bucket, asset.path)
          return (
            <div
              key={asset.id}
              className={cn(
                'group relative overflow-hidden rounded-card border border-line bg-paper',
                ratio,
              )}
            >
              {isVideo ? (
                <video src={url} controls preload="metadata" className="h-full w-full object-cover" />
              ) : (
                <img
                  src={url}
                  alt={asset.caption ?? ''}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              )}

              {editable && (
                <button
                  type="button"
                  onClick={() => handleRemove(asset)}
                  aria-label="Delete"
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-ink/70 text-white opacity-0 backdrop-blur transition-opacity hover:bg-signal-no group-hover:opacity-100 focus-visible:opacity-100"
                >
                  {removing === asset.id ? (
                    <Spinner className="h-3.5 w-3.5" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          )
        })}

        {editable && (
          <FileDropzone
            kind={kind}
            onFile={handleFile}
            onError={setError}
            disabled={percent !== null}
            fill
            className={ratio}
          >
            <span className="flex h-full flex-col items-center justify-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-ink shadow-card">
                {percent !== null ? <Spinner /> : <Plus className="h-4 w-4" />}
              </span>
              <span className="text-xs font-semibold text-ink">{addLabel}</span>
            </span>
          </FileDropzone>
        )}
      </div>

      {percent !== null && <UploadProgress percent={percent} />}
      {error && <p className="text-xs font-medium text-signal-no">{error}</p>}
      {assets.length === 0 && emptyHint && !error && (
        <p className="text-xs text-muted">{emptyHint}</p>
      )}
    </div>
  )
}
