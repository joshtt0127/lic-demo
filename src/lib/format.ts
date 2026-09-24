import { currentLocale, type Translate } from '@/lib/i18n'
import type { ApplicationStatus, CastingStatus } from '@/types/database'

/**
 * Display formatting.
 *
 * Everything in the database is a real timestamp; the relative strings the UI
 * shows ("3d ago", "in 12 days") are computed here instead of being stored —
 * that was one of the fixture habits this POC had to lose.
 *
 * Dates follow the active language through `currentLocale()`. The relative
 * strings take an optional `t`: screens that are translated pass it, the rest
 * keep the English wording rather than printing a key.
 */

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(currentLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateShort(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short' })
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return ''
  return new Date(value).toLocaleTimeString(currentLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "just now", "3h ago", "2d ago", then a date. */
export function relativeTime(value: string | null | undefined, t?: Translate): string {
  if (!value) return ''
  // Elapsed time floors: 30 seconds ago is "just now", not "1m ago", and
  // 5h50 ago is "5h ago" — rounding up reads as the future.
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return t ? t('time.justNow') : 'just now'
  if (minutes < 60) return t ? t('time.minutes', { count: minutes }) : `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t ? t('time.hours', { count: hours }) : `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days <= 7) return t ? t('time.days', { count: days }) : `${days}d ago`
  return formatDateShort(value)
}

/** "in 12 days" / "in 4h" / "closed" — for a casting deadline. */
export function deadlineLabel(value: string | null | undefined, t?: Translate): string {
  if (!value) return t ? t('deadline.none') : 'No deadline'
  const diff = new Date(value).getTime() - Date.now()
  if (diff <= 0) return t ? t('deadline.closed') : 'Closed'
  const hours = Math.round(diff / 3_600_000)
  if (hours < 24) return t ? t('deadline.hours', { count: hours }) : `Closes in ${hours}h`
  const days = Math.round(hours / 24)
  if (t) return t('deadline.days', { count: days })
  return `Closes in ${days} ${days === 1 ? 'day' : 'days'}`
}

export function isClosingSoon(value: string | null | undefined): boolean {
  if (!value) return false
  const diff = new Date(value).getTime() - Date.now()
  return diff > 0 && diff < 3 * 86_400_000
}

// ── Application status ───────────────────────────────────────────────────────

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  viewed: 'Viewed',
  under_review: 'Under review',
  shortlisted: 'Shortlisted',
  callback: 'Callback',
  offer: 'Offer',
  cast: 'Cast',
  not_selected: 'Not selected',
  withdrawn: 'Withdrawn',
}

export type StatusTone = 'neutral' | 'good' | 'maybe' | 'no' | 'link' | 'cream' | 'gold'

export const APPLICATION_STATUS_TONE: Record<ApplicationStatus, StatusTone> = {
  draft: 'neutral',
  submitted: 'link',
  viewed: 'neutral',
  under_review: 'maybe',
  shortlisted: 'good',
  callback: 'good',
  offer: 'cream',
  cast: 'gold',
  not_selected: 'no',
  withdrawn: 'neutral',
}

/** The talent-facing progress ladder of an application. */
export const APPLICATION_STEPS: ApplicationStatus[] = [
  'submitted',
  'viewed',
  'under_review',
  'shortlisted',
  'callback',
  'offer',
  'cast',
]

/**
 * Ce que le comédien lit, qui n'est pas ce que la base stocke.
 *
 * Deux écarts volontaires :
 *   · `viewed` n'est jamais montré tel quel. « Vu » crée une attente — on a
 *     regardé, et après ? — pour une information qui n'en est pas une. Le
 *     comédien lit « en cours », ce qui est vrai et ne promet rien.
 *   · un casting fermé sur une candidature restée en route ne laisse pas le
 *     comédien devant un statut figé : il lit que le casting est terminé.
 *
 * `offer` n'a pas de parcours au MVP ; il se lit « en cours » en attendant
 * qu'on décide ce que la plateforme en fait.
 */
export type TalentFacingStatus =
  | 'submitted'
  | 'inProgress'
  | 'shortlisted'
  | 'callback'
  | 'cast'
  | 'notSelected'
  | 'withdrawn'
  | 'castingCancelled'

const TALENT_FACING: Record<ApplicationStatus, TalentFacingStatus> = {
  draft: 'submitted',
  submitted: 'submitted',
  viewed: 'inProgress',
  under_review: 'inProgress',
  shortlisted: 'shortlisted',
  callback: 'callback',
  offer: 'inProgress',
  cast: 'cast',
  not_selected: 'notSelected',
  withdrawn: 'withdrawn',
}

/** Les états où le comédien n'attend plus rien : le casting ne les recouvre pas. */
const SETTLED: ApplicationStatus[] = ['cast', 'not_selected', 'withdrawn']

export function talentFacingStatus(
  status: ApplicationStatus,
  castingStatus?: CastingStatus | null,
): TalentFacingStatus {
  if (
    castingStatus &&
    castingStatus !== 'published' &&
    castingStatus !== 'draft' &&
    !SETTLED.includes(status)
  ) {
    return 'castingCancelled'
  }
  return TALENT_FACING[status]
}

export const TALENT_STATUS_TONE: Record<TalentFacingStatus, StatusTone> = {
  submitted: 'link',
  inProgress: 'maybe',
  shortlisted: 'good',
  callback: 'good',
  cast: 'gold',
  notSelected: 'no',
  withdrawn: 'neutral',
  castingCancelled: 'neutral',
}

export function statusStepIndex(status: ApplicationStatus): number {
  const index = APPLICATION_STEPS.indexOf(status)
  if (index >= 0) return index
  // Terminal states sit outside the ladder.
  return status === 'not_selected' || status === 'withdrawn' ? APPLICATION_STEPS.length : 0
}

/** Greeting used on the home screens. */
export function greeting(date = new Date(), t?: Translate): string {
  const hour = date.getHours()
  const key = hour < 12 ? 'greeting.morning' : hour < 18 ? 'greeting.afternoon' : 'greeting.evening'
  if (t) return t(key)
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

/** The talent-facing label of an application status, translated. */
export function statusLabel(status: ApplicationStatus, t: Translate): string {
  return t(`status.${status}`)
}
