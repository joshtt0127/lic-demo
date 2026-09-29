import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { IntelligenceFeedRow, IntelligenceTraceStep } from '@/types/database'

/**
 * Intelligence Live™ — la couche de données du capot vitré.
 *
 * Une règle gouverne tout ce fichier : **rien n'est simulé**. Pas de signal
 * inventé pour remplir le flux, pas de milliseconde décorative, pas de
 * mouvement de feed rejoué en boucle pour faire joli.
 *
 * Ce n'est pas du purisme. Le widget a un seul but — rendre l'intelligence
 * *digne de confiance* — et une animation qui ment produit exactement l'inverse
 * le jour où quelqu'un ouvre la console et compare. Un moteur sous verre dont
 * on découvre qu'il tourne à vide ne discrédite pas l'animation, il discrédite
 * le moteur.
 *
 * Les trois sources sont donc réelles :
 *   · Signal Stream  → `events` en Realtime, filtré par les policies existantes
 *   · Reasoning Trace → `intelligence_trace()`, chronométré en base
 *   · Feed in Motion  → le vrai écart de `queue_rank` entre deux calculs
 */

// ── Signal Stream ──────────────────────────────────────────────────────────

/** Ce qu'un fait enrichit. C'est le « Dual Capture » du mémo, rendu visible. */
export type SignalTarget = 'talent' | 'production' | 'both'

export type LiveSignal = {
  id: number
  type: string
  label: string
  target: SignalTarget
  subjectId: string | null
  occurredAt: string
  /** Horodatage local de réception, pour faire vieillir la ligne à l'écran. */
  receivedAt: number
}

/**
 * Le vocabulaire du flux.
 *
 * Les libellés traduisent un type technique en geste de casting — `SHORTLISTED`
 * devient « Shortlist signal added ». Un type inconnu n'est pas affiché plutôt
 * que rendu brut : un flux qui laisse passer `CASTING_UPDATED` en majuscules
 * ressemble à un journal de développeur, et le brief demande l'inverse.
 */
const SIGNALS: Record<string, { label: string; target: SignalTarget }> = {
  APPLICATION_SUBMITTED: { label: 'New audition contextualized', target: 'talent' },
  SELF_TAPE_SUBMITTED: { label: 'Self-tape received', target: 'talent' },
  SELF_TAPE_REPLACED: { label: 'Self-tape replaced', target: 'talent' },
  SUBMISSION_OPENED: { label: 'Audition opened', target: 'production' },
  SUBMISSION_REVIEWED: { label: 'Review recorded', target: 'production' },
  SHORTLISTED: { label: 'Shortlist signal added', target: 'both' },
  CALLBACK_REQUESTED: { label: 'Callback recorded', target: 'both' },
  CALLBACK_CHANGE_REQUESTED: { label: 'Callback rescheduled', target: 'talent' },
  CAST: { label: 'Cast decision recorded', target: 'both' },
  PASSED: { label: 'Pass recorded', target: 'production' },
  APPLICATION_WITHDRAWN: { label: 'Application withdrawn', target: 'talent' },
  CASTING_INVITED: { label: 'Talent invited', target: 'production' },
  AUDITION_OPENED: { label: 'Attention signal', target: 'production' },
  AUDITION_COMPLETED: { label: 'Tape watched in full', target: 'production' },
  AUDITION_REWATCHED: { label: 'Tape revisited', target: 'production' },
  PROFILE_VIEWED: { label: 'Profile consulted', target: 'production' },
}

export function signalLabel(type: string): { label: string; target: SignalTarget } | null {
  return SIGNALS[type] ?? null
}

/** Combien de lignes le flux garde en mémoire. Au-delà, personne ne lit. */
const STREAM_DEPTH = 8

/**
 * Les faits qui entrent dans la mémoire, au moment où ils y entrent.
 *
 * On ne s'abonne à rien tant qu'il n'y a pas d'organisation : un canal Realtime
 * ouvert sur une session sans contexte ne recevrait rien et coûterait une
 * connexion.
 *
 * Les policies de `events` font tout le filtrage — Realtime les applique à
 * chaque diffusion. Il n'y a donc pas de `filter` à écrire ici, et surtout
 * aucune fuite possible si quelqu'un s'abonne largement depuis la console.
 */
export function useSignalStream(orgId: string | undefined): LiveSignal[] {
  const [signals, setSignals] = useState<LiveSignal[]>([])

  useEffect(() => {
    if (!orgId) return
    setSignals([])

    const channel = supabase
      .channel(`intelligence-live-${orgId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, (payload) => {
        const row = payload.new as {
          id: number
          type: string
          subject_id: string | null
          occurred_at: string
        }
        const known = signalLabel(row.type)
        if (!known) return
        setSignals((current) =>
          [
            {
              id: row.id,
              type: row.type,
              label: known.label,
              target: known.target,
              subjectId: row.subject_id,
              occurredAt: row.occurred_at,
              receivedAt: Date.now(),
            },
            ...current,
          ].slice(0, STREAM_DEPTH),
        )
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [orgId])

  return signals
}

/**
 * Les derniers faits déjà enregistrés, pour que le flux ne démarre pas vide.
 *
 * Sans ça, un widget ouvert un jour calme afficherait « rien » pendant plusieurs
 * minutes — ce qui est honnête mais donne l'impression d'un système éteint. On
 * amorce donc avec l'historique récent, marqué comme tel par son horodatage
 * réel : ce sont de vrais faits, simplement pas de cette seconde.
 */
export function useRecentSignals(orgId: string | undefined) {
  return useQuery({
    queryKey: ['intelligence-live', 'recent', orgId],
    queryFn: async (): Promise<LiveSignal[]> => {
      const { data, error } = await supabase
        .from('events')
        .select('id, type, subject_id, occurred_at')
        .in('type', Object.keys(SIGNALS))
        .order('occurred_at', { ascending: false })
        .limit(STREAM_DEPTH)
      if (error) throw error
      return (data ?? []).flatMap((row) => {
        const known = signalLabel(row.type)
        if (!known) return []
        return [
          {
            id: row.id,
            type: row.type,
            label: known.label,
            target: known.target,
            subjectId: row.subject_id,
            occurredAt: row.occurred_at,
            receivedAt: new Date(row.occurred_at).getTime(),
          },
        ]
      })
    },
    enabled: Boolean(orgId),
    staleTime: 30_000,
  })
}

// ── Reasoning Trace ────────────────────────────────────────────────────────

/**
 * Ce que le moteur fait, étape par étape, avec les durées mesurées en base.
 *
 * Rafraîchi à la demande plutôt qu'en boucle : chaque appel refait réellement
 * le calcul complet, et une trace qui tournerait toutes les trois secondes
 * ferait travailler la base pour une animation. Le widget la redemande quand un
 * signal arrive — donc quand elle a une chance d'avoir changé.
 */
export function useIntelligenceTrace(castingId: string | undefined) {
  return useQuery({
    queryKey: ['intelligence-live', 'trace', castingId],
    queryFn: async (): Promise<IntelligenceTraceStep[]> => {
      const { data, error } = await supabase.rpc('intelligence_trace', {
        p_casting: castingId as string,
      })
      if (error) throw error
      return data ?? []
    },
    enabled: Boolean(castingId),
    staleTime: 15_000,
  })
}

// ── Feed in Motion ─────────────────────────────────────────────────────────

export type FeedMovement = {
  applicationId: string
  roleName: string
  band: string
  /** Positif = remonté dans la file. Négatif = descendu. */
  delta: number
  from: number
  to: number
  reasons: IntelligenceFeedRow['reasons']
}

/**
 * Ce qui a bougé dans le Feed, et de combien.
 *
 * Le mouvement se calcule côté client, en comparant deux calculs successifs.
 * L'alternative — stocker chaque position en base à chaque recomposition —
 * écrirait une table d'historique entière pour une information qui n'a de sens
 * que pendant la session de travail en cours.
 *
 * Conséquence assumée : au premier chargement il n'y a aucun mouvement à
 * montrer, puisqu'il n'existe pas de « avant ». Le widget dit alors l'ordre
 * actuel plutôt que d'inventer un changement.
 */
export function useFeedMotion(feed: IntelligenceFeedRow[] | undefined) {
  const previous = useRef<Map<string, number> | null>(null)
  const [movements, setMovements] = useState<FeedMovement[]>([])

  const signature = useMemo(
    () => (feed ?? []).map((row) => `${row.application_id}:${row.band}:${row.queue_rank}`).join('|'),
    [feed],
  )

  useEffect(() => {
    if (!feed) return

    // L'ordre absolu, toutes bandes confondues : c'est ce que l'œil perçoit
    // comme « remonté », pas le rang à l'intérieur d'une bande.
    const ranked = [...feed].sort(
      (a, b) => a.band_rank - b.band_rank || Number(a.queue_rank) - Number(b.queue_rank),
    )
    const current = new Map(ranked.map((row, index) => [row.application_id, index + 1]))

    if (previous.current) {
      const moved: FeedMovement[] = []
      for (const row of ranked) {
        const before = previous.current.get(row.application_id)
        const after = current.get(row.application_id)!
        if (before === undefined || before === after) continue
        moved.push({
          applicationId: row.application_id,
          roleName: row.role_name,
          band: row.band,
          delta: before - after,
          from: before,
          to: after,
          reasons: row.reasons,
        })
      }
      moved.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      if (moved.length > 0) setMovements(moved.slice(0, 4))
    }

    previous.current = current
    // `signature` suffit : recalculer à chaque nouvelle référence de tableau
    // relancerait l'effet sans qu'aucune position n'ait changé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  return movements
}
