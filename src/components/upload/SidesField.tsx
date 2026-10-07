import { useState } from 'react'
import { ExternalLink, FileText, Trash2 } from 'lucide-react'
import { FormError } from '@/components/ui'
import { FileDropzone, UploadProgress } from '@/components/upload/FileDropzone'
import { useMediaMutations } from '@/features/talent/queries'
import { errorMessage } from '@/lib/supabase'

/** « …/a1b2c3.pdf » → « a1b2c3.pdf », pour nommer le fichier sans l'ouvrir. */
export function sidesFileName(url: string) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() || 'sides.pdf')
  } catch {
    return 'sides.pdf'
  }
}

/**
 * Audition Sides™ d'un rôle : le PDF des scènes à préparer. Comme
 * `PosterField`, ce champ ne fait que téléverser — le formulaire du rôle écrit
 * l'URL au moment où il enregistre.
 */
export function SidesField({
  profileId,
  value,
  onChange,
  disabled,
}: {
  profileId: string | undefined
  value: string | null
  onChange: (url: string | null) => void
  disabled?: boolean
}) {
  const media = useMediaMutations(profileId)
  const [percent, setPercent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = percent !== null

  async function upload(file: File) {
    setError(null)
    setPercent(0)
    try {
      const asset = await media.upload.mutateAsync({ kind: 'sides', file, onProgress: setPercent })
      onChange(asset.url)
    } catch (uploadError) {
      setError(errorMessage(uploadError, 'Could not upload the sides'))
    } finally {
      setPercent(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value && !busy ? (
        <div className="flex items-center gap-3 rounded-btn border border-line bg-card px-3.5 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-inner bg-signal-no/10 text-signal-no">
            <FileText className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-ink">Audition sides · PDF</span>
            <span className="block truncate text-[12px] text-muted">{sidesFileName(value)}</span>
          </span>
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-btn px-2.5 text-[12.5px] font-semibold text-link hover:bg-link/5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </a>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            aria-label="Remove the sides"
            className="inline-flex h-9 w-9 items-center justify-center rounded-btn text-muted transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <FileDropzone
          kind="sides"
          onFile={upload}
          onError={setError}
          disabled={disabled || busy}
          compact
          label="Drop the sides PDF here, or click to browse"
        />
      )}
      {percent !== null && <UploadProgress percent={percent} />}
      {error && <FormError>{error}</FormError>}
    </div>
  )
}
