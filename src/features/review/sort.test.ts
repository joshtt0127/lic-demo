import { describe, expect, it } from 'vitest'
import { buildQueue, matchesProgress, progress, sortQueue, toCsv } from './sort'
import type { CandidateViewRow, IntelligenceFeedRow } from '@/types/database'

const labels = {
  priority: { title: 'Priority review', description: '' },
  discovery: { title: 'Discovery', description: '' },
  all: { title: 'All applicants', description: '' },
}

function candidate(id: string, name: string, submitted: string, extra: Partial<CandidateViewRow> = {}) {
  return {
    application_id: id, role_id: 'r1', talent_id: `t-${id}`, status: 'submitted', note: null,
    submitted_at: submitted, viewed_at: null, created_at: submitted, role_name: 'Chloé',
    casting_call_id: 'c', project_id: 'p', name, avatar_url: null, city: null, country: null, gender: null,
    playing_age_min: null, playing_age_max: null, nationalities: [], experience_level: null, languages: [],
    good_count: 0, maybe_count: 0, no_count: 0, score: 0, has_self_tape: true, ...extra,
  } as CandidateViewRow
}

function feed(id: string, band: IntelligenceFeedRow['band'], rank: number) {
  return { application_id: id, band, queue_rank: rank, reasons: [] } as unknown as IntelligenceFeedRow
}

const candidates = [
  candidate('a', 'Zoé', '2026-10-01T10:00:00Z'),
  candidate('b', 'adrien', '2026-10-03T10:00:00Z'),
  candidate('c', 'Bastien', '2026-10-02T10:00:00Z', { role_name: 'Agnès' }),
  candidate('d', 'Draft', '2026-10-04T10:00:00Z', { status: 'draft' }),
]
const items = buildQueue(candidates, [feed('a', 'priority', 1), feed('c', 'discovery', 1)])

describe('Audition Review Queue', () => {
  it('never queues a draft, and never hides a submission', () => {
    expect(items.map((i) => i.application_id).sort()).toEqual(['a', 'b', 'c'])
    for (const mode of ['intelligence', 'date', 'name', 'role'] as const) {
      const total = sortQueue(items, mode, 'asc', labels).reduce((n, s) => n + s.items.length, 0)
      expect(total).toBe(3)
    }
  })

  it('puts the feed bands first, unknown submissions in All', () => {
    const sections = sortQueue(items, 'intelligence', 'asc', labels)
    expect(sections.map((s) => s.key)).toEqual(['priority', 'discovery', 'all'])
    expect(sections[2].items[0].application_id).toBe('b')
  })

  it('sorts by date both ways and by name ignoring case', () => {
    expect(sortQueue(items, 'date', 'desc', labels)[0].items.map((i) => i.name)).toEqual(['adrien', 'Bastien', 'Zoé'])
    expect(sortQueue(items, 'date', 'asc', labels)[0].items.map((i) => i.name)).toEqual(['Zoé', 'Bastien', 'adrien'])
    expect(sortQueue(items, 'name', 'asc', labels)[0].items.map((i) => i.name)).toEqual(['adrien', 'Bastien', 'Zoé'])
    expect(sortQueue(items, 'name', 'desc', labels)[0].items.map((i) => i.name)).toEqual(['Zoé', 'Bastien', 'adrien'])
  })

  it('groups by role', () => {
    expect(sortQueue(items, 'role', 'asc', labels).map((s) => s.title)).toEqual(['Agnès', 'Chloé'])
  })

  it('tells unseen, seen, waiting and decided apart for the current reviewer', () => {
    const queue = buildQueue(
      [
        candidate('a', 'A', '2026-10-01'),
        candidate('b', 'B', '2026-10-01'),
        candidate('v', 'Voted', '2026-10-01', { good_count: 1 }),
        candidate('l', 'Labelled', '2026-10-01'),
        candidate('u', 'Under review', '2026-10-01', { status: 'under_review' }),
        candidate('e', 'E', '2026-10-01', { status: 'shortlisted' }),
        candidate('t', 'Teammate voted, I did not see', '2026-10-01', { maybe_count: 2 }),
      ],
      [],
    )
    const seen = new Set(['a', 'v', 'l', 'u', 'e'])
    const labelled = new Set(['l'])
    expect(progress(queue, seen, labelled)).toEqual({ total: 7, unseen: 2, seen: 1, waiting: 3, decided: 1 })
    const pick = (filter: Parameters<typeof matchesProgress>[1]) =>
      queue.filter((i) => matchesProgress(i, filter, seen, labelled)).map((i) => i.application_id)
    expect(pick('unseen')).toEqual(['b', 't'])
    expect(pick('seen')).toEqual(['a'])
    expect(pick('waiting')).toEqual(['v', 'l', 'u'])
    expect(pick('decided')).toEqual(['e'])
  })

  it('escapes CSV fields', () => {
    const csv = toCsv([items[0]], () => 'Waiting, "long"')
    expect(csv.split('\n')[1]).toContain('"Waiting, ""long"""')
  })
})
