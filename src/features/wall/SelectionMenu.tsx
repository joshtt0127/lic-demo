import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronDown, ExternalLink, History, Play, X } from 'lucide-react'
import { Avatar } from '@/components/ui'
import { APPLICATION_STATUS_LABEL, relativeTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { WallCandidate, WallHistoryEntry } from '@/data/repositories/wall'
import { useSelectionHistory, useWallCandidates } from './queries'
import { useTapeStills } from './stills'
import { AuditionStill } from './RoleCard'
import type { WallRole } from './order'

/**
 * Le petit menu sous le nom du comédien retenu.
 *
 * Ce qu'il permet, sans quitter le mur : revoir l'audition, comparer avec les
 * autres candidats considérés pour ce rôle (image de leur audition, nom, avis
 * de l'équipe), en poser un autre — par une action explicite —, vider la
 * carte, relire l'historique des choix, et pour qui en a le droit, confirmer
 * le casting. Remplacer quelqu'un n'efface rien : ni son audition, ni les
 * votes, ni l'historique.
 */

const PANEL_WIDTH = 360
const VISIBLE_ALTERNATIVES = 6

export function personName(person: { first_name: string | null; last_name: string | null } | null | undefined) {
  if (!person) return 'Someone'
  return [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || 'Someone'
}

/** « 2 Yes · 1 Maybe » — l'avis de l'équipe, en mots, jamais en score. */
export function ratingSummary(candidate: Pick<WallCandidate, 'good_count' | 'maybe_count' | 'no_count'>) {
  const parts = [
    candidate.good_count ? `${candidate.good_count} Yes` : null,
    candidate.maybe_count ? `${candidate.maybe_count} Maybe` : null,
    candidate.no_count ? `${candidate.no_count} No` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Not rated yet'
}

/** Les candidats considérés d'abord (au moins un Yes ou un Maybe), puis les autres. */
export function rankAlternatives(candidates: WallCandidate[], currentApplicationId: string | null) {
  return candidates
    .filter((candidate) => candidate.application_id !== currentApplicationId)
    .sort(
      (a, b) =>
        Number(b.good_count + b.maybe_count > 0) - Number(a.good_count + a.maybe_count > 0) ||
        b.good_count - a.good_count ||
        b.maybe_count - a.maybe_count ||
        a.no_count - b.no_count ||
        a.name.localeCompare(b.name),
    )
}

export function SelectionMenu({
  role,
  anchor,
  orgId,
  profileId,
  canEdit,
  canDecide,
  busy,
  onClose,
  onWatch,
  onPlace,
  onClear,
  onConfirm,
  onOpenQueue,
}: {
  role: WallRole
  anchor: HTMLElement
  orgId: string | undefined
  profileId: string | undefined
  canEdit: boolean
  canDecide: boolean
  busy: boolean
  onClose: () => void
  onWatch: (target: { applicationId: string; selfTapeId: string | null; name: string }) => void
  onPlace: (candidate: WallCandidate) => void
  onClear: () => void
  onConfirm: () => void
  onOpenQueue: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number } | null>(null)
  const [sheet, setSheet] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  const candidates = useWallCandidates(role.role_id)
  const history = useSelectionHistory(role.role_id)
  const alternatives = useMemo(
    () => rankAlternatives(candidates.data ?? [], role.application_id),
    [candidates.data, role.application_id],
  )
  const shown = showAll ? alternatives : alternatives.slice(0, VISIBLE_ALTERNATIVES)
  const stills = useTapeStills(
    shown.map((candidate) => candidate.self_tape_id),
    { orgId, profileId },
  )
  const lastChange = history.data?.[0]

  // Position : sous le nom si la place le permet, au-dessus sinon ; en feuille
  // basse sur téléphone.
  useLayoutEffect(() => {
    const place = () => {
      const small = window.innerWidth < 640
      setSheet(small)
      if (small) return setPosition(null)
      const rect = anchor.getBoundingClientRect()
      const left = Math.max(12, Math.min(window.innerWidth - PANEL_WIDTH - 12, rect.right - PANEL_WIDTH + 8))
      const below = window.innerHeight - rect.bottom - 16
      const above = rect.top - 16
      if (below >= 360 || below >= above) {
        setPosition({ left, top: rect.bottom + 6, maxHeight: Math.max(240, below) })
      } else {
        setPosition({ left, bottom: window.innerHeight - rect.top + 6, maxHeight: Math.max(240, above) })
      }
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        anchor.focus()
      }
    }
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !anchor.contains(target)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [anchor, onClose])

  const confirmed = role.application_status === 'cast'

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`${role.name} — selection`}
      tabIndex={-1}
      style={
        sheet || !position
          ? undefined
          : { left: position.left, top: position.top, bottom: position.bottom, maxHeight: position.maxHeight, width: PANEL_WIDTH }
      }
      className={cn(
        'z-[120] flex flex-col overflow-hidden border border-line bg-card text-left shadow-panel outline-none',
        sheet ? 'fixed inset-x-0 bottom-0 max-h-[85dvh] rounded-t-[28px]' : 'fixed rounded-[22px]',
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 pb-3 pt-4">
        <div className="min-w-0">
          <p className="tech-label">On the Wall · {role.name}</p>
          <p className="mt-1 truncate font-display text-[17px] font-extrabold tracking-[-0.01em] text-ink">
            {role.actor_name}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {confirmed ? 'Casting confirmed' : 'Provisional selection'}
            {lastChange && lastChange.new_application_id === role.application_id
              ? ` · ${personName(lastChange.changer)}, ${relativeTime(lastChange.changed_at)}`
              : role.selected_at
                ? ` · ${relativeTime(role.selected_at)}`
                : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="grid grid-cols-2 gap-2 px-4 pt-3">
          <button
            type="button"
            onClick={() =>
              role.application_id &&
              onWatch({ applicationId: role.application_id, selfTapeId: role.self_tape_id, name: role.actor_name ?? '' })
            }
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-btn bg-ink text-[13px] font-semibold text-white hover:bg-ink/90"
          >
            <Play className="h-3.5 w-3.5 fill-current" aria-hidden /> Watch audition
          </button>
          <button
            type="button"
            onClick={onOpenQueue}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-btn border border-line bg-card text-[13px] font-semibold text-ink hover:bg-paper"
          >
            Review queue <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <section className="px-4 pb-2 pt-4" aria-label="Alternative candidates">
          <div className="flex items-baseline justify-between">
            <h4 className="tech-label">Alternatives</h4>
            {alternatives.length > 0 && (
              <span className="font-mono text-[11px] text-muted">{alternatives.length}</span>
            )}
          </div>

          {candidates.isLoading ? (
            <div className="mt-2 flex flex-col gap-2">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-[60px] animate-pulse rounded-[14px] bg-paper" />
              ))}
            </div>
          ) : candidates.isError ? (
            <p className="mt-2 text-[13px] text-signal-no">The other auditions could not be loaded.</p>
          ) : alternatives.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted">No other submitted audition for this role yet.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {shown.map((candidate) => (
                <li key={candidate.application_id} className="flex items-center gap-3 rounded-[14px] p-1.5 hover:bg-paper">
                  <button
                    type="button"
                    onClick={() =>
                      onWatch({
                        applicationId: candidate.application_id,
                        selfTapeId: candidate.self_tape_id,
                        name: candidate.name,
                      })
                    }
                    className="relative h-[56px] w-[45px] shrink-0 overflow-hidden rounded-[10px]"
                    aria-label={`Watch ${candidate.name}'s audition`}
                  >
                    <AuditionStill state={stills[candidate.self_tape_id]} alt={`${candidate.name} — audition still`} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{candidate.name}</p>
                    <p className="truncate text-[12px] text-muted">
                      {ratingSummary(candidate)}
                      {['shortlisted', 'callback', 'offer', 'cast'].includes(candidate.status)
                        ? ` · ${APPLICATION_STATUS_LABEL[candidate.status]}`
                        : ''}
                    </p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => onPlace(candidate)}
                      disabled={busy}
                      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-line bg-card px-3 text-[12px] font-semibold text-ink transition-colors hover:border-ink/25 hover:bg-paper disabled:opacity-40"
                    >
                      Place <ArrowRight className="h-3 w-3" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {alternatives.length > VISIBLE_ALTERNATIVES && (
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="mt-1 text-[12.5px] font-semibold text-link hover:underline"
            >
              {showAll ? 'Show fewer' : `Show all ${alternatives.length}`}
            </button>
          )}
        </section>

        <section className="border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={() => setHistoryOpen((value) => !value)}
            aria-expanded={historyOpen}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="inline-flex items-center gap-1.5 tech-label">
              <History className="h-3.5 w-3.5" aria-hidden /> Selection history
            </span>
            <ChevronDown className={cn('h-4 w-4 text-muted transition-transform', historyOpen && 'rotate-180')} />
          </button>
          {historyOpen && <HistoryList entries={history.data} loading={history.isLoading} />}
        </section>
      </div>

      {(canDecide || canEdit) && (
        <div className="flex items-center justify-between gap-2 border-t border-line bg-[#FBFAF7] px-4 py-3">
          {canEdit ? (
            <button
              type="button"
              onClick={onClear}
              disabled={busy}
              className="text-[13px] font-semibold text-signal-no hover:underline disabled:opacity-40"
            >
              Clear selection
            </button>
          ) : (
            <span />
          )}
          {canDecide &&
            (confirmed ? (
              <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-signal-good">
                <Check className="h-3.5 w-3.5" aria-hidden /> Cast confirmed
              </span>
            ) : (
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                title="The Wall shows provisional choices. Confirming casting sets this audition to Cast."
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-gold px-3.5 text-[12.5px] font-bold text-ink hover:brightness-95 disabled:opacity-40"
              >
                Confirm casting
              </button>
            ))}
        </div>
      )}
    </div>
  )

  return (
    <>
      {sheet && <div className="fixed inset-0 z-[110] bg-ink/30" aria-hidden onClick={onClose} />}
      {panel}
    </>
  )
}

export function HistoryList({ entries, loading }: { entries: WallHistoryEntry[] | undefined; loading: boolean }) {
  if (loading) return <div className="mt-2 h-12 animate-pulse rounded-[12px] bg-paper" />
  if (!entries || entries.length === 0) {
    return <p className="mt-2 text-[13px] text-muted">No change recorded yet.</p>
  }
  return (
    <ol className="mt-2 flex flex-col gap-2.5">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-start gap-2.5">
          <Avatar src={entry.changer?.avatar_url ?? undefined} name={personName(entry.changer)} size="xs" />
          <div className="min-w-0 text-[12.5px] leading-snug">
            <p className="text-ink">
              {entry.previous_name ? <span className="text-muted line-through decoration-muted/40">{entry.previous_name}</span> : <span className="text-muted">Empty</span>}
              <span className="mx-1.5 text-muted">→</span>
              {entry.new_name ? <span className="font-semibold">{entry.new_name}</span> : <span className="text-muted">Cleared</span>}
            </p>
            <p className="text-[11.5px] text-muted">
              {personName(entry.changer)} · {relativeTime(entry.changed_at)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
