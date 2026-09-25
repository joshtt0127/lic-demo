import { describe, expect, it } from 'vitest'
import { BAND_DESCRIPTION, BAND_LABEL, explainReason } from './reasons'

/**
 * Les explications sont la seule chose qui sépare ce feed d'une boîte noire.
 *
 * Ce qu'on garde ici, ce n'est pas la jolie tournure : c'est que chaque phrase
 * contient encore les **nombres** que la règle a produits. Une explication qui
 * perd ses chiffres en refactorant redevient une formule vague, et une formule
 * vague ne se conteste pas.
 */
describe('explainReason', () => {
  it('dit combien de temps quelqu’un attend, et ce que fait l’équipe d’habitude', () => {
    const text = explainReason({ code: 'overdue', waiting_hours: 312, usual_hours: 72 })
    expect(text).toContain('13 days')
    expect(text).toContain('3 days')
  })

  it('compte en heures tant que la journée n’est pas passée', () => {
    expect(explainReason({ code: 'deadline_close', hours_left: 5 })).toContain('5 hours')
    expect(explainReason({ code: 'deadline_close', hours_left: 1 })).toContain('1 hour')
    expect(explainReason({ code: 'deadline_close', hours_left: 0.4 })).toContain(
      'less than an hour',
    )
  })

  it('accorde le singulier : « once », pas « 1 times »', () => {
    expect(explainReason({ code: 'worked_with_you', times: 1 })).toContain('once')
    expect(explainReason({ code: 'worked_with_you', times: 3 })).toContain('3 times')
    expect(explainReason({ code: 'team_waiting', votes: 1 })).toBe(
      'A teammate voted and nobody has decided',
    )
    expect(explainReason({ code: 'team_waiting', votes: 2 })).toContain('2 teammates')
  })

  it('n’invente pas une note technique quand la tape n’a pas été mesurée', () => {
    expect(explainReason({ code: 'tape_ready', quality: null })).toBe('Self-tape ready to watch')
    expect(explainReason({ code: 'tape_ready', quality: 82 })).toContain('82/100')
  })

  it('ne parle jamais du comédien, seulement de ce qui attend', () => {
    // Le garde-fou du produit, sous forme de test : aucune phrase ne qualifie
    // une personne. Si une formulation future glissait vers « strong profile »
    // ou « top match », c'est ici que ça doit s'arrêter.
    const forbidden = /\b(best|top|strong|weak|match|score|rank(ed|ing)?)\b/i
    const samples = [
      explainReason({ code: 'deadline_close', hours_left: 12 }),
      explainReason({ code: 'overdue', waiting_hours: 100, usual_hours: 40 }),
      explainReason({ code: 'worked_with_you', times: 2 }),
      explainReason({ code: 'called_back_before', times: 1 }),
      explainReason({ code: 'shortlisted_before', times: 4 }),
      explainReason({ code: 'team_waiting', votes: 3 }),
      explainReason({ code: 'rewatched', times: 2 }),
      explainReason({ code: 'watched_fully' }),
      explainReason({ code: 'new_to_you' }),
      explainReason({ code: 'tape_ready', quality: 60 }),
      explainReason({ code: 'complete_submission' }),
      explainReason({ code: 'never_opened', waiting_hours: 200 }),
    ]
    for (const sample of samples) expect(sample).not.toMatch(forbidden)
  })
})

describe('les bandes', () => {
  it('nomment et justifient les trois, Discovery comprise', () => {
    expect(BAND_LABEL.priority).toBe('Priority review')
    expect(BAND_LABEL.discovery).toBe('Discovery')
    expect(BAND_LABEL.all).toBe('All applicants')
    // Sans sa description, « Discovery » se lit comme un second choix, alors
    // que c'est la bande qui empêche le produit de ne montrer que des habitués.
    expect(BAND_DESCRIPTION.discovery).toContain('never reviewed')
    expect(BAND_DESCRIPTION.all).toContain('hidden')
  })
})
