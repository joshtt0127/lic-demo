import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Supabase browser client — the single entry point to the backend.
 *
 * Components never import this file: they go through the hooks in
 * `src/features/*` and the repositories in `src/data/repositories/*`, so the
 * data layer stays swappable and every query has one home.
 *
 * Only the public anon key ships to the browser; every table is protected by
 * RLS (`supabase/migrations/*_rls.sql`). The service-role key is used solely by
 * local scripts and must never be imported from `src/`.
 */

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * "Keep me signed in" is a real switch, not decoration: when it is off the
 * session lives in `sessionStorage` and closing the browser signs the user out.
 * The adapter reads from whichever store holds the session so toggling the
 * preference never drops an active one.
 */
const PERSIST_KEY = 'lic-auth-persist'

function safe<T>(action: () => T, fallback: T): T {
  try {
    return action()
  } catch {
    // Private mode / blocked storage — behave as if nothing was stored.
    return fallback
  }
}

export function setSessionPersistence(keepSignedIn: boolean): void {
  safe(() => window.localStorage.setItem(PERSIST_KEY, keepSignedIn ? '1' : '0'), undefined)
}

export function sessionPersistence(): boolean {
  return safe(() => window.localStorage.getItem(PERSIST_KEY) !== '0', true)
}

const authStorage = {
  getItem: (key: string) =>
    safe(
      () => window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key),
      null,
    ),
  setItem: (key: string, value: string) =>
    safe(() => {
      if (sessionPersistence()) {
        window.localStorage.setItem(key, value)
        window.sessionStorage.removeItem(key)
      } else {
        window.sessionStorage.setItem(key, value)
        window.localStorage.removeItem(key)
      }
    }, undefined),
  removeItem: (key: string) =>
    safe(() => {
      window.localStorage.removeItem(key)
      window.sessionStorage.removeItem(key)
    }, undefined),
}

/** False when the app runs without a backend — the UI shows a setup notice instead of crashing. */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient<Database>(
  url || 'http://localhost:54321',
  anonKey || 'missing-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'lic-auth',
      storage: authStorage,
    },
  },
)

/** Narrow a PostgREST error into a message the UI can display. */
export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (!error) return fallback
  if (typeof error === 'string') return error
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}
