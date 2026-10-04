import { useState } from 'react'
import { ImageIcon, Trash2 } from 'lucide-react'
import { FormError, Spinner } from '@/components/ui'
import { FileDropzone, UploadProgress } from '@/components/upload/FileDropzone'
import { useMediaMutations } from '@/features/talent/queries'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'

/**
 * L'affiche d'un projet : glisser-déposer (ou parcourir), aperçu au format
 * affiche, remplacement et retrait.
 *
 * Retour de test : en créant un casting, une production ne pouvait mettre
 * aucune image — l'affiche n'était modifiable que depuis la page Projets, que
 * personne ne pense à ouvrir à ce moment-là. Ce champ est le même partout où
 * l'affiche se décide (nouveau projet, projet existant choisi, édition du
 * casting). Il ne fait que téléverser : c'est l'appelant qui écrit l'URL
 * sur le projet, au moment qui convient à son formulaire.
 */
export function PosterField({
  profileId,
  value,
  onChange,
  disabled,
  saving,
}: {
  profileId: string | undefined
  value: string | null
  /** URL publique de la nouvelle affiche, ou `null` pour la retirer. */
  onChange: (url: string | null) => void | Promise<void>
  disabled?: boolean
  /** L'appelant enregistre l'affiche sur le projet. */
  saving?: boolean
}) {
  const media = useMediaMutations(profileId)
  const [percent, setPercent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = percent !== null || Boolean(saving)

  async function upload(file: File) {
    setError(null)
    setPercent(0)
    try {
      const asset = await media.upload.mutateAsync({ kind: 'poster', file, onProgress: setPercent })
      await onChange(asset.url)
    } catch (uploadError) {
      setError(errorMessage(uploadError, 'Could not upload the poster'))
    } finally {
      setPercent(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-stretch gap-4">
        <span
          className={cn(
            'relative flex aspect-[2/3] w-[112px] shrink-0 items-center justify-center overflow-hidden rounded-btn bg-line',
            busy && 'opacity-70',
          )}
        >
          {value ? (
            <img src={value} alt="Poster" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted" />
          )}
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-card/40">
              <Spinner />
            </span>
          )}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <FileDropzone
            kind="poster"
            onFile={upload}
            onError={setError}
            disabled={disabled || busy}
            label={value ? 'Drop a new poster to replace it' : 'Drop your poster here, or click to browse'}
            className="flex-1 [&>button]:h-full"
          />
          {value && !busy && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => void onChange(null)}
              className="inline-flex items-center gap-1.5 self-start rounded-btn px-1 text-[12.5px] font-semibold text-muted transition-colors hover:text-ink"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove poster
            </button>
          )}
        </div>
      </div>
      {percent !== null && <UploadProgress percent={percent} />}
      {error && <FormError>{error}</FormError>}
    </div>
  )
}
