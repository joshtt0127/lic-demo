import type { BriefExtractedField } from '@/types/database'

/**
 * Du brouillon d'extraction aux champs des formulaires.
 *
 * L'extraction rend des chaînes ; les formulaires de projet, d'annonce et de
 * rôle ont leurs propres types (dates, âges, listes, valeurs fermées). Ce
 * module fait la traduction — et refuse ce qui ne rentre pas dans le schéma
 * plutôt que de le forcer : une valeur douteuse reste à saisir.
 */

export type ProjectDraft = {
  title?: string
  productionType?: string
  genre?: string
  synopsis?: string
  directorBrief?: string
  companyName?: string
  directorName?: string
  shootingLocation?: string
  shootingStart?: string
  shootingEnd?: string
}

export type CastingDraft = {
  title?: string
  description?: string
  location?: string
  deadlineAt?: string
  compensation?: string
}

export type RoleDraft = {
  name?: string
  description?: string
  roleType?: 'lead' | 'supporting' | 'contestant'
  genderPref?: string
  playingAgeMin?: number
  playingAgeMax?: number
  location?: string
  languages?: string[]
  skills?: string[]
  selftapeInstructions?: string
  requirements?: string
  compensation?: string
}

export const PRODUCTION_TYPES = [
  'Film',
  'TV series',
  'Short film',
  'Commercial',
  'Music video',
  'Theatre',
  'Reality TV',
  'Documentary',
  'Voice over',
]

/** Libellé lisible de chaque champ, pour l'écran de validation. */
export const FIELD_LABELS: Record<string, string> = {
  title: 'Project title',
  production_type: 'Production type',
  genre: 'Genre',
  synopsis: 'Synopsis',
  director_brief: 'Tone & intention',
  company_name: 'Production company',
  director_name: 'Director',
  shooting_location: 'Shooting location',
  shooting_start: 'Shoot starts',
  shooting_end: 'Shoot ends',
  casting_title: 'Casting title',
  casting_description: 'Submission instructions',
  auditions_location: 'Auditions location',
  deadline: 'Application deadline',
  compensation: 'Compensation',
  name: 'Role name',
  description: 'Character',
  role_type: 'Role type',
  gender_pref: 'Gender',
  playing_age_min: 'Playing age from',
  playing_age_max: 'Playing age to',
  location: 'Location',
  languages: 'Languages',
  skills: 'Skills',
  selftape_instructions: 'Self-tape instructions',
  requirements: 'Requirements',
}

/**
 * Champs du brief projet qui remplissent l'ANNONCE (section « The casting call »),
 * et non le projet : l'écran de validation les regroupe pour que la
 * production sache où ils vont.
 */
export const CASTING_FIELDS = new Set([
  'casting_title',
  'auditions_location',
  'deadline',
  'compensation',
  'casting_description',
])

/** Champs dont la valeur est une liste. */
export const LIST_FIELDS = new Set(['languages', 'skills'])

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function date(value: string | null): string | undefined {
  if (!value || !ISO_DATE.test(value)) return undefined
  return Number.isNaN(Date.parse(value)) ? undefined : value
}

function age(value: string | null): number | undefined {
  if (!value) return undefined
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n >= 0 && n <= 120 ? n : undefined
}

function text(value: string | null): string | undefined {
  return value?.trim() ? value.trim() : undefined
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  if (!value) return undefined
  return allowed.find((item) => item.toLowerCase() === value.trim().toLowerCase())
}

/** La valeur retenue pour un champ (texte ou liste) après validation humaine. */
export type Accepted = Record<string, { value: string | null; values: string[] }>

/** Ce que l'écran de validation a retenu, à partir du brouillon brut. */
export function acceptedFrom(fields: BriefExtractedField[]): Accepted {
  const out: Accepted = {}
  for (const field of fields) {
    if (field.status === 'missing') continue
    out[field.field] = { value: field.value, values: field.values }
  }
  return out
}

export function toProjectDraft(accepted: Accepted): ProjectDraft {
  const v = (field: string) => accepted[field]?.value ?? null
  const draft: ProjectDraft = {
    title: text(v('title')),
    productionType: oneOf(v('production_type'), PRODUCTION_TYPES),
    genre: text(v('genre')),
    synopsis: text(v('synopsis')),
    directorBrief: text(v('director_brief')),
    companyName: text(v('company_name')),
    directorName: text(v('director_name')),
    shootingLocation: text(v('shooting_location')),
    shootingStart: date(v('shooting_start')),
    shootingEnd: date(v('shooting_end')),
  }
  return prune(draft)
}

export function toCastingDraft(accepted: Accepted): CastingDraft {
  const v = (field: string) => accepted[field]?.value ?? null
  return prune({
    title: text(v('casting_title')),
    description: text(v('casting_description')),
    location: text(v('auditions_location')),
    deadlineAt: date(v('deadline')),
    compensation: text(v('compensation')),
  })
}

export function toRoleDraft(accepted: Accepted, languageCodes: string[]): RoleDraft {
  const v = (field: string) => accepted[field]?.value ?? null
  const list = (field: string) => accepted[field]?.values ?? []
  const known = new Set(languageCodes)
  let min = age(v('playing_age_min'))
  let max = age(v('playing_age_max'))
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min]
  const languages = list('languages').filter((code) => known.has(code))
  const skills = list('skills').map((s) => s.trim()).filter(Boolean)
  return prune({
    name: text(v('name')),
    description: text(v('description')),
    roleType: oneOf(v('role_type'), ['lead', 'supporting', 'contestant'] as const),
    genderPref: oneOf(v('gender_pref'), ['Female', 'Male', 'Non-binary'] as const),
    playingAgeMin: min,
    playingAgeMax: max,
    location: text(v('location')),
    languages: languages.length ? languages : undefined,
    skills: skills.length ? skills : undefined,
    selftapeInstructions: text(v('selftape_instructions')),
    requirements: text(v('requirements')),
    compensation: text(v('compensation')),
  })
}

function prune<T extends Record<string, unknown>>(draft: T): T {
  return Object.fromEntries(
    Object.entries(draft).filter(([, value]) => value !== undefined),
  ) as T
}

/** « 01:24 » — minutage d'une source. */
export function timecode(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return ''
  const s = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
