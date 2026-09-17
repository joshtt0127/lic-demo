import { useState } from 'react'
import { Film, RotateCcw, Trash2, Video } from 'lucide-react'
import { Button, FormError, Spinner } from '@/components/ui'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSelfTapes, useSelfTapeMutations } from '@/features/selftapes/queries'
import { formatBytes, RULES } from '@/lib/storage'
import { relativeTime } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'

function duration(seconds: number | null): string | null {
  if (!seconds || !Number.isFinite(seconds)) return null
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${`${total % 60}`.padStart(2, '0')}`
}

/**
 * The talent's self-tape for one application: upload, watch, replace, remove.
 *
 * The tape goes to the private bucket and is tied to the application, which is
 * what lets the reviewing production — and nobody else — play it.
 */
export function SelfTapePanel({
  applicationId,
  instructions,
  locked,
}: {
  applicationId: string
  /** The role's self-tape brief, shown where it is needed. */
  instructions?: string | null
  /** A decided application no longer takes a new tape. */
  locked?: boolean
}) {
  const { profile } = useAuth()
  const toast = useToast()
  const tapes = useSelfTapes(applicationId)
  const { upload, remove } = useSelfTapeMutations(profile?.id)

  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const current = tapes.data?.[0] ?? null

  async function send(file: File) {
    setError(null)
    setProgress(0)
    try {
      await upload.mutateAsync({
        applicationId,
        file,
        onProgress: setProgress,
        replacing: current,
      })
      toast(current ? 'Self-tape replaced' : 'Self-tape sent to the production')
    } catch (uploadError) {
      setError(errorMessage(uploadError, 'Could not send your tape'))
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-field bg-paper p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="tech-label inline-flex items-center gap-1.5">
          <Video className="h-3.5 w-3.5" />
          Self-tape
        </span>
        {current && (
          <span className="text-[12px] text-muted">
            {[
              `sent ${relativeTime(current.submittedAt)}`,
              duration(current.durationSeconds),
              current.bytes ? formatBytes(current.bytes) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </div>

      {instructions && (
        <p className="text-[13px] leading-relaxed text-ink/90">
          <span className="font-semibold">Brief: </span>
          {instructions}
        </p>
      )}

      {error && <FormError>{error}</FormError>}

      {tapes.isLoading ? (
        <span className="flex items-center gap-2 text-[13px] text-muted">
          <Spinner />
          Loading your tape…
        </span>
      ) : current ? (
        <>
          <video
            src={current.url}
            controls
            preload="metadata"
            className="w-full rounded-btn border border-line bg-black"
          />
          {!locked && (
            <div className="flex flex-wrap items-center gap-2">
              <FileDropzone
                kind="selftape"
                bare
                disabled={progress !== null}
                onFile={send}
                onError={setError}
              >
                <span className="inline-flex h-9 items-center gap-1.5 rounded-btn border border-line bg-card px-3 text-[13px] font-semibold text-ink transition-colors hover:bg-paper">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Replace
                </span>
              </FileDropzone>

              {confirmRemove ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-signal-no"
                    disabled={remove.isPending}
                    onClick={async () => {
                      try {
                        await remove.mutateAsync(current)
                        toast('Self-tape removed')
                      } catch (removeError) {
                        setError(errorMessage(removeError, 'Could not remove your tape'))
                      } finally {
                        setConfirmRemove(false)
                      }
                    }}
                  >
                    {remove.isPending ? 'Removing…' : 'Confirm removal'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                    Keep it
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => setConfirmRemove(true)}
                >
                  Remove
                </Button>
              )}
            </div>
          )}
        </>
      ) : locked ? (
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <Film className="h-3.5 w-3.5" />
          No tape was sent for this audition.
        </p>
      ) : (
        <FileDropzone
          kind="selftape"
          compact
          disabled={progress !== null}
          onFile={send}
          onError={setError}
          label="Add your self-tape"
        />
      )}

      {progress !== null && (
        <div className="flex flex-col gap-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-ink transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="font-mono text-[11px] text-muted">
            {progress < 100 ? `Uploading ${progress}%` : 'Finishing…'}
          </span>
        </div>
      )}

      {!current && !locked && progress === null && (
        <span className="text-[11.5px] text-muted">{RULES.selftape.label}</span>
      )}
    </div>
  )
}
