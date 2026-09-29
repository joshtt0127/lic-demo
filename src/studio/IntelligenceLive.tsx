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
  const live = useSignalStream(orgId)
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
          <LivePulse active={false} />
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
        className="flex flex-col gap-4 rounded-card border border-line bg-card p-4 sm:p-5"
      >
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <LivePulse active={live.length > 0} />
            <span className="tech-label text-ink">Intelligence Live</span>
            <span className="hidden truncate text-[12px] text-muted sm:inline">
              · {focus.casting.title}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-btn px-2 text-[13px] font-semibold text-muted transition-colors hover:bg-paper hover:text-ink"
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

        <div className={cn('flex flex-col gap-2 sm:hidden', unavailable && 'hidden')}>
          <TraceBar steps={trace.data ?? []} loading={trace.isLoading} />
          <p className="truncate text-[12px] text-muted">
            {latest ? latest.label : 'Nothing new yet'} · {feed.data?.length ?? 0} in the queue
          </p>
        </div>

        <div
          className={cn(
            'hidden gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.9fr)] sm:gap-5',
            unavailable && 'sm:hidden',
          )}
        >
          <Column label="Signal">
            {latest ? (
              <>
                <p className="truncate text-[13px] font-semibold text-ink">{latest.label}</p>
                <p className="font-mono text-[11px] text-muted">
                  {relativeTime(latest.occurredAt)} · {TARGET_LABEL[latest.target]}
                </p>
              </>
            ) : (
              <p className="text-[13px] text-muted">Nothing new yet</p>
            )}
          </Column>

          <Column label="Reasoning">
            <TraceBar steps={trace.data ?? []} loading={trace.isLoading} />
          </Column>

          <Column label="Feed">
            <p className="text-[13px] font-semibold text-ink">
              {feed.data?.length ?? 0} in the queue
            </p>
            <p className="font-mono text-[11px] text-muted">
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

function Column({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-t border-line pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0 sm:first:border-l-0 sm:first:pl-0">
      <span className="tech-label text-muted">{label}</span>
      {children}
    </div>
  )
}

/**
 * La pulsation du direct.
 *
 * Elle ne tourne pas en permanence : un point qui clignote sans arrêt est du
 * bruit, et le brief l'interdit explicitement. Il bat quand un signal arrive,
 * puis se calme. Un mouvement, une signification.
 */
function LivePulse({ active }: { active: boolean }) {
  const reduced = useReducedMotion()
  return (
    <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
      {active && !reduced && (
        <motion.span
          className="absolute inset-0 rounded-full bg-signal-good"
          initial={{ opacity: 0.5, scale: 1 }}
          animate={{ opacity: 0, scale: 2.6 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <span
        className={cn(
          'relative h-2 w-2 rounded-full',
          active ? 'bg-signal-good' : 'bg-muted/40',
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
        <div className="h-[6px] w-full rounded-full bg-paper" />
        <p className="font-mono text-[11px] text-muted">{loading ? 'measuring…' : 'idle'}</p>
      </>
    )
  }

  return (
    <>
      <div className="flex h-[6px] w-full gap-[2px] overflow-hidden rounded-full">
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
      <p className="truncate font-mono text-[11px] text-muted">
        {steps.map((step) => `${STEP_LABEL[step.step] ?? step.step} ${step.duration_ms}ms`).join(' · ')}
      </p>
    </>
  )
}

/** Du plus clair au plus dense : la séquence se lit de gauche à droite. */
const STEP_TONE = ['bg-cream', 'bg-gold/60', 'bg-gold', 'bg-ink']
