import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Check,
  Globe,
  Lock,
  Mic,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Video,
} from 'lucide-react'
import { Button, FormError, Spinner } from '@/components/ui'
import { FileDropzone, UploadProgress } from '@/components/upload/FileDropzone'
import { SelfTapeRecorder } from '@/components/upload/SelfTapeRecorder'
import { useMediaMutations } from '@/features/talent/queries'
import { useBriefMutations } from '@/features/briefs/queries'
import { ExtractionReview } from '@/features/briefs/ExtractionReview'
import { KimBriefTip } from '@/features/briefs/KimBriefTip'
import { CASTING_FIELDS, type Accepted } from '@/features/briefs/mapping'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { EnglishOnly } from '@/lib/i18n'
import type { BriefExtractionRow, BriefVisibility } from '@/types/database'

/**
 * Le geste central de Brief Once. Launch Everywhere™ : la production se filme
 * (ou dépose une vidéo existante), Let It Cast écoute, propose les champs, la
 * production valide. Elle passe de la saisie à la relecture.
 *
 * Ce composant ne sait pas OÙ la vidéo s'enregistre (le projet peut ne pas
 * exister encore) : il remonte la vidéo par `onVideo` et les champs validés
 * par `onApply`. Il ne fait jamais d'écriture « en aveugle » dans un
 * formulaire : tout passe par l'écran de validation.
 */

export const VISIBILITY_OPTIONS: {
  value: BriefVisibility
  label: string
  hint: string
  icon: typeof Lock
}[] = [
  { value: 'internal', label: 'Team only', hint: 'Your production team.', icon: Lock },
  { value: 'applicants', label: 'Talents', hint: 'Everyone who can see the casting.', icon: Users },
  { value: 'public', label: 'Public', hint: 'Also on the public share link.', icon: Globe },
]

export type BriefVideoValue = { url: string; visibility: BriefVisibility }

export function BriefStudio({
  target,
  orgId,
  profileId,
  video,
  onVideo,
  onVisibility,
  onRemove,
  onApply,
  title,
  compact,
}: {
  target: 'project' | 'role'
  orgId: string | undefined
  profileId: string | undefined
  /** La vidéo déjà posée (ou en attente d'enregistrement), sinon null. */
  video: BriefVideoValue | null
  onVideo: (input: { url: string; mediaAssetId: string; durationS: number | null }) => void | Promise<void>
  onVisibility?: (visibility: BriefVisibility) => void
  onRemove?: () => void
  /** Champs validés par la production — l'appelant les verse dans son formulaire. */
  onApply: (accepted: Accepted) => void
  title?: string
  compact?: boolean
}) {
  const media = useMediaMutations(profileId)
  const briefs = useBriefMutations()
  const playerRef = useRef<HTMLVideoElement>(null)

  const [mode, setMode] = useState<'idle' | 'record'>('idle')
  const [percent, setPercent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [extraction, setExtraction] = useState<BriefExtractionRow | null>(null)
  // Où sont partis les champs validés : le formulaire visible, ou l'étape suivante.
  const [applied, setApplied] = useState<{ here: number; next: number } | null>(null)

  const analysing = briefs.extract.isPending
  const busy = percent !== null || analysing

  async function analyse(url: string) {
    if (!orgId) return
    setExtraction(null)
    setApplied(null)
    try {
      const result = await briefs.extract.mutateAsync({ orgId, target, videoUrl: url })
      setExtraction(result)
    } catch (extractError) {
      setError(errorMessage(extractError, 'We could not analyse this brief'))
    }
  }

  async function take(file: File) {
    setError(null)
    setMode('idle')
    setPercent(0)
    try {
      const asset = await media.upload.mutateAsync({ kind: 'brief', file, onProgress: setPercent })
      setPercent(null)
      await onVideo({ url: asset.url, mediaAssetId: asset.id, durationS: asset.duration_s })
      await analyse(asset.url)
    } catch (uploadError) {
      setError(errorMessage(uploadError, 'Could not send the video'))
    } finally {
      setPercent(null)
    }
  }

  function seek(seconds: number) {
    const player = playerRef.current
    if (!player) return
    player.currentTime = Math.max(0, seconds - 0.5)
    void player.play().catch(() => {})
    player.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const heading = title ?? (target === 'project' ? 'Project Brief Video™' : 'Role Brief Video™')

  return (
    <section
      className={cn(
        'flex flex-col gap-4 rounded-card border border-line bg-card',
        compact ? 'p-4' : 'p-5',
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="tech-label inline-flex items-center gap-1.5">
            <Video className="h-3.5 w-3.5" />
            {heading}
          </span>
          <p className={cn('mt-1 text-ink', compact ? 'text-[14px]' : 'text-[15px] font-semibold')}>
            {target === 'project'
              ? 'Say it once — we fill the casting from what you say.'
              : 'Brief this role on camera — we fill its criteria for you.'}
          </p>
        </div>
        {video && !busy && (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              onClick={() => setMode('record')}
            >
              Replace
            </Button>
            {onRemove && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={onRemove}
              >
                Remove
              </Button>
            )}
          </div>
        )}
      </header>

      {error && <FormError>{error}</FormError>}

      {mode === 'record' ? (
        <EnglishOnly>
          <SelfTapeRecorder onUse={(file) => void take(file)} onCancel={() => setMode('idle')} busy={busy} />
        </EnglishOnly>
      ) : video ? (
        <div className={cn('grid gap-4', !compact && 'lg:grid-cols-[minmax(0,1fr)_240px]')}>
          <video
            ref={playerRef}
            src={video.url}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full rounded-field bg-ink object-contain"
          />
          {onVisibility && (
            <div className="flex flex-col gap-2">
              <span className="tech-label">Who sees this brief</span>
              {VISIBILITY_OPTIONS.map(({ value, label, hint, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onVisibility(value)}
                  className={cn(
                    'flex items-start gap-2.5 rounded-field border p-2.5 text-left transition-colors',
                    video.visibility === value
                      ? 'border-ink/30 bg-paper'
                      : 'border-line hover:border-ink/20',
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                  <span>
                    <span className="block text-[13px] font-bold text-ink">{label}</span>
                    <span className="block text-[12px] leading-snug text-muted">{hint}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={cn('grid gap-4', !compact && 'md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]')}>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode('record')}
              className="flex items-center gap-3 rounded-field bg-ink px-4 py-3.5 text-left text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
                <Mic className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-[14.5px] font-bold">Record your brief</span>
                <span className="block text-[12.5px] text-white/70">Camera and mic, up to 3 minutes</span>
              </span>
            </button>
            <FileDropzone
              kind="brief"
              compact
              disabled={busy}
              onFile={(file) => void take(file)}
              onError={setError}
              label="Or drop an existing video"
            />
          </div>
          <div className="flex flex-col gap-2">
            <KimBriefTip target={target} compact={compact} />
            <p className="text-[12px] text-muted">
              Anything you do not say stays empty — we never guess a date or a fee.
            </p>
          </div>
        </div>
      )}

      {percent !== null && (
        <div className="flex flex-col gap-1.5">
          <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink">
            <Upload className="h-3.5 w-3.5" /> Sending your brief
          </span>
          <UploadProgress percent={percent} />
        </div>
      )}

      {analysing && (
        <motion.div
          initial={false}
          animate={{ opacity: 1 }}
          className="flex items-center gap-3 rounded-field bg-cream/60 px-4 py-3"
        >
          <Spinner />
          <span className="text-[13.5px] text-ink">
            <strong>Listening to your brief</strong> — transcribing, then mapping what you said to
            the casting. About half a minute.
          </span>
        </motion.div>
      )}

      {video && !busy && !extraction && mode === 'idle' && (
        <button
          type="button"
          onClick={() => void analyse(video.url)}
          className="inline-flex items-center gap-2 self-start rounded-btn px-1 text-[13px] font-semibold text-link hover:underline"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Fill the {target === 'project' ? 'casting' : 'role'} from this brief
        </button>
      )}

      {extraction?.status === 'failed' && (
        <div className="flex flex-wrap items-center gap-3">
          <FormError>{extraction.error ?? 'The analysis failed'}</FormError>
          {video && (
            <Button size="sm" variant="secondary" onClick={() => void analyse(video.url)}>
              Try again
            </Button>
          )}
        </div>
      )}

      {extraction?.status === 'ready' && !applied && (
        <ExtractionReview
          extraction={extraction}
          onSeek={seek}
          onApply={(accepted) => {
            onApply(accepted)
            const keys = Object.keys(accepted)
            const next = target === 'project' ? keys.filter((key) => CASTING_FIELDS.has(key)).length : 0
            setApplied({ here: keys.length - next, next })
          }}
        />
      )}

      {applied && (
        <p className="inline-flex items-start gap-2 text-[13px] font-semibold text-signal-good">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {applied.here > 0 && `${applied.here} field${applied.here > 1 ? 's' : ''} added below`}
            {applied.here > 0 && applied.next > 0 && ' · '}
            {applied.next > 0 &&
              `${applied.next} casting call field${applied.next > 1 ? 's' : ''} waiting in the next step`}
            {applied.here + applied.next === 0 && 'Nothing was selected'}
            {applied.here + applied.next > 0 && ' — review them before you continue.'}
          </span>
        </p>
      )}
    </section>
  )
}
