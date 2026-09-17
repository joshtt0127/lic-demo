import type { ApplicationStatus } from '@/types/database'

/**
 * Display formatting.
 *
 * Everything in the database is a real timestamp; the relative strings the UI
 * shows ("3d ago", "in 12 days") are computed here instead of being stored —
 * that was one of the fixture habits this POC had to lose.
 */

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateShort(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return ''
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** "just now", "3h ago", "2d ago", then a date. */
export function relativeTime(value: string | null | undefined): string {
  if (!value) return ''
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days <= 7) return `${days}d ago`
  return formatDateShort(value)
}

/** "in 12 days" / "in 4h" / "closed" — for a casting deadline. */
export function deadlineLabel(value: string | null | undefined): string {
  if (!value) return 'No deadline'
  const diff = new Date(value).getTime() - Date.now()
  if (diff <= 0) return 'Closed'
  const hours = Math.round(diff / 3_600_000)
  if (hours < 24) return `Closes in ${hours}h`
  return `Closes in ${Math.round(hours / 24)} days`
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

export function statusStepIndex(status: ApplicationStatus): number {
  const index = APPLICATION_STEPS.indexOf(status)
  if (index >= 0) return index
  // Terminal states sit outside the ladder.
  return status === 'not_selected' || status === 'withdrawn' ? APPLICATION_STEPS.length : 0
}

/** Greeting used on the home screens. */
export function greeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
