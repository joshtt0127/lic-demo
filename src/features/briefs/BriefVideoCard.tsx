import { useState } from 'react'
import { Play } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/cn'

/** 63 → « 1:03 ». */
export function formatDuration(seconds: number | null | undefined) {
  if (!seconds || !Number.isFinite(seconds)) return null
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Un brief vidéo présenté comme une vraie vidéo, pas comme un bouton.
 *
 * La vignette est une image de la vidéo elle-même (le casting director face
 * caméra) : aucune image inventée, rien à téléverser en plus. Un geste lance
 * la lecture sur place, dans le même cadre.
 */
export function BriefVideoCard({
  url,
  durationS,
  kind,
  title,
  castingDirector,
  size = 'card',
  className,
  playing: playingProp,
  onPlay,
}: {
  url: string
  durationS: number | null
  kind: 'project' | 'role'
  title: string
  castingDirector?: string | null
  size?: 'hero' | 'card'
  className?: string
  /** Lecture pilotée de l'extérieur (le parcours d'audition lance la vidéo). */
  playing?: boolean
  onPlay?: () => void
}) {
  const t = useT()
  const [playingState, setPlayingState] = useState(false)
  const playing = playingProp ?? playingState
  const play = () => {
    setPlayingState(true)
    onPlay?.()
  }
  const [measured, setMeasured] = useState<number | null>(null)
  const duration = formatDuration(durationS ?? measured)
  const hero = size === 'hero'

  if (playing) {
    return (
      <div className={cn('relative overflow-hidden bg-black', className)}>
        <video
          src={url}
          controls
          autoPlay
          playsInline
          className="absolute inset-0 h-full w-full object-contain"
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={play}
      aria-label={t('brief.play', { title })}
      className={cn('group relative block w-full overflow-hidden bg-ink text-left text-white', className)}
    >
      {/* La première seconde de la vidéo sert d'affiche. */}
      <video
        src={`${url}#t=1`}
        muted
        playsInline
        preload="metadata"
        tabIndex={-1}
        aria-hidden="true"
        onLoadedMetadata={(event) => setMeasured(event.currentTarget.duration)}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10"
      />

      <span
        className={cn(
          'absolute left-4 top-4 rounded-full bg-black/45 px-3 py-1 font-semibold uppercase tracking-label text-white/90 backdrop-blur-md',
          hero ? 'text-[11px] sm:left-6 sm:top-6' : 'text-[10px]',
        )}
      >
        {kind === 'project' ? t('brief.project.badge') : t('brief.role.badge')}
      </span>

      <span
        aria-hidden="true"
        className={cn(
          'absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)] transition-transform duration-300 group-hover:scale-110',
          hero ? 'h-20 w-20 sm:h-24 sm:w-24' : 'h-14 w-14',
        )}
      >
        <Play className={cn('translate-x-[2px] fill-current', hero ? 'h-8 w-8 sm:h-9 sm:w-9' : 'h-6 w-6')} />
      </span>

      <span
        className={cn(
          'absolute inset-x-0 bottom-0 flex items-end justify-between gap-4',
          hero ? 'p-5 sm:p-7' : 'p-4',
        )}
      >
        <span className="min-w-0">
          <span
            className={cn(
              'block font-display font-extrabold leading-tight tracking-[-0.02em]',
              hero ? 'text-[1.35rem] sm:text-[2rem]' : 'text-[1.05rem]',
            )}
          >
            {title}
          </span>
          {castingDirector && (
            <span className={cn('mt-1 block text-white/75', hero ? 'text-[13px] sm:text-[14px]' : 'text-[12px]')}>
              {t('brief.withCastingDirector', { name: castingDirector })}
            </span>
          )}
        </span>
        {duration && (
          <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 font-mono text-[12px] tabular-nums backdrop-blur-md">
            {duration}
          </span>
        )}
      </span>
    </button>
  )
}
