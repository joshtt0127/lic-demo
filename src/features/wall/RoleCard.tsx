import { forwardRef, type DragEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronDown, Clapperboard, Film, GripVertical, Play } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatSeconds } from '@/features/review/ReviewCard'
import type { StillState } from './stills'
import type { WallRole } from './order'

/**
 * Une carte du mur = un rôle.
 *
 * Rôle pourvu : le nom du personnage, une grande image tirée de l'audition du
 * comédien retenu, son nom et le petit menu qui permet d'en changer.
 * Rôle ouvert : la carte reste vide — pas de silhouette, pas d'image de
 * remplacement — et porte l'action « Choose an Actor » avec les chiffres réels
 * des auditions. Un rôle ouvert n'est pas une donnée manquante, c'est une
 * décision qui reste à prendre.
 */

export function auditionStats(role: Pick<WallRole, 'auditions' | 'interesting'>) {
  const auditions = `${role.auditions} audition${role.auditions === 1 ? '' : 's'}`
  return role.auditions === 0 ? auditions : `${auditions} · ${role.interesting} interesting`
}

export const INTERESTING_DEFINITION =
  'Interesting = distinct candidates with at least one Yes or Maybe from your casting team. Human ratings only, never an Intelligence Feed™ rank.'

/** L'image d'une audition, recadrée sans déformation ; un fond neutre sinon. */
export function AuditionStill({
  state,
  alt,
  className,
  imgClassName,
}: {
  state: StillState | undefined
  alt: string
  className?: string
  imgClassName?: string
}) {
  if (state?.status === 'ready') {
    return (
      <img
        src={state.still.url}
        alt={alt}
        draggable={false}
        className={cn('h-full w-full object-cover object-[50%_30%]', imgClassName)}
      />
    )
  }
  if (state?.status === 'unavailable') {
    return (
      <div className={cn('flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#ECEAE4] text-muted', className)}>
        <Film className="h-5 w-5 opacity-60" aria-hidden />
        <span className="px-3 text-center text-[11px] font-medium">Still unavailable</span>
      </div>
    )
  }
  return (
    <div className={cn('flex h-full w-full items-center justify-center bg-[#ECEAE4]', className)}>
      <span className="sr-only">Preparing the audition still</span>
      <Film className="h-5 w-5 animate-pulse text-muted/50" aria-hidden />
    </div>
  )
}

export type RoleCardProps = {
  role: WallRole
  /** Position dans l'ordre affiché (01, 02…). */
  position: number
  still: StillState | undefined
  showStats: boolean
  canEdit: boolean
  /** Mode arrangement : poignée, flèches, glisser-déposer. */
  arranging: boolean
  isFirst: boolean
  isLast: boolean
  dropHint: 'before' | 'after' | null
  presentation?: boolean
  onChoose: () => void
  onOpenAudition: () => void
  onOpenMenu: (anchor: HTMLElement) => void
  onMove: (delta: -1 | 1) => void
  onDragStart: (event: DragEvent<HTMLElement>) => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
}

export const RoleCard = forwardRef<HTMLElement, RoleCardProps>(function RoleCard(
  {
    role,
    position,
    still,
    showStats,
    canEdit,
    arranging,
    isFirst,
    isLast,
    dropHint,
    presentation,
    onChoose,
    onOpenAudition,
    onOpenMenu,
    onMove,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
  },
  ref,
) {
  const selected = Boolean(role.application_id)
  const confirmed = role.application_status === 'cast'
  const duration = formatSeconds(role.duration_s)

  return (
    <article
      ref={ref}
      data-role-id={role.role_id}
      draggable={arranging}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      aria-label={`${role.name}${selected ? `, ${role.actor_name}` : ', open role'}`}
      className={cn(
        'group/card relative flex flex-col rounded-card border bg-card p-2.5 transition-[box-shadow,transform,border-color] duration-200 sm:p-3',
        presentation ? 'border-white/10 shadow-none' : 'border-line shadow-card',
        !arranging && !presentation && 'hover:-translate-y-0.5 hover:shadow-card-hover',
        arranging && 'cursor-grab active:cursor-grabbing',
        dropHint && 'border-ink/30',
      )}
    >
      {dropHint && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-y-4 w-1 rounded-full bg-ink',
            dropHint === 'before' ? '-left-[9px]' : '-right-[9px]',
          )}
        />
      )}

      <header className="flex items-start justify-between gap-2 px-1 pb-2.5 pt-0.5">
        <h3
          className={cn(
            'min-w-0 font-display font-extrabold leading-tight tracking-[-0.015em] text-ink',
            presentation ? 'text-[clamp(15px,1.35vw,22px)]' : 'text-[15px] sm:text-[17px]',
          )}
        >
          <span className="line-clamp-2">{role.name}</span>
        </h3>
        {arranging ? (
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
        ) : (
          <span className="mt-1 shrink-0 font-mono text-[10.5px] tabular-nums text-muted/70">
            {String(position).padStart(2, '0')}
          </span>
        )}
      </header>

      {/* L'image : même proportion pour toutes les cartes, recadrage sans déformation. */}
      <div className="relative aspect-[4/5] overflow-hidden rounded-[16px]">
        {selected ? (
          <button
            type="button"
            onClick={onOpenAudition}
            disabled={arranging}
            className="group/still block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/40"
            aria-label={`Watch ${role.actor_name}'s audition for ${role.name}`}
          >
            <AuditionStill
              state={role.self_tape_id ? still : { status: 'pending' }}
              alt={`${role.actor_name} — audition still for ${role.name}`}
              imgClassName="transition-transform duration-500 group-hover/still:scale-[1.025]"
            />
            {!arranging && (
              <span className="pointer-events-none absolute bottom-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-ink/70 px-2.5 py-1 text-[11px] font-semibold text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover/still:opacity-100 group-focus-visible/still:opacity-100">
                <Play className="h-3 w-3 fill-current" aria-hidden />
                Watch{duration ? ` · ${duration}` : ''}
              </span>
            )}
          </button>
        ) : (
          <EmptySlot role={role} canEdit={canEdit} showStats={showStats} disabled={arranging} presentation={presentation} onChoose={onChoose} />
        )}

        {confirmed && (
          <span className="pointer-events-none absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink shadow-sm">
            <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
            Cast
          </span>
        )}
      </div>

      {selected && (
        <footer className="px-1 pt-2.5">
          <div className="flex min-w-0 items-center gap-1">
            <p
              className={cn(
                'min-w-0 truncate font-semibold text-ink',
                presentation ? 'text-[clamp(13px,1.05vw,17px)]' : 'text-[14px] sm:text-[15px]',
              )}
            >
              {role.actor_name}
            </p>
            {!presentation && !arranging && (
              <button
                type="button"
                onClick={(event) => onOpenMenu(event.currentTarget)}
                aria-haspopup="dialog"
                aria-label={`Selection options for ${role.name}`}
                className="-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            )}
          </div>
          {showStats && (
            <p className="mt-0.5 font-mono text-[11px] text-muted" title={INTERESTING_DEFINITION}>
              {auditionStats(role)}
            </p>
          )}
        </footer>
      )}

      {arranging && canEdit && (
        <div className="mt-2.5 flex items-center justify-between gap-2 px-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={isFirst}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-card text-ink transition-colors hover:bg-paper disabled:opacity-30"
            aria-label={`Move ${role.name} earlier`}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="font-mono text-[11px] text-muted">{String(position).padStart(2, '0')}</span>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={isLast}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-card text-ink transition-colors hover:bg-paper disabled:opacity-30"
            aria-label={`Move ${role.name} later`}
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </article>
  )
})

function EmptySlot({
  role,
  canEdit,
  showStats,
  disabled,
  presentation,
  onChoose,
}: {
  role: WallRole
  canEdit: boolean
  showStats: boolean
  disabled: boolean
  presentation?: boolean
  onChoose: () => void
}) {
  const none = role.auditions === 0
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-3 rounded-[16px] border-[1.5px] border-dashed px-3 text-center',
        presentation ? 'border-ink/15 bg-paper' : 'border-ink/[0.12] bg-[#FAF9F6]',
      )}
    >
      {presentation ? (
        <span className="tech-label">To be cast</span>
      ) : none ? (
        <>
          <Clapperboard className="h-5 w-5 text-muted/60" aria-hidden />
          <div>
            <p className="text-[13px] font-semibold text-ink">No auditions yet</p>
            <p className="mt-0.5 font-mono text-[11px] text-muted">0 auditions</p>
          </div>
          <button
            type="button"
            onClick={onChoose}
            disabled={disabled}
            className="text-[12.5px] font-semibold text-link hover:underline disabled:opacity-40"
          >
            Open the casting
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onChoose}
            disabled={disabled}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-btn bg-ink px-4 text-[13.5px] font-semibold text-white shadow-sm transition-all hover:bg-ink/90 active:scale-[0.98] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/25 focus-visible:ring-offset-2"
          >
            {canEdit ? 'Choose an Actor' : 'View auditions'}
          </button>
          {showStats && (
            <p className="font-mono text-[11px] leading-snug text-muted" title={INTERESTING_DEFINITION}>
              {auditionStats(role)}
            </p>
          )}
        </>
      )}
    </div>
  )
}
