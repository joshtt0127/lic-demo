import { describe, expect, it } from 'vitest'
import { signalLabel } from './live'

/**
 * Le vocabulaire du Signal Stream.
 *
 * Le flux est la seule partie du produit qui tourne en continu à l'écran, donc
 * la plus exposée : c'est lui qu'on voit en partage d'écran, en démo, derrière
 * une épaule. Deux choses s'y vérifient et ne se négocient pas.
 */
describe('signalLabel', () => {
  it('traduit un type technique en geste de casting', () => {
    expect(signalLabel('SHORTLISTED')?.label).toBe('Shortlist signal added')
    expect(signalLabel('CALLBACK_REQUESTED')?.label).toBe('Callback recorded')
    expect(signalLabel('AUDITION_REWATCHED')?.label).toBe('Tape revisited')
  })

  it('dit quel graphe chaque fait enrichit — le Dual Capture, littéralement', () => {
    // Une décision, deux graphes : sans cette information, le flux serait un
    // journal ; avec elle, il montre la mémoire se construire.
    expect(signalLabel('CAST')?.target).toBe('both')
    expect(signalLabel('SELF_TAPE_SUBMITTED')?.target).toBe('talent')
    expect(signalLabel('AUDITION_OPENED')?.target).toBe('production')
  })

  it('ignore ce qu’il ne sait pas nommer', () => {
    // Un flux qui laisse passer `CASTING_UPDATED` en majuscules ressemble à un
    // journal de développeur — exactement ce que le brief interdit.
    expect(signalLabel('CASTING_UPDATED')).toBeNull()
    expect(signalLabel('ACCOUNT_DELETION_REQUESTED')).toBeNull()
    expect(signalLabel('SOMETHING_NEW')).toBeNull()
  })

  it('ne qualifie jamais une personne', () => {
    // Le flux nomme des gestes, jamais des gens. Si une formulation future
    // glissait vers « strong candidate » ou « top talent », c'est ici que ça
    // doit s'arrêter.
    const forbidden = /\b(best|top|strong|weak|promising|score|rank(ed|ing)?|match)\b/i
    for (const type of [
      'APPLICATION_SUBMITTED',
      'SELF_TAPE_SUBMITTED',
      'SHORTLISTED',
      'CALLBACK_REQUESTED',
      'CAST',
      'PASSED',
      'AUDITION_OPENED',
      'AUDITION_COMPLETED',
      'AUDITION_REWATCHED',
      'PROFILE_VIEWED',
    ]) {
      expect(signalLabel(type)!.label).not.toMatch(forbidden)
    }
  })
})
