import { useState } from 'react'
import { Camera, Trash2, Upload } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { FileDropzone, UploadProgress } from '@/components/upload/FileDropzone'
import { useMediaMutations, useUpdateAccountProfile } from '@/features/talent/queries'
import { track } from '@/lib/analytics'
import { errorMessage } from '@/lib/supabase'
import { RULES } from '@/lib/storage'

/**
 * Profile photo, as drawn in the onboarding design: the round preview on the
 * left, the upload tile on the right.
 *
 * Uploads to storage, records a `media_assets` row, then points
 * `profiles.avatar_url` at it — the avatar is read back from the profile, so it
 * survives a refresh and shows up in the app shell straight away.
 */
export function AvatarUpload({
  profileId,
  avatarUrl,
  name,
  onUploaded,
}: {
  profileId: string
  avatarUrl: string | null
  name: string
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
      const asset = await media.upload.mutateAsync({ kind: 'avatar', file, onProgress: setPercent })
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
      <div className="flex flex-wrap items-center gap-5">
        <span className="relative flex h-[104px] w-[104px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#E9E7E1] text-muted">
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            <Camera className="h-7 w-7" />
          )}
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-ink/50 text-white">
              <Spinner className="h-5 w-5" />
            </span>
          )}
        </span>

        <FileDropzone
          kind="avatar"
          ariaLabel="Upload a profile photo"
          onFile={handleFile}
          onError={setError}
          disabled={busy}
          bare
          className="min-w-[240px] flex-1"
        >
          <span className="flex w-full flex-col items-center gap-1 rounded-field bg-[#F1F0EB] px-6 py-5 transition-colors hover:bg-[#EAE8E2]">
            <span className="inline-flex items-center gap-2 text-[15px] font-bold text-ink">
              <Upload className="h-[18px] w-[18px]" />
              {avatarUrl ? 'Replace photo' : 'Upload a photo'}
            </span>
            <span className="text-[13px] text-muted">{RULES.avatar.label}</span>
          </span>
        </FileDropzone>
      </div>

      {percent !== null && <UploadProgress percent={percent} />}
      {error && <p className="text-xs font-medium text-signal-no">{error}</p>}

      {avatarUrl && !busy && (
        <button
          type="button"
          onClick={handleRemove}
          className="inline-flex h-9 items-center gap-1.5 self-start rounded-btn px-2 text-[13px] font-medium text-muted transition-colors hover:bg-signal-no/10 hover:text-signal-no"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove photo
        </button>
      )}
    </div>
  )
}
