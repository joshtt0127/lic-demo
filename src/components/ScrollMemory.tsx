import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Le feed rendu **là où on l'avait laissé**.
 *
 * `<ScrollRestoration />` de React Router restaure une fois, dans un effet de
 * layout. Mesuré ici : on remontait à 202 px au lieu de 1400, parce qu'au
 * moment où il restaure, les annonces ne sont pas encore peintes — la page
 * n'est pas assez haute, le navigateur plafonne, et le comédien se retrouve en
 * haut du feed. D'où cette version, qui suit la page pendant qu'elle se remplit.
 *
 * Le piège, celui qui coûte le plus de temps à voir : **quand on quitte le
 * feed, le document rétrécit et le navigateur ramène le scroll tout seul**.
 * Enregistrer à chaque événement de scroll revient donc à écraser 1400 par la
 * valeur écrasée juste avant de partir. La position est donc figée *à l'instant
 * où l'on part* (le clic, ou le geste de retour), jamais après.
 *
 * `sessionStorage`, par entrée d'historique (`location.key`) : propre à
 * l'onglet, effacé à la fermeture, et ça ne dit rien sur la personne.
 */

const PREFIX = 'lic.scroll.'
/** Filet de sécurité absolu : au-delà, on n'y touche plus. */
const GIVE_UP_MS = 4000
/** La page a fini d'arriver quand sa hauteur ne bouge plus pendant ce temps. */
const SETTLED_MS = 700

export function ScrollMemory() {
  const { key, pathname } = useLocation()
  const navigationType = useNavigationType()
  /** La clé de l'entrée d'historique affichée en ce moment. */
  const currentKey = useRef(key)
  /** Le dernier scroll **voulu par la personne**, hors recadrage du navigateur. */
  const lastScroll = useRef(0)

  useEffect(() => {
    currentKey.current = key
  }, [key])

  // On gère la position nous-mêmes, sinon le navigateur la repose par-dessus.
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  }, [])

  useEffect(() => {
    function remember() {
      lastScroll.current = window.scrollY
    }

    /**
     * Figer la position avant de partir.
     *
     * En capture, donc avant que React Router ne traite le clic : à cet
     * instant la page est encore entière et `currentKey` est encore la sienne.
     */
    function freeze() {
      try {
        sessionStorage.setItem(PREFIX + currentKey.current, String(lastScroll.current))
      } catch {
        // Navigation privée pleine : on perd la mémoire du scroll, pas l'app.
      }
    }

    window.addEventListener('scroll', remember, { passive: true })
    document.addEventListener('click', freeze, true)
    window.addEventListener('popstate', freeze, true)
    window.addEventListener('pagehide', freeze)
    return () => {
      window.removeEventListener('scroll', remember)
      document.removeEventListener('click', freeze, true)
      window.removeEventListener('popstate', freeze, true)
      window.removeEventListener('pagehide', freeze)
    }
  }, [])

  useEffect(() => {
    // Un lien suivi commence en haut ; seul un retour restaure.
    if (navigationType !== 'POP') {
      window.scrollTo(0, 0)
      lastScroll.current = 0
      return
    }

    let target = 0
    try {
      target = Number(sessionStorage.getItem(PREFIX + key) ?? 0)
    } catch {
      return
    }
    if (!target) return

    const started = Date.now()
    let raf = 0
    let cancelled = false

    // Si la personne scrolle elle-même, on lui laisse la main immédiatement.
    const release = () => {
      cancelled = true
    }
    window.addEventListener('wheel', release, { passive: true, once: true })
    window.addEventListener('touchstart', release, { passive: true, once: true })

    // La transition de page dure ~220 ms et les données arrivent après : on ne
    // peut pas restaurer en une fois, il faut suivre la page pendant qu'elle se
    // remplit. On s'arrête quand la position est atteinte, ou quand la hauteur
    // ne bouge plus (la page est arrivée, et elle est simplement plus courte).
    let lastHeight = 0
    let lastGrowth = started

    function attempt() {
      if (cancelled) return
      const height = document.documentElement.scrollHeight
      const now = Date.now()
      if (height !== lastHeight) {
        lastHeight = height
        lastGrowth = now
      }

      window.scrollTo(0, Math.min(target, Math.max(0, height - window.innerHeight)))
      lastScroll.current = window.scrollY

      if (window.scrollY >= target - 2) return
      if (now - lastGrowth > SETTLED_MS || now - started > GIVE_UP_MS) return
      raf = requestAnimationFrame(attempt)
    }
    attempt()

    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('wheel', release)
      window.removeEventListener('touchstart', release)
    }
  }, [key, pathname, navigationType])

  return null
}
