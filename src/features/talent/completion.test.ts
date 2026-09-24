import { describe, expect, it } from 'vitest'
import { missingForApplication, profileCompletion } from './completion'
import type { TalentProfileFull } from '@/data/repositories/talent'

const empty: TalentProfileFull = {
  profile: {
    id: 'p1',
    account_type: 'talent',
    first_name: null,
    last_name: null,
    avatar_url: null,
    locale: 'en',
    email_notifications: true,
    city: null,
    country: null,
    onboarding_step: null,
    adult_confirmed_at: null,
    onboarding_completed_at: null,
    created_at: '',
    updated_at: '',
  },
  talent: {
    profile_id: 'p1',
    professional_name: null,
    headline: null,
    bio: null,
    cover_url: null,
    gender: null,
    ethnicities: [],
    playing_age_min: null,
    playing_age_max: null,
    height_cm: null,
    nationalities: [],
    accents: [],
    union_name: null,
    experience_level: null,
    availability: 'available',
    website: null,
    agency_name: null,
    agent_name: null,
    agent_email: null,
    agent_phone: null,
    created_at: '',
    updated_at: '',
  },
  skills: [],
  languages: [],
  credits: [],
  training: [],
  media: [],
}

describe('profile completion', () => {
  it('is 0% on an untouched profile', () => {
    expect(profileCompletion(empty).percent).toBe(0)
  })

  it('counts a filled identity and weights the photo', () => {
    const withIdentity = {
      ...empty,
      profile: { ...empty.profile, first_name: 'Maya', last_name: 'Reyes', city: 'Los Angeles' },
    }
    const before = profileCompletion(withIdentity).percent
    const after = profileCompletion({
      ...withIdentity,
      profile: { ...withIdentity.profile, avatar_url: 'https://example.test/a.jpg' },
    }).percent
    expect(before).toBeGreaterThan(0)
    expect(after).toBeGreaterThan(before)
  })

  it('requires three skills before crediting the skills item', () => {
    const skill = (name: string) => ({ skillId: name, name, category: null, level: 2 as const })
    const two = profileCompletion({ ...empty, skills: [skill('Drama'), skill('Comedy')] })
    const three = profileCompletion({
      ...empty,
      skills: [skill('Drama'), skill('Comedy'), skill('Singing')],
    })
    expect(two.missing.some((item) => item.key === 'skills')).toBe(true)
    expect(three.missing.some((item) => item.key === 'skills')).toBe(false)
  })

  it('reaches 100% when everything is filled', () => {
    const full = profileCompletion({
      profile: {
        ...empty.profile,
        first_name: 'Maya',
        last_name: 'Reyes',
        city: 'Los Angeles',
        avatar_url: 'https://example.test/a.jpg',
      },
      talent: {
        ...empty.talent,
        headline: 'Actress',
        bio: 'Bio',
        gender: 'Female',
        playing_age_min: 24,
        playing_age_max: 34,
      },
      skills: [
        { skillId: '1', name: 'Drama', category: null, level: 3 },
        { skillId: '2', name: 'Comedy', category: null, level: 2 },
        { skillId: '3', name: 'Singing', category: null, level: 2 },
      ],
      languages: [{ code: 'en', name: 'English', fluency: null }],
      credits: [
        {
          id: 'c1',
          talent_id: 'p1',
          title: 'Evermore',
          role_name: 'Fanny',
          category: 'Series',
          year: '2026',
          director: null,
          company: null,
          location: null,
          url: null,
          sort_order: 0,
          created_at: '',
        },
      ],
      training: [],
      media: [
        {
          id: 'm1',
          owner_id: 'p1',
          kind: 'headshot',
          bucket: 'media',
          path: 'p1/a.jpg',
          mime: 'image/jpeg',
          bytes: 1,
          width: null,
          height: null,
          duration_s: null,
          caption: null,
          sort_order: 0,
          created_at: '',
        },
        {
          id: 'm2',
          owner_id: 'p1',
          kind: 'showreel',
          bucket: 'media',
          path: 'p1/b.mp4',
          mime: 'video/mp4',
          bytes: 1,
          width: null,
          height: null,
          duration_s: null,
          caption: null,
          sort_order: 0,
          created_at: '',
        },
      ],
    })
    expect(full.percent).toBe(100)
    expect(full.missing).toHaveLength(0)
  })
})

describe('what a talent needs before applying', () => {
  it('asks for the four things a production cannot judge without', () => {
    expect(missingForApplication(empty)).toEqual(['name', 'photo', 'playingAge', 'location'])
  })

  it('accepts a professional name in place of a first and last name', () => {
    const named = { ...empty, talent: { ...empty.talent, professional_name: 'Vera Frame' } }
    expect(missingForApplication(named)).not.toContain('name')
  })

  it('counts a headshot as a photo, not only an avatar', () => {
    const withHeadshot = {
      ...empty,
      media: [
        {
          id: 'm1',
          owner_id: 'p1',
          kind: 'headshot' as const,
          bucket: 'media',
          path: 'p1/shot.jpg',
          mime: 'image/jpeg',
          bytes: 1,
          width: null,
          height: null,
          duration_s: null,
          caption: null,
          sort_order: 0,
          created_at: '',
        },
      ],
    }
    expect(missingForApplication(withHeadshot)).not.toContain('photo')
  })

  it('is satisfied once the four are there — the rest of the profile is a bonus', () => {
    const ready = {
      ...empty,
      profile: {
        ...empty.profile,
        first_name: 'Vera',
        last_name: 'Frame',
        city: 'Paris',
        avatar_url: 'a.jpg',
      },
      talent: { ...empty.talent, playing_age_min: 25, playing_age_max: 35 },
    }
    expect(missingForApplication(ready)).toEqual([])
  })
})
