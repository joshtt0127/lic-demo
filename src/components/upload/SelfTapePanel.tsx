import { useState } from 'react'
import { Camera, Film, RotateCcw, Trash2, Upload, Video } from 'lucide-react'
import { Button, FormError, Spinner } from '@/components/ui'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { SelfTapeRecorder } from '@/components/upload/SelfTapeRecorder'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSelfTapes, useSelfTapeMutations } from '@/features/selftapes/queries'
import { formatBytes } from '@/lib/storage'
import { relativeTime } from '@/lib/format'
import { useT } from '@/lib/i18n'
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
  const t = useT()
  const { profile } = useAuth()
  const toast = useToast()
  const tapes = useSelfTapes(applicationId)
  const { upload, remove } = useSelfTapeMutations(profile?.id)

  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [recording, setRecording] = useState(false)

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
      toast(current ? t('selftape.replaced') : t('selftape.sent'))
      setRecording(false)
    } catch (uploadError) {
      setError(errorMessage(uploadError, t('selftape.sendFailed')))
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-field bg-paper p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="tech-label inline-flex items-center gap-1.5">
          <Video className="h-3.5 w-3.5" />
          {t('selftape.title')}
        </span>
        {current && (
          <span className="text-[12px] text-muted">
            {[
              t('selftape.meta', { when: relativeTime(current.submittedAt, t) }),
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
          <span className="font-semibold">{t('selftape.brief')} </span>
          {instructions}
        </p>
      )}

      {error && <FormError>{error}</FormError>}

      {recording && !locked ? (
        <SelfTapeRecorder
          busy={progress !== null}
          onUse={send}
          onCancel={() => setRecording(false)}
        />
      ) : tapes.isLoading ? (
        <span className="flex items-center gap-2 text-[13px] text-muted">
          <Spinner />
          {t('selftape.loading')}
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
              <Button
                size="sm"
                variant="secondary"
                disabled={progress !== null}
                icon={<Camera className="h-3.5 w-3.5" />}
                onClick={() => setRecording(true)}
              >
                {t('selftape.recordAgain')}
              </Button>
              <FileDropzone
                kind="selftape"
                bare
                disabled={progress !== null}
                onFile={send}
                onError={setError}
              >
                <span className="inline-flex h-9 items-center gap-1.5 rounded-btn border border-line bg-card px-3 text-[13px] font-semibold text-ink transition-colors hover:bg-paper">
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t('selftape.replaceFile')}
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
                        toast(t('selftape.removed'))
                      } catch (removeError) {
                        setError(errorMessage(removeError, t('selftape.removeFailed')))
                      } finally {
                        setConfirmRemove(false)
                      }
                    }}
                  >
                    {remove.isPending ? t('selftape.removing') : t('selftape.confirmRemove')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                    {t('selftape.keep')}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => setConfirmRemove(true)}
                >
                  {t('selftape.remove')}
                </Button>
              )}
            </div>
          )}
        </>
      ) : locked ? (
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <Film className="h-3.5 w-3.5" />
          {t('selftape.none')}
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {/* Recording is the point — a file stays one tap away. */}
          <Button
            icon={<Camera className="h-4 w-4" />}
            disabled={progress !== null}
            onClick={() => setRecording(true)}
          >
            {t('selftape.record')}
          </Button>
          <FileDropzone
            kind="selftape"
            bare
            disabled={progress !== null}
            onFile={send}
            onError={setError}
          >
            <span className="inline-flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-field border border-line bg-card px-3 text-[13px] font-semibold text-ink transition-colors hover:bg-paper">
              <Upload className="h-3.5 w-3.5" />
              {t('selftape.upload')}
            </span>
          </FileDropzone>
        </div>
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
            {progress < 100
              ? t('selftape.uploading', { percent: progress })
              : t('selftape.finishing')}
          </span>
        </div>
      )}

      {!current && !locked && progress === null && (
        <span className="text-[11.5px] text-muted">{t('selftape.rules')}</span>
      )}
    </div>
  )
}
