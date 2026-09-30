import { afterEach, describe, expect, it, vi } from 'vitest'
import { freshChunk } from './freshChunk'

/**
 * Ce que ce garde-fou doit tenir, et surtout ce qu'il ne doit pas faire.
 *
 * Recharger la page est une action brutale : bien déclenchée elle sauve une
 * session, mal déclenchée elle masque un bug derrière un rechargement
 * silencieux, ou pire, elle boucle. Les trois cas sont donc verrouillés.
 */
describe('freshChunk', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('laisse passer un chargement normal', async () => {
    const load = freshChunk(async () => ({ ok: true }))
    await expect(load()).resolves.toEqual({ ok: true })
  })

  it('recharge quand le morceau de code a disparu', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })

    const load = freshChunk(async () => {
      throw new Error('Failed to fetch dynamically imported module: /assets/index-OLD.js')
    })
    // La promesse ne se résout jamais : la page s'en va. On vérifie l'effet,
    // pas le retour — l'attendre bloquerait le test pour toujours.
    void load()
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })

  it('ne recharge jamais deux fois de suite', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    sessionStorage.setItem('lic:chunk-reloaded', '1')

    const boom = new Error('Failed to fetch dynamically imported module: /assets/x.js')
    const load = freshChunk(async () => {
      throw boom
    })
    // Le rechargement n'a rien réglé : l'erreur doit remonter, et l'écran
    // d'erreur faire son travail. Boucler serait pire que le problème.
    await expect(load()).rejects.toThrow(boom)
    expect(reload).not.toHaveBeenCalled()
  })

  it('ne masque pas une vraie erreur applicative', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })

    const bug = new TypeError("Cannot read properties of undefined (reading 'map')")
    const load = freshChunk(async () => {
      throw bug
    })
    await expect(load()).rejects.toThrow(bug)
    expect(reload).not.toHaveBeenCalled()
  })

  it('réarme après un chargement réussi', async () => {
    sessionStorage.setItem('lic:chunk-reloaded', '1')
    await freshChunk(async () => 'ok')()
    expect(sessionStorage.getItem('lic:chunk-reloaded')).toBeNull()
  })
})
