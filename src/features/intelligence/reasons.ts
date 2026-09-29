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
