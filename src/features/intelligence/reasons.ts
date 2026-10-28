import type { AttentionBand, AttentionReason, SubmissionReadiness } from '@/types/database'

/**
 * « Why this surfaced », en anglais comme tout le studio.
 *
 * Chaque phrase est écrite à partir des nombres que la base a renvoyés — jamais
 * un texte générique choisi au hasard pour faire joli. Si une raison ne peut
 * pas être dite avec ses chiffres, c'est que la règle qui l'a produite n'est
 * pas explicable, et une règle inexplicable n'a rien à faire dans le feed.
 */

/** 38.4 h → « 2 days ». Les heures ne se lisent plus au-delà d'une journée. */
function duration(hours: number): string {
  if (hours < 1) return 'less than an hour'
  if (hours < 48) {
    const rounded = Math.round(hours)
    return `${rounded} hour${rounded === 1 ? '' : 's'}`
  }
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}

function times(count: number): string {
  return count === 1 ? 'once' : `${count} times`
}

export function explainReason(reason: AttentionReason): string {
  switch (reason.code) {
    case 'deadline_close':
      return `The deadline is in ${duration(reason.hours_left)}`
    case 'overdue':
      return `Waiting ${duration(reason.waiting_hours)} — your team usually decides within ${duration(reason.usual_hours)}`
    case 'worked_with_you':
      return `You cast this talent ${times(reason.times)} before`
    case 'called_back_before':
      return `You called this talent back ${times(reason.times)} before`
    case 'shortlisted_before':
      return `You shortlisted this talent ${times(reason.times)} before`
    /**
     * « A pass is not a failure » — dit comme un fait sur ce que l'ÉQUIPE a
     * fait, jamais comme un avis sur le comédien : combien de votes, combien
     * d'étiquettes, sur quel casting de la maison.
     */
    case 'passed_but_noted': {
      const where =
        reason.castings > 1
          ? `${reason.castings} of your castings${reason.project ? ` (last: “${reason.project}”)` : ''}`
          : reason.project
            ? `“${reason.project}”`
            : 'one of your castings'
      const what = [
        reason.good_votes > 0 ? `${reason.good_votes} good vote${reason.good_votes === 1 ? '' : 's'}` : null,
        reason.labels > 0 ? `${reason.labels} positive label${reason.labels === 1 ? '' : 's'}` : null,
      ]
        .filter(Boolean)
        .join(' and ')
      return `Passed on ${where} after ${what || 'a positive note'} from your team`
    }
    case 'team_waiting':
      return reason.votes === 1
        ? 'A teammate voted and nobody has decided'
        : `${reason.votes} teammates voted and nobody has decided`
    case 'rewatched':
      return `Your team went back to this tape ${times(reason.times)}`
    case 'watched_fully':
      return 'Your team watched this tape to the end'
    case 'new_to_you':
      return 'New to your team — you have never reviewed this talent'
    case 'tape_ready':
      return reason.quality === null
        ? 'Self-tape ready to watch'
        : `Self-tape ready to watch — technical check ${reason.quality}/100`
    case 'complete_submission':
      return 'Complete submission: note and headshot'
    case 'never_opened':
      return `Nobody has opened this one yet — waiting ${duration(reason.waiting_hours)}`

    /**
     * Le Talent Graph, formulé comme un fait extérieur.
     *
     * « Cast by 2 other productions » dit ce qui s'est passé ailleurs et laisse
     * l'équipe en tirer ce qu'elle veut. « Highly rated » dirait ce qu'il faut
     * en penser — et ce serait un score déguisé en phrase. La formulation
     * compte autant que le calcul : c'est elle que l'utilisateur lit.
     *
     * Jamais *quelles* productions : un compte est une information de casting,
     * une liste est une information concurrentielle.
     */
    case 'cast_elsewhere':
      return reason.productions === 1
        ? 'Cast by another production'
        : `Cast by ${reason.productions} other productions`
    case 'called_back_elsewhere':
      return reason.productions === 1
        ? 'Called back by another production'
        : `Called back by ${reason.productions} other productions`

    case 'submission_ready':
      return `Submission ready to watch — ${reason.met} of ${reason.applicable} checks met`
    case 'submission_partial':
      return `Submission incomplete — ${reason.met} of ${reason.applicable} checks met`
  }
}

/**
 * L'état d'un dossier, en clair.
 *
 * Le libellé porte le mot « submission » à dessein : sans lui, « Partial »
 * collé sous un nom se lit comme un jugement sur la personne. C'est le dossier
 * qui est incomplet, et un dossier se complète.
 */
export const READINESS_LABEL: Record<SubmissionReadiness, string> = {
  ready: 'Submission ready',
  partial: 'Submission incomplete',
  thin: 'Nothing to watch yet',
}

/** Les vérifications du Discovery Signal, nommées pour un humain. */
export const CHECK_LABEL: Record<string, string> = {
  self_tape: 'Self-tape sent',
  tape_usable: 'Technically usable',
  has_audio: 'Audio track present',
  note: 'Note to the team',
  headshot: 'Headshot attached',
  age_fits: 'Playing age matches the role',
  languages_fit: 'Speaks a required language',
  skills_fit: 'Has a required skill',
  brief_echoed: 'Answers the brief',
}

/**
 * Ce que chaque bande dit, et pourquoi elle existe.
 *
 * Le sous-titre compte autant que le titre : sans lui, « Discovery » se lit
 * comme une catégorie de second choix, alors que c'est exactement l'inverse —
 * c'est la bande qui empêche le produit de ne montrer que des visages connus.
 */
export const BAND_LABEL: Record<AttentionBand, string> = {
  priority: 'Priority review',
  discovery: 'Discovery',
  all: 'All applicants',
}

export const BAND_DESCRIPTION: Record<AttentionBand, string> = {
  priority: 'Something here is waiting on a decision from you.',
  discovery: 'Complete submissions from people your team has never reviewed.',
  all: 'Everyone else who applied. Nothing is ever hidden.',
}

/**
 * Une raison du feed, présentée comme un signal (Feature Concept Memo, § 2) :
 * ce que c'est, ce qui l'appuie, et d'où vient l'information. Le mot
 * « potentially » est voulu : un signal oriente l'attention, il ne dit jamais
 * qui est le meilleur.
 */
export type SignalKind = 'talent' | 'team' | 'discovery'

export type Signal = {
  kind: SignalKind
  title: string
  detail: string
  source: string
}

export const SIGNAL_KIND_LABEL: Record<SignalKind, string> = {
  talent: 'Potentially relevant signal',
  team: 'Waiting on your team',
  discovery: 'Discovery',
}

const FROM_MEMORY = 'Based on prior authorized review decisions by your team.'
const FROM_GRAPH = 'Based on decisions across productions on Let It Cast — counts only, never which ones.'
const FROM_CASTING = 'Based on your team’s activity on this casting.'
const FROM_SUBMISSION = 'Based on this submission.'

export function describeSignal(reason: AttentionReason): Signal {
  const line = explainReason(reason)
  switch (reason.code) {
    case 'passed_but_noted': {
      const names = reason.label_names ?? []
      return {
        kind: 'talent',
        title: names.length ? `Previously recognized: ${names.join(' · ')}` : 'Noted by your team on a past casting',
        detail: `${line}. A pass is not a failure — it was not the right role then.`,
        source: FROM_MEMORY,
      }
    }
    case 'worked_with_you':
      return { kind: 'talent', title: 'Cast by your team before', detail: `${line}.`, source: FROM_MEMORY }
    case 'called_back_before':
      return { kind: 'talent', title: 'Called back by your team before', detail: `${line}.`, source: FROM_MEMORY }
    case 'shortlisted_before':
      return { kind: 'talent', title: 'Shortlisted by your team before', detail: `${line}.`, source: FROM_MEMORY }
    case 'cast_elsewhere':
      return { kind: 'talent', title: 'Cast by other productions', detail: `${line}. Your team has no history with this talent yet.`, source: FROM_GRAPH }
    case 'called_back_elsewhere':
      return { kind: 'talent', title: 'Called back by other productions', detail: `${line}. Your team has no history with this talent yet.`, source: FROM_GRAPH }
    case 'team_waiting':
      return { kind: 'team', title: 'Team votes are in, no decision yet', detail: `${line}.`, source: FROM_CASTING }
    case 'rewatched':
      return { kind: 'team', title: 'Your team went back to this tape', detail: `${line}.`, source: FROM_CASTING }
    case 'watched_fully':
      return { kind: 'team', title: 'Watched to the end', detail: `${line}.`, source: FROM_CASTING }
    case 'overdue':
      return { kind: 'team', title: 'Waiting longer than usual', detail: `${line}.`, source: FROM_CASTING }
    case 'never_opened':
      return { kind: 'team', title: 'Nobody has opened it yet', detail: `${line}.`, source: FROM_CASTING }
    case 'deadline_close':
      return { kind: 'team', title: 'Deadline approaching', detail: `${line}.`, source: FROM_CASTING }
    case 'new_to_you':
      return {
        kind: 'discovery',
        title: 'New to your team',
        detail: 'No history with your team. A lack of prior data is never read as a lack of potential.',
        source: FROM_SUBMISSION,
      }
    case 'submission_ready':
      return { kind: 'discovery', title: 'Ready to watch', detail: `${reason.met} of ${reason.applicable} checks met: tape, note, headshot and fit with the brief.`, source: FROM_SUBMISSION }
    case 'submission_partial':
      return { kind: 'discovery', title: 'Submission incomplete', detail: `${reason.met} of ${reason.applicable} checks met — the dossier can still be completed.`, source: FROM_SUBMISSION }
    case 'tape_ready':
      return { kind: 'discovery', title: 'Self-tape ready', detail: `${line}.`, source: FROM_SUBMISSION }
    case 'complete_submission':
      return { kind: 'discovery', title: 'Complete submission', detail: `${line}.`, source: FROM_SUBMISSION }
  }
}

/** L'ordre de lecture : d'abord ce qui concerne le talent, puis l'équipe, puis le dossier. */
export function orderedSignals(reasons: AttentionReason[]): Signal[] {
  const rank: Record<SignalKind, number> = { talent: 0, team: 1, discovery: 2 }
  return reasons.map(describeSignal).sort((a, b) => rank[a.kind] - rank[b.kind])
}
