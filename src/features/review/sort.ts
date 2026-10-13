import type {
  ApplicationStatus,
  AttentionBand,
  CandidateViewRow,
  IntelligenceFeedRow,
} from '@/types/database'

/**
 * Audition Review Queue™ — l'ordre de la file.
 *
 * Mêmes auditions, ordre différent, un clic. Aucun mode ne masque une
 * candidature : trier n'est jamais filtrer. Le feed range l'attention par
 * bandes (Priority, Discovery, All) ; les autres modes sont des ordres simples
 * que l'équipe comprend sans explication.
 */

export type SortMode = 'intelligence' | 'date' | 'name' | 'role'
export type SortDir = 'asc' | 'desc'

/** Une audition de la file : la candidature + sa place dans le feed (s'il la connaît). */
export type QueueItem = CandidateViewRow & { feed: IntelligenceFeedRow | null }

export type QueueSection = {
  key: string
  title: string | null
  description: string | null
  band: AttentionBand | null
  items: QueueItem[]
}

export const DECIDED: ApplicationStatus[] = ['shortlisted', 'callback', 'offer', 'cast', 'not_selected']

export function isDecided(status: ApplicationStatus) {
  return DECIDED.includes(status)
}

/** Ordre par défaut de chaque mode : le plus utile d'abord. */
export const DEFAULT_DIR: Record<SortMode, SortDir> = {
  intelligence: 'asc',
  date: 'desc',
  name: 'asc',
  role: 'asc',
}

const BAND_ORDER: AttentionBand[] = ['priority', 'discovery', 'all']

const time = (value: string | null) => (value ? Date.parse(value) : 0)
const byName = (a: QueueItem, b: QueueItem) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
const byNewest = (a: QueueItem, b: QueueItem) => time(b.submitted_at ?? b.created_at) - time(a.submitted_at ?? a.created_at)

export function buildQueue(candidates: CandidateViewRow[], feed: IntelligenceFeedRow[] | undefined): QueueItem[] {
  const byId = new Map((feed ?? []).map((row) => [row.application_id, row]))
  return candidates
    // Un brouillon n'a pas été envoyé : il n'appartient pas à la file.
    .filter((candidate) => candidate.status !== 'draft')
    .map((candidate) => ({ ...candidate, feed: byId.get(candidate.application_id) ?? null }))
}

export function sortQueue(
  items: QueueItem[],
  mode: SortMode,
  dir: SortDir,
  bandLabels: Record<AttentionBand, { title: string; description: string }>,
): QueueSection[] {
  const flip = <T,>(compare: (a: T, b: T) => number) => (dir === DEFAULT_DIR[mode] ? compare : (a: T, b: T) => compare(b, a))

  if (mode === 'intelligence') {
    // Le moteur a déjà ordonné chaque bande (queue_rank). Une candidature
    // qu'il ne connaît pas encore (envoyée à l'instant) va en « All », jamais
    // devant une autre sans raison.
    return BAND_ORDER.map((band) => {
      const inBand = items.filter((item) => (item.feed?.band ?? 'all') === band)
      inBand.sort((a, b) => {
        if (a.feed && b.feed) return a.feed.queue_rank - b.feed.queue_rank
        if (a.feed) return -1
        if (b.feed) return 1
        return byNewest(a, b)
      })
      return { key: band, band, title: bandLabels[band].title, description: bandLabels[band].description, items: inBand }
    }).filter((section) => section.items.length > 0)
  }

  if (mode === 'role') {
    const roles = [...new Set(items.map((item) => item.role_name))].sort((a, b) => a.localeCompare(b))
    const ordered = dir === 'asc' ? roles : [...roles].reverse()
    return ordered.map((role) => ({
      key: `role:${role}`,
      band: null,
      title: role,
      description: null,
      items: items.filter((item) => item.role_name === role).sort(byNewest),
    }))
  }

  const compare = mode === 'name' ? flip(byName) : flip(byNewest)
  return [{ key: mode, band: null, title: null, description: null, items: [...items].sort(compare) }]
}

/** Progression de revue, pour la personne qui regarde (vu = elle l'a ouvert). */
export function progress(items: QueueItem[], seen: Set<string>) {
  let decided = 0
  let viewed = 0
  for (const item of items) {
    if (isDecided(item.status)) decided++
    else if (seen.has(item.application_id)) viewed++
  }
  return { total: items.length, decided, seen: viewed, unseen: items.length - decided - viewed }
}

export type ProgressFilter = 'all' | 'unseen' | 'seen' | 'decided'

export function matchesProgress(item: QueueItem, filter: ProgressFilter, seen: Set<string>) {
  if (filter === 'all') return true
  if (filter === 'decided') return isDecided(item.status)
  if (isDecided(item.status)) return false
  return filter === 'seen' ? seen.has(item.application_id) : !seen.has(item.application_id)
}

/** Export CSV de la sélection : ce que l'équipe voit, rien de plus. */
export function toCsv(
  items: QueueItem[],
  explain: (item: QueueItem) => string,
  labels: (item: QueueItem) => string = () => '',
) {
  const head = ['Name', 'Role', 'Status', 'Submitted', 'City', 'Good', 'Maybe', 'No go', 'Labels', 'Why this audition']
  const esc = (value: string | number | null) => {
    const text = value == null ? '' : String(value)
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const rows = items.map((item) => [
    item.name,
    item.role_name,
    item.status,
    item.submitted_at ? item.submitted_at.slice(0, 10) : '',
    item.city,
    item.good_count,
    item.maybe_count,
    item.no_count,
    labels(item),
    explain(item),
  ])
  return [head, ...rows].map((row) => row.map(esc).join(',')).join('\n')
}
