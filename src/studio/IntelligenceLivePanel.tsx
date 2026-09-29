import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { relativeTime } from '@/lib/format'
import { FormError, SelectInput } from '@/components/ui'
import { errorMessage } from '@/lib/supabase'
import { useIntelligenceFeed } from '@/features/intelligence/queries'
import { explainReason } from '@/features/intelligence/reasons'
import {
  useFeedMotion,
  useIntelligenceTrace,
  type FeedMovement,
  type LiveSignal,
} from '@/features/intelligence/live'
import type { CastingOverview } from '@/features/studio/queries'
import type { IntelligenceTraceStep } from '@/types/database'

/**
 * Intelligence Live™ — le panneau étendu.
 *
 * La chorégraphie suit la causalité que le brief pose comme colonne vertébrale :
 * les signaux entrent à gauche, le raisonnement les traite en dessous, et le
 * résultat occupe le centre. **Feed in Motion est le centre de gravité** — pas
 * une visualisation parmi six de même poids, mais la plus grande surface de
 * l'écran, parce que c'est le seul endroit où l'intelligence devient produit.
 *
 * Ce que ce panneau ne fait pas, volontairement :
 *   · aucune commande. C'est une baie vitrée, pas un second poste de pilotage —
 *     ajouter un bouton d'action ici dupliquerait le Command Center et diluerait
 *     la seule chose que la fenêtre doit produire : la compréhension ;
 *   · aucun réseau de nœuds flottants. Le brief interdit la constellation
 *     gratuite, et un graphe illisible ne prouve pas l'intelligence, il la
 *     maquille. Les deux Graphs sont donc rendus par leurs **nombres réels**.
 */
export function IntelligenceLivePanel({
  castings,
  initialCastingId,
  signals,
  onClose,
}: {
  castings: CastingOverview[]
  initialCastingId: string | undefined
  /**
   * Le flux arrive **par la carte**, il n'est pas rouvert ici.
   *
   * Les deux composants ouvraient un canal Realtime du même nom, et Supabase
   * refuse d'ajouter des écouteurs à un canal déjà souscrit : ouvrir le panneau
   * faisait tomber l'écran entier. Au-delà du bug, deux abonnements pour la
   * même donnée, c'était une connexion de trop — une seule source, passée en
   * prop, et le direct reste partagé.
   */
  signals: LiveSignal[]
  onClose: () => void
}) {
  const reduced = useReducedMotion()
  const [castingId, setCastingId] = useState(initialCastingId)

  const trace = useIntelligenceTrace(castingId)
  const feed = useIntelligenceFeed(castingId)
  const movements = useFeedMotion(feed.data)

  const focus = castings.find((item) => item.casting.id === castingId)

  // Échap ferme : une fenêtre d'observation dont on ne sort qu'à la souris
  // devient une fenêtre dont on n'ose plus s'approcher.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const detail = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>()
    for (const step of trace.data ?? []) map.set(step.step, step.detail)
    return map
  }, [trace.data])

  return (
    <AnimatePresence>
      <motion.div
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-label="Intelligence Live"
          className="flex max-h-[92vh] w-full max-w-[1100px] flex-col overflow-y-auto rounded-t-[28px] border border-line bg-card sm:max-h-[88vh] sm:rounded-[28px]"
        >
          {/* ── Context Lens ── */}
          <header className="sticky top-0 z-10 flex w-full flex-wrap items-center justify-between gap-3 border-b border-line bg-card/95 px-4 py-4 backdrop-blur sm:px-6">
            {/*
              Sur téléphone, le titre prend sa ligne et les commandes la
              suivante. En une seule rangée, le sélecteur de casting écrasait la
              croix de fermeture hors de l'écran — une fenêtre dont on ne peut
              plus sortir au doigt.
            */}
            <div className="w-full min-w-0 sm:w-auto">
              <span className="tech-label text-ink">Intelligence Live</span>
              <p className="mt-1 text-[13px] text-muted">
                The intelligence working for this casting, right now.
              </p>
            </div>

            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
              <SelectInput
                aria-label="Casting observed"
                value={castingId ?? ''}
                onChange={(event) => setCastingId(event.target.value)}
                className="min-w-0 flex-1 sm:w-[210px] sm:flex-none"
              >
                {castings.map((item) => (
                  <option key={item.casting.id} value={item.casting.id}>
                    {item.casting.title}
                  </option>
                ))}
              </SelectInput>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-paper hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/*
            Le Context Lens en une phrase. C'est le principe le plus important de
            l'architecture, et il tient en une ligne : il n'existe pas de
            classement universel des talents, seulement une pertinence pour un
            casting donné. Changer de casting ci-dessus recompose tout ce qui
            suit — c'est la démonstration, pas l'explication.
          */}
          <p className="border-b border-line bg-paper px-4 py-2 text-[12px] text-muted sm:px-6">
            No universal ranking — this queue exists for{' '}
            <span className="font-semibold text-ink">{focus?.casting.title ?? 'this casting'}</span>{' '}
            only. Change the casting and the whole queue is recomputed.
          </p>

          {/* Même règle que la carte : une panne se nomme, elle ne se déguise
              pas en compteurs à zéro. */}
          {(trace.error || feed.error) && (
            <div className="px-4 pt-4 sm:px-6">
              <FormError>
                {errorMessage(trace.error ?? feed.error, 'Telemetry is unavailable right now')}
              </FormError>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            {/* ── Colonne gauche : ce qui entre, et comment c'est traité ── */}
            <div className="flex flex-col gap-5">
              <Block title="Signal stream" hint="What the system is learning">
                <SignalList signals={signals} />
              </Block>

              <Block title="Reasoning trace" hint="What it does with it">
                <TraceSteps steps={trace.data ?? []} loading={trace.isLoading} />
              </Block>
            </div>

            {/* ── Centre de gravité ── */}
            <div className="flex flex-col gap-5">
              <Block title="Feed in motion" hint="What changed for you, and why" emphasis>
                <FeedMotionList
                  movements={movements}
                  queueSize={feed.data?.length ?? 0}
                  loading={feed.isLoading}
                />
              </Block>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Block title="Talent graph" hint="Trajectories in play">
                  <GraphFigure
                    value={Number(detail.get('memory')?.trajectories ?? 0)}
                    unit="trajectories"
                    note={`${Number(detail.get('memory')?.talents ?? 0)} talents in this casting`}
                  />
                </Block>
                <Block title="Production graph" hint="Your own decisions">
                  <GraphFigure
                    value={Number(detail.get('feed')?.priority ?? 0)}
                    unit="need a decision"
                    note={`${Number(detail.get('feed')?.positions ?? 0)} positions in the queue`}
                  />
                </Block>
              </div>

              <Block title="Discovery live" hint="Submissions the system has never seen">
                <DiscoveryFigures detail={detail.get('discovery')} />
              </Block>
            </div>
          </div>

          <footer className="border-t border-line px-4 py-3 text-[11px] text-muted sm:px-6">
            <span className="font-mono">
              engine {String(detail.get('feed')?.engine_version ?? '—')}
            </span>
            {' · '}
            Every number on this screen is measured, never simulated.
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── Briques ────────────────────────────────────────────────────────────────

function Block({
  title,
  hint,
  emphasis,
  children,
}: {
  title: string
  hint: string
  emphasis?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-3 rounded-card border p-4',
        // Le centre de gravité se tient par la surface, pas par une couleur
      // criarde : un fond légèrement distinct, une bordure plus dense, et une
      // hauteur minimale qui l'empêche de se replier à la taille d'une note
      // quand rien n'a encore bougé.
      emphasis ? 'min-h-[150px] border-ink/15 bg-paper p-5' : 'border-line bg-card',
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="tech-label text-ink">{title}</h3>
        <span className="text-[12px] text-muted">{hint}</span>
      </div>
      {children}
    </section>
  )
}

const TARGET_LABEL: Record<LiveSignal['target'], string> = {
  talent: 'Talent graph',
  production: 'Production graph',
  both: 'Both graphs',
}

/**
 * Le battement du système.
 *
 * Chaque ligne dit ce qui est arrivé et **ce que ça enrichit** — c'est le Dual
 * Capture du mémo rendu littéral : une décision, deux graphes. Sans cette
 * seconde information, le flux serait un journal ; avec elle, il montre la
 * mémoire se construire.
 */
function SignalList({ signals }: { signals: LiveSignal[] }) {
  const reduced = useReducedMotion()
  if (signals.length === 0) {
    return <p className="text-[13px] text-muted">No signal recorded yet.</p>
  }
  return (
    <ul className="flex flex-col">
      <AnimatePresence initial={false}>
        {signals.map((signal) => (
          <motion.li
            key={signal.id}
            layout={!reduced}
            initial={reduced ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-0"
          >
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-ink">
                {signal.label}
              </span>
              <span className="block font-mono text-[11px] text-muted">
                {TARGET_LABEL[signal.target]}
              </span>
            </span>
            <span className="shrink-0 font-mono text-[11px] text-muted">
              {relativeTime(signal.occurredAt)}
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}

const STEP_TITLE: Record<string, string> = {
  context: 'Understanding the casting',
  memory: 'Retrieving relevant memory',
  discovery: 'Checking what is submitted',
  feed: 'Recomputing the feed',
}

/** Une séquence, pas un tableau : une étape s'active, se mesure, passe la main. */
function TraceSteps({ steps, loading }: { steps: IntelligenceTraceStep[]; loading: boolean }) {
  const reduced = useReducedMotion()
  if (loading) return <p className="font-mono text-[12px] text-muted">measuring…</p>
  if (steps.length === 0) return <p className="text-[13px] text-muted">Nothing to compute.</p>

  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => (
        <motion.li
          key={step.seq}
          initial={reduced ? false : { opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: index * 0.08, ease: 'easeOut' }}
          className="flex items-baseline justify-between gap-3 border-l-2 border-line py-1.5 pl-3"
        >
          <span className="min-w-0">
            <span className="block truncate text-[13px] text-ink">
              {STEP_TITLE[step.step] ?? step.step}
            </span>
            <span className="block truncate font-mono text-[11px] text-muted">
              {summarise(step)}
            </span>
          </span>
          <span className="shrink-0 font-mono text-[11px] text-ink">{step.duration_ms} ms</span>
        </motion.li>
      ))}
    </ol>
  )
}

/** Le détail d'une étape, réduit à ce qui se lit d'un regard. */
function summarise(step: IntelligenceTraceStep): string {
  const d = step.detail as Record<string, unknown>
  switch (step.step) {
    case 'context':
      return `${Number(d.roles ?? 0)} role${Number(d.roles ?? 0) > 1 ? 's' : ''}`
    case 'memory':
      return `${Number(d.trajectories ?? 0)} trajectories · ${Number(d.talents ?? 0)} talents`
    case 'discovery':
      return `${Number(d.ready ?? 0)} ready · ${Number(d.partial ?? 0)} partial · ${Number(d.thin ?? 0)} thin`
    case 'feed':
      return `${Number(d.positions ?? 0)} positions · ${Number(d.priority ?? 0)} priority`
    default:
      return ''
  }
}

/**
 * Ce qui a bougé, et pourquoi.
 *
 * Au premier affichage il n'y a rien à montrer, et c'est dit franchement plutôt
 * que masqué par une animation : il n'existe pas de « avant » à comparer. Le
 * panneau annonce alors la taille de la file, qui est une information vraie.
 */
function FeedMotionList({
  movements,
  queueSize,
  loading,
}: {
  movements: FeedMovement[]
  queueSize: number
  loading: boolean
}) {
  const reduced = useReducedMotion()
  if (loading) return <p className="font-mono text-[12px] text-muted">computing…</p>

  if (movements.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <p className="font-display text-[44px] font-extrabold leading-none text-ink">{queueSize}</p>
        <p className="text-[14px] text-muted">
          auditions in this queue · nothing has moved since you opened this screen
        </p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {movements.map((move) => (
          <motion.li
            key={move.applicationId}
            layout={!reduced}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="flex flex-col gap-1 rounded-btn border border-line bg-card p-3"
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1 font-mono text-[12px] font-bold',
                  move.delta > 0 ? 'text-signal-good' : 'text-muted',
                )}
              >
                {move.delta > 0 ? (
                  <ArrowUp className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDown className="h-3.5 w-3.5" />
                )}
                {Math.abs(move.delta)}
              </span>
              <span className="min-w-0 truncate text-[13px] font-semibold text-ink">
                {move.roleName}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[11px] text-muted">
                now #{move.to}
              </span>
            </div>
            {move.reasons.length > 0 && (
              <p className="text-[12px] leading-snug text-muted">
                {explainReason(move.reasons[0])}
              </p>
            )}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}

function GraphFigure({ value, unit, note }: { value: number; unit: string; note: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-display text-[26px] font-extrabold leading-none text-ink">{value}</p>
      <p className="text-[13px] text-ink">{unit}</p>
      <p className="font-mono text-[11px] text-muted">{note}</p>
    </div>
  )
}

/**
 * Discovery, en clair.
 *
 * Trois états de **dossier**, jamais de personne : un dossier « thin » ne dit
 * rien d'un comédien, il dit qu'il manque une tape. Le libellé le rappelle,
 * parce qu'un compteur nu à côté d'un mot comme « thin » se lit vite de travers.
 */
function DiscoveryFigures({ detail }: { detail: Record<string, unknown> | undefined }) {
  const ready = Number(detail?.ready ?? 0)
  const partial = Number(detail?.partial ?? 0)
  const thin = Number(detail?.thin ?? 0)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-4">
        <Figure value={ready} label="ready to watch" tone="bg-signal-good" />
        <Figure value={partial} label="incomplete" tone="bg-signal-maybe" />
        <Figure value={thin} label="nothing sent yet" tone="bg-muted/40" />
      </div>
      <p className="text-[12px] text-muted">
        These check the submission — the file, the tape, the declared criteria. Never the person.
      </p>
    </div>
  )
}

function Figure({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', tone)} />
      <span className="font-display text-[17px] font-extrabold text-ink">{value}</span>
      <span className="text-[12px] text-muted">{label}</span>
    </span>
  )
}
