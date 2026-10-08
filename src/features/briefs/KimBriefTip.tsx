import { useState } from 'react'
import { Check, ChevronDown, Play } from 'lucide-react'
import { asset } from '@/lib/asset'
import { cn } from '@/lib/cn'

/**
 * KIM — Casting Production Advisor. Le conseil qu'on écoute juste avant de se
 * filmer : pas de script, dire ce qui compte, et on pourra compléter après.
 *
 * Le texte affiché est exactement celui de la vidéo : la production peut
 * lire au lieu d'écouter, et les points de la cible (projet ou rôle) servent
 * d'aide-mémoire pendant l'enregistrement.
 */

const VIDEO = '/kim/kim-brief-tips.mp4'
const POSTER = '/kim/kim-brief-tips.jpg'
const DURATION = '0:44'

const POINTS = {
  project: [
    'What you’re making',
    'The world and the tone',
    'Where and when you’re shooting',
    'Your audition deadline and compensation',
    'Anything talent should know before applying',
  ],
  role: [
    'Who the character is',
    'What you’re really looking for in the performance',
    'Playing age, language or skills — if they matter',
    'What you want to see in the self-tape',
  ],
}

export function KimBriefTip({ target, compact }: { target: 'project' | 'role'; compact?: boolean }) {
  const [playing, setPlaying] = useState(false)
  const [open, setOpen] = useState(!compact)

  return (
    <div className="overflow-hidden rounded-field border border-line bg-paper">
      <div className={cn('flex gap-3.5', compact ? 'items-center p-3' : 'flex-col p-4')}>
        {/* La vidéo de Kim — lue sur place, jamais en autoplay */}
        <div
          className={cn(
            'relative shrink-0 overflow-hidden rounded-btn bg-ink',
            compact ? 'h-[60px] w-[96px]' : 'aspect-video w-full',
          )}
        >
          {playing ? (
            <video
              src={asset(VIDEO)}
              poster={asset(POSTER)}
              controls
              autoPlay
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label="Play Kim’s tip"
              className="group absolute inset-0"
            >
              <img src={asset(POSTER)} alt="" className="h-full w-full object-cover" />
              <span className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
              <span
                className={cn(
                  'absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-lg transition-transform group-hover:scale-110',
                  compact ? 'h-7 w-7' : 'h-12 w-12',
                )}
              >
                <Play className={cn('translate-x-px fill-current', compact ? 'h-3 w-3' : 'h-5 w-5')} />
              </span>
              {!compact && (
                <span className="absolute bottom-2.5 right-2.5 rounded-full bg-black/50 px-2 py-0.5 font-mono text-[11px] text-white">
                  {DURATION}
                </span>
              )}
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold text-ink">
            KIM
            <span className="ml-1.5 font-normal text-muted">Casting Production Advisor · Let It Cast</span>
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-ink/85">
            Quick tip before you record: don’t overthink it. No script, no need to sound perfect.
          </p>
          {compact && (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink"
            >
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
              {open ? 'Hide the tips' : 'What to say'}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className={cn('border-t border-line', compact ? 'px-3 py-3' : 'px-4 pb-4 pt-3')}>
          <span className="tech-label">
            {target === 'project' ? 'For your Project Brief, tell us' : 'For each Role Brief, tell us'}
          </span>
          <ul className="mt-2 flex flex-col gap-1.5">
            {POINTS[target].map((point) => (
              <li key={point} className="flex gap-2 text-[13px] leading-snug text-ink/85">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal-good" />
                {point}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
            Be specific about what matters. Leave out what doesn’t. If you forget something, don’t start
            over — you can always add it after. Talk to talent like they’re already in the room with you.
          </p>
        </div>
      )}
    </div>
  )
}
