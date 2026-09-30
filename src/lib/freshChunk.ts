/**
 * Survivre à un déploiement pendant qu'on utilise l'application.
 *
 * Le scénario, et il est banal : quelqu'un laisse un onglet ouvert, on déploie,
 * les fichiers JavaScript changent de nom — ils portent une empreinte de
 * contenu — et les anciens disparaissent. À la navigation suivante, le
 * navigateur réclame un morceau de code qui n'existe plus.
 *
 * Jusqu'ici, ça produisait un écran d'erreur et un message incompréhensible :
 * « Expected a JavaScript module script but the server responded with a MIME
 * type of text/html ». L'utilisateur n'a rien fait de mal, l'application n'est
 * pas cassée — elle a simplement été mise à jour sous ses pieds.
 *
 * La réponse juste est de **recharger une fois**. La page revient avec l'index
 * à jour, donc les bons fichiers, et le parcours reprend. C'est invisible et
 * c'est ce que l'utilisateur ferait lui-même s'il savait quoi faire.
 *
 * Le garde-fou qui compte : **une seule fois**. Si le rechargement ne règle
 * rien — un fichier réellement absent, un proxy d'entreprise qui réécrit les
 * réponses — boucler indéfiniment serait pire que l'erreur d'origine. Au
 * deuxième échec, l'erreur remonte et l'écran d'erreur fait son travail.
 */

const RELOAD_FLAG = 'lic:chunk-reloaded'

/**
 * Est-ce un morceau de code manquant, ou une vraie erreur applicative ?
 *
 * Les navigateurs ne s'accordent pas sur le message, d'où la liste. On reste
 * volontairement étroit : recharger sur une erreur qu'on n'a pas comprise
 * masquerait des bugs réels derrière un rechargement silencieux.
 */
function isStaleChunk(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('Expected a JavaScript') ||
    message.includes('ChunkLoadError')
  )
}

function readFlag(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) === '1'
  } catch {
    // Navigation privée, stockage bloqué : sans mémoire du rechargement, on
    // préfère ne pas recharger du tout plutôt que risquer une boucle.
    return true
  }
}

function writeFlag(value: boolean) {
  try {
    if (value) sessionStorage.setItem(RELOAD_FLAG, '1')
    else sessionStorage.removeItem(RELOAD_FLAG)
  } catch {
    /* rien à faire : voir readFlag */
  }
}

/**
 * Enveloppe un chargement de route pour qu'un déploiement ne casse pas la session.
 */
export function freshChunk<T>(load: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      const loaded = await load()
      // Un chargement réussi referme la parenthèse : le prochain incident aura
      // droit à son propre rechargement.
      writeFlag(false)
      return loaded
    } catch (error) {
      if (!isStaleChunk(error) || readFlag()) throw error

      writeFlag(true)
      window.location.reload()
      // La page s'en va : cette promesse ne doit jamais se résoudre, sinon
      // React rendrait un écran vide pendant le rechargement.
      return new Promise<T>(() => {})
    }
  }
}
