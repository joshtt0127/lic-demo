import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { en } from './en'
import { fr } from './fr'

/**
 * Translations, without a library.
 *
 * Keys are flat and namespaced (`auditions.empty.title`). A missing French key
 * falls back to English rather than printing the key: a half-translated screen
 * must still read like a sentence.
 *
 * Plurals use the `_one` / `_other` suffix convention:
 *   t('castings.count', { count: 3 })  →  castings.count_other
 *
 * The active language also drives date and number formatting (see
 * `lib/format.ts`), and `<html lang>`.
 */

export type Lang = 'en' | 'fr'

export const LANGUAGES: { value: Lang; label: string; native: string }[] = [
  { value: 'en', label: 'EN', native: 'English' },
  { value: 'fr', label: 'FR', native: 'Français' },
]

export type Dictionary = Record<string, string>

const DICTIONARIES: Record<Lang, Dictionary> = { en, fr }

const STORAGE_KEY = 'lic.lang'

/** The locale used by `Intl` — kept in sync by the provider. */
let activeLocale: string = 'en-US'
export function currentLocale(): string {
  return activeLocale
}

function detect(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'fr') return stored
  } catch {
    // Private mode: fall through to the browser's own preference.
  }
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

export type Translate = (key: string, vars?: Record<string, string | number>) => string

type I18nValue = { lang: Lang; setLang: (lang: Lang) => void; t: Translate }

const I18nContext = createContext<I18nValue | null>(null)

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detect())

  useEffect(() => {
    activeLocale = lang === 'fr' ? 'fr-FR' : 'en-US'
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // A refused write only costs the preference on the next visit.
    }
  }, [])

  const t = useCallback<Translate>(
    (key, vars) => {
      const dictionary = DICTIONARIES[lang]
      const count = vars?.count
      if (typeof count === 'number') {
        const plural = `${key}_${count === 1 ? 'one' : 'other'}`
        const value = dictionary[plural] ?? en[plural]
        if (value) return interpolate(value, vars)
      }
      return interpolate(dictionary[key] ?? en[key] ?? key, vars)
    },
    [lang],
  )

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>')
  return value
}

/** English, for a component rendered outside the provider (unit tests). */
const fallbackTranslate: Translate = (key, vars) => interpolate(en[key] ?? key, vars)

/**
 * Shorthand for components that only need the function.
 *
 * Outside the provider it degrades to English instead of throwing: a missing
 * provider must never blank a screen, and unit tests render components on their
 * own.
 */
export function useT(): Translate {
  return useContext(I18nContext)?.t ?? fallbackTranslate
}
