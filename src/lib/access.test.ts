import { describe, expect, it } from 'vitest'
import { ASSIGNABLE_ORG_ROLES, can, canAccessSurface, displayName, homeRouteFor, isOnboarded } from './access'
import type { ProfileRow } from '@/types/database'

const base: ProfileRow = {
  id: 'p1',
  account_type: 'talent',
  first_name: 'Maya',
  last_name: 'Reyes',
  avatar_url: null,
  locale: 'en',
  email_notifications: true,
  city: 'Los Angeles',
  country: 'US',
  onboarding_step: null,
  onboarding_completed_at: '2026-09-01T10:00:00Z',
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
}

describe('routing by account type', () => {
  it('sends a fresh account to the onboarding', () => {
    expect(homeRouteFor({ ...base, account_type: null })).toBe('/onboarding')
  })

  it('keeps an unfinished onboarding in the wizard', () => {
    expect(homeRouteFor({ ...base, onboarding_completed_at: null })).toBe('/onboarding')
  })

  it('sends each account type to its own surface', () => {
    expect(homeRouteFor(base)).toBe('/talent')
    expect(homeRouteFor({ ...base, account_type: 'production' })).toBe('/studio')
  })

  it('treats a missing profile as not onboarded', () => {
    expect(isOnboarded(null)).toBe(false)
    expect(homeRouteFor(null)).toBe('/onboarding')
  })
})

describe('surface access', () => {
  it('lets a talent into the talent space only', () => {
    expect(canAccessSurface(base, 'talent')).toBe(true)
    expect(canAccessSurface(base, 'studio')).toBe(false)
  })

  it('lets production into the studio only', () => {
    const production = { ...base, account_type: 'production' as const }
    expect(canAccessSurface(production, 'studio')).toBe(true)
    expect(canAccessSurface(production, 'talent')).toBe(false)
  })

  it('refuses everything without an account type', () => {
    expect(canAccessSurface({ ...base, account_type: null }, 'talent')).toBe(false)
  })
})

describe('organization capabilities', () => {
  it('lets owners and casting directors publish a casting', () => {
    expect(can('owner', 'casting:publish')).toBe(true)
    expect(can('casting_director', 'casting:publish')).toBe(true)
  })

  it('separates administering the organization from owning it', () => {
    // Un admin gère l'équipe au quotidien…
    expect(can('admin', 'org:manage')).toBe(true)
    expect(can('admin', 'org:invite')).toBe(true)
    // …mais il ne décide pas de qui possède l'organisation.
    expect(can('admin', 'org:transfer')).toBe(false)
    expect(can('owner', 'org:transfer')).toBe(true)
  })

  it('no longer offers casting director when assigning a role', () => {
    expect(ASSIGNABLE_ORG_ROLES).toEqual(['admin', 'member', 'viewer'])
  })

  it('stops a plain member from publishing or deciding', () => {
    expect(can('member', 'casting:publish')).toBe(false)
    expect(can('member', 'candidate:decide')).toBe(false)
    expect(can('member', 'candidate:review')).toBe(true)
  })

  it('gives a viewer nothing', () => {
    expect(can('viewer', 'candidate:review')).toBe(false)
    expect(can('viewer', 'message:send')).toBe(false)
  })

  it('refuses a non-member', () => {
    expect(can(null, 'candidate:review')).toBe(false)
  })
})

describe('displayName', () => {
  it('joins the names and falls back when empty', () => {
    expect(displayName(base)).toBe('Maya Reyes')
    expect(displayName({ ...base, first_name: null, last_name: null })).toBe('Your profile')
  })
})
