import { describe, expect, it } from 'vitest'
import { acceptedFrom, timecode, toCastingDraft, toProjectDraft, toRoleDraft } from './mapping'
import type { BriefExtractedField } from '@/types/database'

const field = (
  name: string,
  status: BriefExtractedField['status'],
  value: string | null,
  values: string[] = [],
): BriefExtractedField => ({ field: name, status, value, values, start: 3, quote: 'q' })

describe('brief mapping', () => {
  it('never turns a missing field into a value', () => {
    const accepted = acceptedFrom([
      field('title', 'detected', 'Evermore'),
      field('compensation', 'missing', 'should not appear'),
      field('deadline', 'missing', null),
    ])
    expect(toProjectDraft(accepted)).toEqual({ title: 'Evermore' })
    expect(toCastingDraft(accepted)).toEqual({})
  })

  it('keeps only values that fit the schema', () => {
    const accepted = acceptedFrom([
      field('production_type', 'suggested', 'tv series'),
      field('shooting_start', 'suggested', 'next spring'),
      field('shooting_end', 'detected', '2027-04-30'),
    ])
    expect(toProjectDraft(accepted)).toEqual({ productionType: 'TV series', shootingEnd: '2027-04-30' })
  })

  it('maps role criteria, drops unknown language codes and orders the ages', () => {
    const accepted = acceptedFrom([
      field('name', 'detected', 'Inès'),
      field('role_type', 'detected', 'Lead'),
      field('gender_pref', 'detected', 'female'),
      field('playing_age_min', 'detected', '35'),
      field('playing_age_max', 'detected', '25'),
      field('languages', 'detected', null, ['fr', 'xx', 'en']),
      field('skills', 'suggested', null, ['Horse riding', ' ']),
    ])
    expect(toRoleDraft(accepted, ['fr', 'en'])).toEqual({
      name: 'Inès',
      roleType: 'lead',
      genderPref: 'Female',
      playingAgeMin: 25,
      playingAgeMax: 35,
      languages: ['fr', 'en'],
      skills: ['Horse riding'],
    })
  })

  it('formats a source timecode', () => {
    expect(timecode(84.6)).toBe('01:24')
    expect(timecode(null)).toBe('')
  })
})
