import { useCallback, useSyncExternalStore } from 'react'

/**
 * Ce qui transforme le site en application sur un téléphone.
 *
 * Trois choses, et elles se mesurent :
 *   · le service worker, qui garde la coquille pour les couloirs sans réseau ;
 *   · l'état de la connexion, pour le dire au lieu de faire tourner un spinner ;
 *   · l'invitation à installer, qui n'apparaît que si le système la propose
 *     vraiment — jamais un faux bouton « Installer » qui ne fait rien.
 */

/**
 * Coupé tant que le mode hors ligne n'est pas prouvé.
 *
 * `public/sw.js` est écrit et relu, mais son enregistrement échoue encore sur
 * le build servi (`ServiceWorker script evaluation failed`), et la cause n'est
 * pas trouvée. Un cache de coquille qu'on n'a pas vu marcher n'a rien à faire
 * en production : il servirait un jour une vieille version sans qu'on sache
 * pourquoi. On le rallume quand la mesure passe, pas avant.
 */
const OFFLINE_SHELL_READY = false

/** Enregistré **uniquement en production** : en dev il masquerait le HMR. */
export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  /**
   * Tant que la coquille hors ligne est coupée, on **désinscrit** activement.
   *
   * Ne pas enregistrer ne suffit pas : quelqu'un qui a ouvert le site pendant
   * une fenêtre où le service worker était actif en garde un exemplaire
   * installé dans son navigateur — indéfiniment, et rien dans l'application ne
   * le lui dira. Ce fantôme peut continuer à servir une vieille coquille et
   * d'anciens fichiers, ce qui produit exactement le symptôme le plus pénible
   * à diagnostiquer : « chez moi ça marche », et un seul utilisateur bloqué
   * plusieurs versions en arrière.
   *
   * On retire donc l'enregistrement et ses caches. C'est sans effet pour
   * l'immense majorité — il n'y a rien à retirer — et ça débloque ceux qui le
   * traînent sans le savoir.
   */
  if (!OFFLINE_SHELL_READY) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((one) => one.unregister())))
      .then(() => (typeof caches !== 'undefined' ? caches.keys() : []))
      .then((keys) => Promise.all([...keys].map((key) => caches.delete(key))))
      .catch(() => {
        // Navigation privée, réglage d'entreprise : rien à nettoyer, rien à dire.
      })
    return
  }

  if (!import.meta.env.PROD) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Pas de service worker (navigation privée, réglage d'entreprise) : l'app
      // marche pareil, elle perd seulement son mode hors ligne.
    })
  })
}

// ── Connexion ──────────────────────────────────────────────────────────────

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

/**
 * `true` quand le téléphone a du réseau.
 *
 * `navigator.onLine` ment dans un sens (un wifi capté sans internet reste
 * « en ligne »), jamais dans l'autre : hors ligne veut vraiment dire hors ligne.
 * C'est ce sens-là qu'on utilise, pour prévenir, pas pour bloquer.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )
}

// ── Installation ───────────────────────────────────────────────────────────

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * L'événement n'est tiré **qu'une fois**, au chargement, bien avant que l'écran
 * qui propose l'installation soit monté. On l'attrape donc ici, à l'import.
 */
let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as InstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
}

function subscribeInstall(callback: () => void) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

/** Déjà lancée depuis l'écran d'accueil : plus rien à proposer. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari iOS n'implémente pas `display-mode`, il a son propre drapeau.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS se fait passer pour un Mac, mais il a un écran tactile.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export type InstallState = {
  /** Le système propose l'installation en un geste (Android, Chrome desktop). */
  canPrompt: boolean
  /** iOS n'a pas d'API : il faut montrer le chemin « Partager → Écran d'accueil ». */
  needsIosSteps: boolean
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
}

export function useInstall(): InstallState {
  const canPrompt = useSyncExternalStore(
    subscribeInstall,
    () => deferred !== null,
    () => false,
  )

  const install = useCallback(async () => {
    if (!deferred) return 'unavailable' as const
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    // Un événement consommé ne se rejoue pas.
    deferred = null
    emit()
    return outcome
  }, [])

  return {
    canPrompt,
    needsIosSteps: !canPrompt && isIos() && !isStandalone(),
    install,
  }
}
