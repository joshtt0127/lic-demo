import type { AttentionBand, AttentionReason } from "@/types/database";

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
  if (hours < 1) return "less than an hour";
  if (hours < 48) {
    const rounded = Math.round(hours);
    return `${rounded} hour${rounded === 1 ? "" : "s"}`;
  }
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function times(count: number): string {
  return count === 1 ? "once" : `${count} times`;
}

export function explainReason(reason: AttentionReason): string {
  switch (reason.code) {
    case "deadline_close":
      return `The deadline is in ${duration(reason.hours_left)}`;
    case "overdue":
      return `Waiting ${duration(reason.waiting_hours)} — your team usually decides within ${duration(reason.usual_hours)}`;
    case "worked_with_you":
      return `You cast this talent ${times(reason.times)} before`;
    case "called_back_before":
      return `You called this talent back ${times(reason.times)} before`;
    case "shortlisted_before":
      return `You shortlisted this talent ${times(reason.times)} before`;
    case "team_waiting":
      return reason.votes === 1
        ? "A teammate voted and nobody has decided"
        : `${reason.votes} teammates voted and nobody has decided`;
    case "rewatched":
      return `Your team went back to this tape ${times(reason.times)}`;
    case "watched_fully":
      return "Your team watched this tape to the end";
    case "new_to_you":
      return "New to your team — you have never reviewed this talent";
    case "tape_ready":
      return reason.quality === null
        ? "Self-tape ready to watch"
        : `Self-tape ready to watch — technical check ${reason.quality}/100`;
    case "complete_submission":
      return "Complete submission: note and headshot";
    case "never_opened":
      return `Nobody has opened this one yet — waiting ${duration(reason.waiting_hours)}`;
  }
}

/**
 * Ce que chaque bande dit, et pourquoi elle existe.
 *
 * Le sous-titre compte autant que le titre : sans lui, « Discovery » se lit
 * comme une catégorie de second choix, alors que c'est exactement l'inverse —
 * c'est la bande qui empêche le produit de ne montrer que des visages connus.
 */
export const BAND_LABEL: Record<AttentionBand, string> = {
  priority: "Priority review",
  discovery: "Discovery",
  all: "All applicants",
};

export const BAND_DESCRIPTION: Record<AttentionBand, string> = {
  priority: "Something here is waiting on a decision from you.",
  discovery: "Complete submissions from people your team has never reviewed.",
  all: "Everyone else who applied. Nothing is ever hidden.",
};
