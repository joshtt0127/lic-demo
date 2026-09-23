/**
 * Service worker — ce qui fait tenir l'app quand le réseau lâche.
 *
 * Un comédien consulte ses auditions dans un couloir de casting, un ascenseur,
 * un parking de studio. Sans ce fichier, il voit une page blanche ; avec lui,
 * l'app se charge et dit ce qui se passe.
 *
 * Trois stratégies, et une règle qui prime sur tout :
 *   · **navigation** (une URL tapée, un lien ouvert) → réseau d'abord, coquille
 *     en cache si le réseau ne répond pas. Le réseau d'abord est non négociable :
 *     un déploiement doit arriver sans attendre qu'un cache expire ;
 *   · **/assets/** (fichiers au nom haché, donc immuables) → cache d'abord ;
 *   · **le reste du même domaine** (icônes, polices, images publiques) → on sert
 *     le cache et on rafraîchit derrière.
 *
 * La règle qui prime : **on ne touche jamais aux données**. Supabase est sur un
 * autre domaine et n'est donc pas intercepté, mais la garde est explicite —
 * mettre en cache une réponse d'API, c'est afficher un jour la candidature de
 * quelqu'un d'autre, ou la même sur un téléphone partagé.
 */

const VERSION = 'lic-v1'
const SHELL = `${VERSION}-shell`
const ASSETS = `${VERSION}-assets`
const MEDIA = `${VERSION}-media`

/** La coquille : de quoi afficher l'app hors ligne avant toute donnée. */
const PRECACHE = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // Une icône manquante ne doit pas empêcher le service worker de s'installer.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Autre domaine = Supabase (données, stockage, realtime) : jamais intercepté.
  if (url.origin !== self.location.origin) return
  // Ceinture et bretelles : aucune réponse d'API ne doit finir dans un cache.
  if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/v1')) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSETS))
    return
  }
  event.respondWith(staleWhileRevalidate(request, MEDIA))
})

/**
 * Réseau d'abord, coquille ensuite.
 *
 * L'app est une SPA : la même page répond pour toutes les routes, donc la
 * coquille de `/` suffit à ouvrir n'importe quel lien profond hors ligne.
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request)
    const cache = await caches.open(SHELL)
    cache.put('/', response.clone())
    return response
  } catch {
    const cached = (await caches.match('/')) ?? (await caches.match(request))
    if (cached) return cached
    return new Response('Hors ligne', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(cacheName)
    cache.put(request, response.clone())
  }
  return response
}

async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request)
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(cacheName)
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => cached)
  return cached ?? network
}
