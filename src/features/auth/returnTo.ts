/**
 * Où la personne voulait aller avant qu'on lui demande un compte.
 *
 * Un lien de casting partagé mène à l'inscription, l'inscription mène à
 * l'onboarding, et l'onboarding fait quatre écrans : le `?next=` de l'URL ne
 * survit pas à ce trajet. On le met donc de côté au moment où on le connaît, et
 * `/continue` le consomme une fois — après quoi il disparaît.
 *
 * `sessionStorage` : propre à l'onglet, effacé à la fermeture, et ça ne raconte
 * rien sur la personne.
 */

const KEY = 'lic.returnTo'

/** Seules des routes internes sont acceptées : jamais une URL d'ailleurs. */
function safe(path: string | null | undefined): string | null {
  if (!path) return null
  if (!path.startsWith('/') || path.startsWith('//')) return null
  return path
}

export function rememberReturnTo(path: string | null | undefined): void {
  const value = safe(path)
  if (!value) return
  try {
    sessionStorage.setItem(KEY, value)
  } catch {
    // Navigation privée pleine : on perd le retour, pas l'inscription.
  }
}

/** Lit et efface : un retour ne sert qu'une fois. */
export function takeReturnTo(): string | null {
  try {
    const value = safe(sessionStorage.getItem(KEY))
    sessionStorage.removeItem(KEY)
    return value
  } catch {
    return null
  }
}
