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

  /**
   * Rien à observer : ni candidature dans la file, ni fait enregistré.
   *
   * Volontairement basé sur le feed plutôt que sur un compteur du casting :
   * c'est exactement ce que le panneau montre, donc c'est ce qui doit décider
   * de ce qu'il montre.
   */
  const empty = !feed.isLoading && (feed.data?.length ?? 0) === 0

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
          <header className="sticky top-0 z-10 flex w-full flex-wrap items-center justify-between gap-3 overflow-hidden border-b border-line bg-[#FBFAF7]/95 px-4 py-4 backdrop-blur sm:px-6">
            {/* Le même souffle de couleurs que la bande compacte : c'est ce qui
                fait reconnaître le panneau comme son prolongement, et non comme
                un écran étranger qui s'ouvre par-dessus. */}
            <div
              aria-hidden
              className="pointer-events-none absolute right-0 top-0 hidden h-28 w-56 opacity-45 blur-3xl sm:block"
            >
              <div className="absolute right-[34%] top-0 h-20 w-20 rounded-full bg-[#F7D98A]" />
              <div className="absolute right-[6%] top-[28%] h-16 w-16 rounded-full bg-[#AFC6F7]" />
              <div className="absolute bottom-0 right-[52%] h-14 w-14 rounded-full bg-[#F7B3AE]" />
            </div>
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

          {/*
            Un casting sans candidature n'a pas six blocs à remplir.

            La grille complète affichait alors six zéros alignés — « 0
            trajectoires », « 0 en file », « 0 prêt », « 0 incomplet », « 0 rien
            envoyé » — un cimetière de compteurs qui donne l'impression d'un
            système en panne alors qu'il fonctionne parfaitement : il n'y a
            simplement rien à observer.

            On garde donc la seule chose qui reste vraie et intéressante — la
            trace d'exécution, qui prouve que le moteur a bien tourné — et on
            dit en une phrase ce qui se passera. Une absence expliquée vaut
            mieux qu'une absence chiffrée.
          */}
          {empty ? (
            <div className="flex flex-col gap-6 p-4 sm:p-8">
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <span aria-hidden className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[3px] bg-gold" />
                  <span className="h-2 w-2 rounded-[3px] bg-link" />
                  <span className="h-2 w-2 rounded-[3px] bg-signal-no" />
                </span>
                <h3 className="font-display text-[22px] font-extrabold leading-tight text-ink sm:text-[26px]">
                  Nothing to observe yet
                </h3>
                <p className="max-w-[46ch] text-[14px] leading-relaxed text-muted">
                  The engine ran and found no audition — which is the honest answer when nobody
                  has applied. The moment one arrives, its signal appears here, the memory starts
                  building, and this screen shows you exactly what changed.
                </p>
              </div>

              <Block title="Reasoning trace" hint="The engine did run — here is the proof" tone="bg-link">
                <TraceSteps steps={trace.data ?? []} loading={trace.isLoading} />
              </Block>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)]">
              {/* ── Colonne gauche : ce qui entre, et comment c'est traité ── */}
              <div className="flex flex-col gap-5">
                <Block title="Signal stream" hint="What the system is learning" tone="bg-gold">
                  <SignalList signals={signals} />
                </Block>

                <Block title="Reasoning trace" hint="What it does with it" tone="bg-link">
                  <TraceSteps steps={trace.data ?? []} loading={trace.isLoading} />
                </Block>
              </div>

              {/* ── Centre de gravité ── */}
              <div className="flex flex-col gap-5">
                <Block
                  title="Feed in motion"
                  hint="What changed for you, and why"
                  tone="bg-signal-no"
                  emphasis
                >
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
          )}

          <footer className="border-t border-line px-4 py-3 text-[11px] text-muted sm:px-6">
            {/* Sur un casting vide, le moteur ne renvoie pas de version — il n'a
                rien calculé à versionner. Afficher « engine — » donnait un tiret
                orphelin qui ressemblait à une valeur manquante ; on tait la
                mention plutôt que d'exhiber son absence. */}
            {detail.get('feed')?.engine_version ? (
              <>
                <span className="font-mono">
                  engine {String(detail.get('feed')?.engine_version)}
                </span>
                {' · '}
              </>
            ) : null}
            Every number on this screen is measured, never simulated.
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── Briques ────────────────────────────────────────────────────────────────

/**
 * Un bloc du panneau.
 *
 * `tone` reprend le repère carré de la bande compacte : jaune pour le signal,
 * bleu pour le raisonnement, rouge pour le feed. La même couleur désigne
 * toujours la même couche, de la carte compacte au panneau — c'est ce qui
 * permet de passer de l'une à l'autre sans relire les titres.
 */
function Block({
  title,
  hint,
  tone,
  emphasis,
  children,
}: {
  title: string
  hint: string
  tone?: string
  emphasis?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-3.5 rounded-card border border-line bg-card p-5',
        // Le centre de gravité se tient par la surface, pas par une couleur
        // criarde : une bordure plus dense, un fond légèrement à part, et une
        // hauteur minimale qui l'empêche de se replier à la taille d'une note
        // quand rien n'a encore bougé.
        emphasis && 'min-h-[170px] border-ink/20 bg-cream/30 p-6',
      )}
    >
      <div className="flex flex-col gap-0.5">
        <h3 className="tech-label flex items-center gap-1.5 text-ink">
          {tone && <span aria-hidden className={cn('h-[7px] w-[7px] rounded-[2px]', tone)} />}
          {title}
        </h3>
        {/* L'intention sous le titre plutôt qu'à côté : accolée, elle se lisait
            comme la suite du titre et les deux se brouillaient. */}
        <span className="text-[12px] leading-snug text-muted">{hint}</span>
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
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink">
            {step.duration_ms} ms
          </span>
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
        <p className="font-display text-[48px] font-extrabold leading-none tabular-nums text-ink">
          {queueSize}
        </p>
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
      {/* `tabular-nums` : sans lui, un 1 et un 4 n'ont pas la même largeur et
          deux chiffres côte à côte cessent d'être alignés d'une carte à
          l'autre. C'est invisible tant qu'on ne l'a pas vu, et impossible à
          ignorer ensuite. */}
      <p className="font-display text-[32px] font-extrabold leading-none tabular-nums text-ink">
        {value}
      </p>
      <p className="text-[13px] font-semibold text-ink">{unit}</p>
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
      <div className="flex flex-wrap gap-x-5 gap-y-2">
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
      <span className="font-display text-[19px] font-extrabold tabular-nums text-ink">{value}</span>
      <span className="text-[12px] text-muted">{label}</span>
    </span>
  )
}
