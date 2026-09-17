import { useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { Avatar, Spinner } from '@/components/ui'
import { FileDropzone, UploadProgress } from '@/components/upload/FileDropzone'
import { useMediaMutations, useUpdateAccountProfile } from '@/features/talent/queries'
import { track } from '@/lib/analytics'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'

/**
 * Profile photo: uploads to storage, records a `media_assets` row, then points
 * `profiles.avatar_url` at it. Survives a refresh because nothing lives in React
 * state — the avatar is read back from the profile.
 */
export function AvatarUpload({
  profileId,
  avatarUrl,
  name,
  size = 'xl',
  onUploaded,
}: {
  profileId: string
  avatarUrl: string | null
  name: string
  size?: 'lg' | 'xl'
  onUploaded?: (url: string) => void
}) {
  const media = useMediaMutations(profileId)
  const updateProfile = useUpdateAccountProfile(profileId)
  const [percent, setPercent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const busy = percent !== null || updateProfile.isPending

  async function handleFile(file: File) {
    setError(null)
    setPercent(0)
    try {
      const asset = await media.upload.mutateAsync({
        kind: 'avatar',
        file,
        onProgress: setPercent,
      })
      await updateProfile.mutateAsync({ avatar_url: asset.url })
      track('media_uploaded', { kind: 'avatar' })
      onUploaded?.(asset.url)
    } catch (uploadError) {
      setError(errorMessage(uploadError, 'Could not upload your photo'))
    } finally {
      setPercent(null)
    }
  }

  async function handleRemove() {
    setError(null)
    try {
      await updateProfile.mutateAsync({ avatar_url: null })
    } catch (removeError) {
      setError(errorMessage(removeError, 'Could not remove your photo'))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar src={avatarUrl ?? undefined} name={name} size={size} ring />
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/50 text-white">
              <Spinner className="h-5 w-5" />
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <FileDropzone
            kind="avatar"
            onFile={handleFile}
            onError={setError}
            disabled={busy}
            className="w-auto"
          >
            <span
              className={cn(
                'inline-flex items-center gap-2 text-sm font-semibold text-ink',
                busy && 'opacity-60',
              )}
            >
              <Camera className="h-4 w-4" />
              {avatarUrl ? 'Replace photo' : 'Upload a photo'}
            </span>
            <span className="text-xs text-muted">Drop an image or click · 5 MB max</span>
          </FileDropzone>

          {avatarUrl && !busy && (
            <button
              type="button"
              onClick={handleRemove}
              className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-muted transition-colors hover:text-signal-no"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          )}
        </div>
      </div>

      {percent !== null && <UploadProgress percent={percent} />}
      {error && <p className="text-xs font-medium text-signal-no">{error}</p>}
    </div>
  )
}
