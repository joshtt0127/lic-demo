import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { relativeTime } from '@/lib/format'
import { useIntelligenceFeed } from '@/features/intelligence/queries'
import {
  useFeedMotion,
  useIntelligenceTrace,
  useRecentSignals,
  useSignalStream,
  type LiveSignal,
} from '@/features/intelligence/live'
import type { CastingOverview } from '@/features/studio/queries'
import { IntelligenceLivePanel } from '@/studio/IntelligenceLivePanel'

/**
 * Intelligence Live™ — le capot vitré, en version compacte.
 *
 * Trois couches actives et pas une de plus, alignées sur la causalité que le
 * brief pose comme colonne vertébrale : **signal → raisonnement → feed**. Une
 * quatrième colonne aurait tenu dans la largeur ; elle aurait aussi cassé la
 * lecture, parce que trois choses se lisent d'un regard et cinq se parcourent.
 *
 * La bande reste délibérément secondaire. Elle ne doit jamais passer devant une
 * décision qui attend — sur la home elle vient donc **après** la carte de
 * session, et elle occupe une hauteur d'instrument, pas de tableau de bord.
 *
 * Le parti pris visuel : instrumentation scientifique. Des mesures alignées,
 * une typographie mono pour les chiffres, des barres proportionnelles à de
 * vraies durées. Pas de cerveau, pas de constellation, pas de dégradé — la
 * sophistication vient de la précision, et le silence visuel fait partie du
 * design.
 */
export function IntelligenceLive({
  orgId,
  castings,
}: {
  orgId: string | undefined
  castings: CastingOverview[]
}) {
  const [open, setOpen] = useState(false)

  /**
   * Le casting observé par défaut : celui qui a le plus de tapes en attente,
   * sinon le plus récent. C'est le Context Lens du brief — il n'existe pas de
   * pertinence universelle, seulement une pertinence pour un casting donné, et
   * la fenêtre doit toujours dire lequel.
   */
  const focus = useMemo(() => {
    if (castings.length === 0) return undefined
    const byWork = [...castings].sort(
      (a, b) => b.tapesToReview - a.tapesToReview || b.submissions - a.submissions,
    )
    return byWork[0]
  }, [castings])

  const castingId = focus?.casting.id
  const { signals: live, connected } = useSignalStream(orgId)
  const recent = useRecentSignals(orgId)
  const trace = useIntelligenceTrace(castingId)
  const feed = useIntelligenceFeed(castingId)
  const movements = useFeedMotion(feed.data)

  // Le direct passe devant l'historique : un fait qui vient d'arriver prime sur
  // un fait d'hier, même si les deux sont vrais.
  const signals: LiveSignal[] = live.length > 0 ? live : (recent.data ?? [])
  const latest = signals[0]

  /**
   * Une panne se dit, elle ne se déguise pas en zéro.
   *
   * Si la télémétrie ne répond pas, afficher « 0 dans la file » serait faux, et
   * un capot vitré qui montre des chiffres inventés est pire qu'un capot fermé.
   * On l'annonce donc, discrètement — c'est une fenêtre d'observation, pas un
   * parcours critique : elle n'a pas à interrompre le travail pour signaler
   * qu'elle-même est indisponible.
   */
  const unavailable = Boolean(trace.error ?? feed.error ?? recent.error)

  if (!orgId) return null

  /**
   * Pas encore de casting : la fenêtre se montre quand même.
   *
   * Elle renvoyait `null`, donc elle s'évanouissait sans un mot — et une
   * absence silencieuse se lit comme un bug, pas comme un état. Quelqu'un qui
   * vient d'ouvrir son compte cherche alors une fonctionnalité qu'on lui a
   * annoncée et ne la trouve pas.
   *
   * Elle dit donc ce qu'elle attend. C'est aussi plus honnête : il n'y a
   * effectivement rien à observer tant qu'aucun casting n'existe.
   */
  if (!focus) {
    return (
      <section
        aria-label="Intelligence Live"
        className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-card p-4 sm:p-5"
      >
        <div className="flex min-w-0 items-center gap-2">
          <LivePulse connected={false} beating={false} />
          <span className="tech-label text-ink">Intelligence Live</span>
        </div>
        <p className="text-[13px] text-muted">
          Publish a casting and the engine starts working here.
        </p>
      </section>
    )
  }

  return (
    <>
      <section
        aria-label="Intelligence Live"
        className="relative overflow-hidden rounded-panel border border-white/70 bg-[#FBFAF7] p-5 shadow-panel sm:px-7 sm:py-6"
      >
        {/*
          Le halo de la marque, en version instrument.

          « Your session » porte les trois formes du logo en grand ; ici elles
          sont réduites à un souffle en haut à droite. La bande appartient à la
          même famille visuelle sans lui disputer la vedette — elle reste
          secondaire, c'est la contrainte du brief, mais elle cesse d'être une
          fiche administrative grise posée sous une carte vivante.
        */}
        <div aria-hidden className="pointer-events-none absolute right-0 top-0 hidden h-36 w-64 opacity-50 blur-3xl sm:block">
          <div className="absolute right-[34%] top-0 h-24 w-24 rounded-full bg-[#F7D98A]" />
          <div className="absolute right-[6%] top-[30%] h-20 w-20 rounded-full bg-[#AFC6F7]" />
          <div className="absolute bottom-0 right-[52%] h-16 w-16 rounded-full bg-[#F7B3AE]" />
        </div>

        <header className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <LivePulse connected={connected} beating={live.length > 0} />
            <span className="tech-label text-ink">Intelligence Live</span>
            <span className="hidden truncate text-[12px] text-muted sm:inline">
              · {focus.casting.title}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative inline-flex min-h-[32px] items-center gap-1 rounded-full border border-line bg-card px-3 text-[13px] font-semibold text-ink transition-colors hover:border-ink/25 hover:bg-cream"
          >
            See the engine
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </header>

        {/*
          Sur téléphone, une vraie bande.

          Les trois colonnes empilées prenaient 27 % de la hauteur d'écran,
          alors que le brief la veut secondaire — sur mobile, l'espace vertical
          appartient aux décisions qui attendent. Le mesuré passe donc à une
          ligne : la séquence du moteur, et ce qu'elle produit. Le détail reste
          à un tap, dans le panneau.
        */}
        {unavailable && (
          <p role="status" className="text-[12px] text-muted">
            Telemetry is unavailable right now — your castings are unaffected.
          </p>
        )}

        <div className={cn('relative mt-4 flex flex-col gap-2 sm:hidden', unavailable && 'hidden')}>
          <TraceBar steps={trace.data ?? []} loading={trace.isLoading} />
          <p className="truncate text-[12px] text-muted">
            {latest ? latest.label : connected ? 'Listening' : 'Not connected'} ·{' '}
            {feed.data?.length ?? 0} in the queue
          </p>
        </div>

        <div
          className={cn(
            'relative mt-5 hidden gap-6 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.9fr)]',
            unavailable && 'sm:hidden',
          )}
        >
          {/*
            Les trois colonnes suivent le même rythme : une valeur forte, une
            légende en mono. Sans cette grille, l'œil sautait d'un libellé à une
            barre puis à un grand chiffre, et la lecture d'un regard — la seule
            chose qu'on demande à cette bande — ne fonctionnait pas.
          */}
          <Column label="Signal" tone="bg-gold">
            {latest ? (
              <>
                <p className="truncate text-[15px] font-bold leading-tight text-ink">
                  {latest.label}
                </p>
                <p className="truncate font-mono text-[11px] text-muted">
                  {relativeTime(latest.occurredAt)} · {TARGET_LABEL[latest.target]}
                </p>
              </>
            ) : (
              <>
                <p className="text-[15px] font-bold leading-tight text-muted">Quiet</p>
                <p className="font-mono text-[11px] text-muted">
                  {connected ? 'listening' : 'not connected'}
                </p>
              </>
            )}
          </Column>

          <Column label="Reasoning" tone="bg-link">
            <TraceBar steps={trace.data ?? []} loading={trace.isLoading} />
          </Column>

          <Column label="Feed" tone="bg-signal-no">
            {/* Le seul chiffre mis en avant de la bande : ce que l'équipe a
                réellement devant elle. Les millisecondes sont de la télémétrie,
                pas une accroche. */}
            <p className="flex items-baseline gap-1.5 text-[13px] text-muted">
              <span className="font-display text-[19px] font-extrabold leading-tight text-ink">
                {feed.data?.length ?? 0}
              </span>
              in the queue
            </p>
            <p className="truncate font-mono text-[11px] text-muted">
              {movements.length > 0
                ? `${movements.length} position${movements.length > 1 ? 's' : ''} moved`
                : 'steady since you arrived'}
            </p>
          </Column>
        </div>
      </section>

      {open && (
        <IntelligenceLivePanel
          castings={castings}
          initialCastingId={castingId}
          signals={signals}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

const TARGET_LABEL: Record<LiveSignal['target'], string> = {
  talent: 'talent graph',
  production: 'production graph',
  both: 'both graphs',
}

/**
 * Une couche, et sa couleur.
 *
 * Le repère carré reprend les trois couleurs de la marque — jaune, bleu,
 * rouge — et il y a exactement trois couches : signal, raisonnement, feed. La
 * coïncidence est heureuse et la correspondance devient une aide à la lecture
 * plutôt qu'une décoration : chaque couleur désigne toujours la même étape.
 *
 * Les traits de séparation ont disparu au profit de l'espace. Trois colonnes
 * cloisonnées ressemblaient à un tableau ; trois colonnes respirées se lisent
 * comme un instrument.
 */
function Column({
  label,
  tone,
  children,
}: {
  label: string
  tone: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className={cn('h-[7px] w-[7px] rounded-[2px]', tone)} />
        <span className="tech-label text-muted">{label}</span>
      </span>
      {children}
    </div>
  )
}

/**
 * Le point de vie.
 *
 * Il dit deux choses différentes, et c'est ce qui le rend utile plutôt que
 * décoratif. Sa **couleur** est l'état de la connexion : doré quand le direct
 * est établi, gris quand il ne l'est pas — sans quoi un flux silencieux est
 * indiscernable d'un flux cassé. Son **battement** est l'arrivée d'un signal.
 *
 * Il ne clignote jamais en continu : le brief l'interdit, et un point qui
 * s'agite sans raison finit par ne plus rien vouloir dire.
 */
function LivePulse({ connected, beating }: { connected: boolean; beating: boolean }) {
  const reduced = useReducedMotion()
  return (
    <span
      className="relative flex h-2 w-2 shrink-0"
      role="status"
      aria-label={connected ? 'Live connection active' : 'Live connection inactive'}
    >
      {connected && beating && !reduced && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full bg-gold"
          initial={{ opacity: 0.55, scale: 1 }}
          animate={{ opacity: 0, scale: 2.8 }}
          transition={{ duration: 1.9, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <span
        aria-hidden
        className={cn(
          'relative h-2 w-2 rounded-full transition-colors',
          connected ? 'bg-gold' : 'bg-muted/30',
        )}
      />
    </span>
  )
}

const STEP_LABEL: Record<string, string> = {
  context: 'context',
  memory: 'memory',
  discovery: 'discovery',
  feed: 'feed',
}

/**
 * Les quatre étapes du moteur, à l'échelle de leur durée réelle.
 *
 * Les largeurs sont proportionnelles aux millisecondes mesurées en base — donc
 * l'étape la plus coûteuse est visiblement la plus large. C'est ce qui sépare
 * une visualisation d'une décoration : si le calcul change, le dessin change.
 *
 * Un plancher de 8 % par segment, sinon une étape à 2 ms devient un trait
 * invisible et la séquence ne se lit plus comme une séquence.
 */
function TraceBar({
  steps,
  loading,
}: {
  steps: { seq: number; step: string; duration_ms: number }[]
  loading: boolean
}) {
  const reduced = useReducedMotion()
  const total = steps.reduce((sum, step) => sum + Number(step.duration_ms), 0)

  if (loading || steps.length === 0) {
    return (
      <>
        <p className="font-mono text-[13px] text-muted">{loading ? 'measuring…' : 'idle'}</p>
        <div className="h-[7px] w-full rounded-full bg-ink/5" />
      </>
    )
  }

  return (
    <>
      {/*
         La valeur d'abord, la barre en légende.

         Placée au-dessus, la barre décalait la ligne de base de cette colonne :
         les trois valeurs fortes de la bande ne s'alignaient plus, et l'œil
         accrochait sans savoir pourquoi. Même rythme partout — une valeur, puis
         sa légende — et la barre devient ce qu'elle est : un détail de lecture,
         pas un titre.
      */}
      <p className="flex items-baseline gap-1.5 text-[13px] text-muted">
        <span className="font-display text-[19px] font-extrabold leading-tight text-ink">
          {Math.round(total)} ms
        </span>
        {steps.length} steps
      </p>

      <div className="flex h-[7px] w-full gap-[3px] overflow-hidden rounded-full">
        {steps.map((step, index) => {
          const share = total > 0 ? Number(step.duration_ms) / total : 1 / steps.length
          return (
            <motion.span
              key={step.seq}
              title={`${STEP_LABEL[step.step] ?? step.step} · ${step.duration_ms} ms`}
              className={cn('block h-full rounded-full', STEP_TONE[index] ?? 'bg-cream')}
              style={{ flexGrow: Math.max(share, 0.08) }}
              initial={reduced ? false : { scaleX: 0, originX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.35, delay: index * 0.07, ease: 'easeOut' }}
            />
          )
        })}
      </div>

    </>
  )
}

/** Du plus clair au plus dense : la séquence se lit de gauche à droite. */
const STEP_TONE = ['bg-cream', 'bg-gold', 'bg-link/70', 'bg-ink']
