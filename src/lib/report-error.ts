import { supabase, isSupabaseConfigured } from '@/lib/supabase'

/**
 * Remonter une erreur, sans remonter les données de qui que ce soit.
 *
 * Ce qui part : le message, le début de la pile, la route et le navigateur. Ce
 * qui ne part jamais : le contenu à l'écran, les identifiants, les valeurs de
 * formulaire. Un journal d'incidents qui fuite des données devient lui-même
 * l'incident.
 *
 * Et ça n'échoue jamais bruyamment : une erreur pendant la remontée d'une
 * erreur ne doit pas remplacer le problème d'origine par le sien.
 */

const MAX_STACK = 2000

export type ErrorKind = 'render' | 'promise' | 'window'

export function reportError(kind: ErrorKind, error: unknown, extra?: { route?: string }): void {
  if (!isSupabaseConfigured) return

  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'
  const stack = error instanceof Error ? (error.stack ?? null) : null

  // Aucune erreur ne doit sortir d'ici : remonter un incident ne doit pas en
  // provoquer un second, ni masquer le premier.
  void (async () => {
    try {
      await supabase.from('client_errors').insert({
        kind,
        message: message.slice(0, 500),
        stack: stack?.slice(0, MAX_STACK) ?? null,
        route: extra?.route ?? window.location.pathname,
        user_agent: navigator.userAgent.slice(0, 300),
        release: import.meta.env.MODE,
      })
    } catch {
      // Tant pis : l'incident d'origine reste visible à l'écran.
    }
  })()
}

/** Les deux filets globaux : une promesse oubliée, une erreur hors React. */
export function installErrorReporting(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('unhandledrejection', (event) => {
    reportError('promise', event.reason)
  })
  window.addEventListener('error', (event) => {
    reportError('window', event.error ?? event.message)
  })
}
