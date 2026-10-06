import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Camera, CircleStop, RotateCcw, Upload, Video } from 'lucide-react'
import { Button, FormError, Spinner } from '@/components/ui'
import { formatBytes } from '@/lib/storage'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/cn'

/**
 * Records a self-tape with the device camera.
 *
 * The result is a real file handed to the caller — the same upload path as a
 * file picked from disk, so a recorded tape and an imported one are the same
 * thing once sent.
 *
 * Everything here degrades honestly: no camera, a refused permission or a
 * browser without MediaRecorder all end on "use the file picker instead"
 * rather than on a button that does nothing.
 */

const MAX_SECONDS = 180

/**
 * How long the sound of a take really lasts. `null` when the browser cannot
 * tell — then we say nothing rather than raise a false alarm.
 */
async function soundSeconds(blob: Blob): Promise<number | null> {
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Context) return null
  const context = new Context()
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer())
    return audio.duration
  } catch {
    return null
  } finally {
    void context.close().catch(() => {})
  }
}

/**
 * The bucket accepts mp4 / quicktime / webm — pick what the browser can make.
 * WebM first: a brief recorded in MP4 (H.264 + AAC) came back with its sound
 * stopping at 0:10 of a 0:26 take, so the transcript stopped there too. MP4
 * stays the fallback for browsers that cannot record WebM.
 */
function pickMimeType(): { mimeType: string; extension: string } | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates = [
    { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
    { mimeType: 'video/mp4', extension: 'mp4' },
  ]
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate.mimeType)) ?? null
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${`${seconds % 60}`.padStart(2, '0')}`
}

export function SelfTapeRecorder({
  onUse,
  onCancel,
  busy,
}: {
  /** Called with the recorded take, ready to upload. */
  onUse: (file: File) => void
  onCancel: () => void
  busy?: boolean
}) {
  const t = useT()
  const frameRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const playbackRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const [phase, setPhase] = useState<'starting' | 'ready' | 'countdown' | 'recording' | 'review'>(
    'starting',
  )
  const [countdown, setCountdown] = useState(3)
  const [elapsed, setElapsed] = useState(0)
  const [take, setTake] = useState<{ file: File; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The sound of the take stops before the picture (microphone lost on the way).
  const [soundCut, setSoundCut] = useState<{ at: number; total: number } | null>(null)
  const startedAtRef = useRef(0)
  const micLostRef = useRef(false)

  const support = pickMimeType()

  // Sur téléphone, le panneau s'ouvre souvent hors écran : on l'amène au centre
  // pour que la caméra et le bouton soient là sans avoir à chercher.
  useEffect(() => {
    frameRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [])

  // ── Camera ──
  useEffect(() => {
    let cancelled = false
    if (!support) {
      setError(t('recorder.unsupported'))
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t('recorder.noCamera'))
      return
    }

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (previewRef.current) {
          previewRef.current.srcObject = stream
          void previewRef.current.play().catch(() => {})
        }
        setPhase('ready')
      })
      .catch((cameraError: DOMException) => {
        if (cancelled) return
        setError(
          cameraError?.name === 'NotAllowedError' ? t('recorder.refused') : t('recorder.noCamera'),
        )
      })

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Release the object URL of a discarded take.
  useEffect(() => () => {
    if (take) URL.revokeObjectURL(take.url)
  }, [take])

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [])

  // ── Timer + hard limit ──
  useEffect(() => {
    if (phase !== 'recording') return
    const timer = setInterval(() => {
      setElapsed((seconds) => {
        if (seconds + 1 >= MAX_SECONDS) stop()
        return seconds + 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [phase, stop])

  // ── 3 · 2 · 1 ──
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown === 0) {
      start()
      return
    }
    const timer = setTimeout(() => setCountdown((value) => value - 1), 800)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, countdown])

  function start() {
    const stream = streamRef.current
    if (!stream || !support) return

    chunksRef.current = []
    const recorder = new MediaRecorder(stream, { mimeType: support.mimeType })
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      // Strip the codec suffix: the bucket only knows the base types.
      const type = support.mimeType.split(';')[0]
      const blob = new Blob(chunksRef.current, { type })
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
      const file = new File([blob], `self-tape-${stamp}.${support.extension}`, { type })
      setTake({ file, url: URL.createObjectURL(blob) })
      setPhase('review')

      // A take whose sound stops early cannot be transcribed past that point:
      // say it now, while recording again costs a few seconds.
      const total = (performance.now() - startedAtRef.current) / 1000
      void soundSeconds(blob).then((sound) => {
        const at = sound ?? (micLostRef.current ? 0 : null)
        if (at !== null && at < total - 2) setSoundCut({ at, total })
      })
    }
    recorder.onerror = () => setError(t('recorder.failed'))

    micLostRef.current = stream.getAudioTracks().length === 0
    stream.getAudioTracks().forEach((track) => {
      track.onended = () => {
        micLostRef.current = true
      }
    })

    recorderRef.current = recorder
    setSoundCut(null)
    startedAtRef.current = performance.now()
    // Hand data over every second: a long take is never held in one buffer.
    recorder.start(1000)
    setElapsed(0)
    setPhase('recording')
  }

  function retake() {
    if (take) URL.revokeObjectURL(take.url)
    setTake(null)
    setSoundCut(null)
    setElapsed(0)
    setCountdown(3)
    setPhase('ready')
    if (previewRef.current && streamRef.current) {
      previewRef.current.srcObject = streamRef.current
      void previewRef.current.play().catch(() => {})
    }
  }

  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <FormError>{error}</FormError>
        <Button variant="secondary" size="sm" className="w-fit" onClick={onCancel}>
          {t('recorder.useFile')}
        </Button>
      </div>
    )
  }

  return (
    <div ref={frameRef} className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-card border border-line bg-black">
        {/* The live camera, then the take once it exists. */}
        <video
          ref={previewRef}
          muted
          playsInline
          className={cn(
            'aspect-[9/16] max-h-[52vh] w-full object-cover sm:aspect-video sm:max-h-none',
            take && 'hidden',
          )}
        />
        {take && (
          <video
            ref={playbackRef}
            src={take.url}
            controls
            playsInline
            className="aspect-[9/16] max-h-[52vh] w-full object-contain sm:aspect-video sm:max-h-none"
          />
        )}

        {phase === 'starting' && (
          <span className="absolute inset-0 flex items-center justify-center gap-2 text-[13px] text-white">
            <Spinner />
            {t('recorder.starting')}
          </span>
        )}

        {phase === 'countdown' && (
          <span className="absolute inset-0 flex items-center justify-center font-display text-[5rem] font-extrabold text-white drop-shadow">
            {countdown === 0 ? t('recorder.go') : countdown}
          </span>
        )}

        {phase === 'recording' && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-signal-no px-2.5 py-1 font-mono text-[12px] font-bold text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            {clock(elapsed)}
          </span>
        )}
      </div>

      {phase === 'review' && take ? (
        <>
          {soundCut && (
            <p className="flex items-start gap-2 rounded-field bg-signal-no/10 p-3 text-[13px] leading-snug text-ink">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-signal-no" />
              {t('recorder.soundCut', { at: clock(Math.floor(soundCut.at)), total: clock(Math.round(soundCut.total)) })}
            </p>
          )}
          <p className="text-[12.5px] text-muted">
            {t('recorder.take', {
              duration: clock(elapsed),
              size: formatBytes(take.file.size),
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy}
              icon={busy ? <Spinner /> : <Upload className="h-3.5 w-3.5" />}
              onClick={() => onUse(take.file)}
            >
              {busy ? t('recorder.sending') : t('recorder.use')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              onClick={retake}
            >
              {t('recorder.retake')}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {phase === 'recording' ? (
            <Button
              size="sm"
              icon={<CircleStop className="h-3.5 w-3.5" />}
              onClick={stop}
            >
              {t('recorder.stop')}
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={phase !== 'ready'}
              icon={<Camera className="h-3.5 w-3.5" />}
              onClick={() => {
                setCountdown(3)
                setPhase('countdown')
              }}
            >
              {t('recorder.start')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
            <Video className="h-3.5 w-3.5" />
            {t('recorder.limit', { minutes: MAX_SECONDS / 60 })}
          </span>
        </div>
      )}
    </div>
  )
}
