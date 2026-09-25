import { describe, expect, it } from 'vitest'
import { currentStep, stepPosition, stepsFor, TALENT_STEPS } from './steps'
import type { ProfileRow } from '@/types/database'

const profile: ProfileRow = {
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
  platform_role: 'none' as const,
  suspended_at: null,
  suspended_reason: null,
  onboarding_completed_at: null,
  created_at: '2026-09-17T08:00:00Z',
  updated_at: '2026-09-17T08:00:00Z',
}

describe('onboarding step machine', () => {
  it('starts a talent on the identity step', () => {
    expect(currentStep(profile)).toBe('identity')
  })

  it('resumes the stored step', () => {
    expect(currentStep({ ...profile, onboarding_step: 'skills' })).toBe('skills')
  })

  it('ignores a stored step that does not belong to the account type', () => {
    const production = { ...profile, account_type: 'production' as const, onboarding_step: 'skills' }
    expect(currentStep(production)).toBe('identity')
  })

  it('walks the production side through identity then organization', () => {
    const production = { ...profile, account_type: 'production' as const }
    expect(currentStep({ ...production, onboarding_step: null })).toBe('identity')
    expect(currentStep({ ...production, onboarding_step: 'organization' })).toBe('organization')
    expect(stepPosition({ ...production, onboarding_step: 'organization' })).toEqual({
      index: 3,
      total: 3,
    })
  })

  it('numbers the steps after the account-type choice', () => {
    expect(stepPosition({ ...profile, onboarding_step: 'identity' })).toEqual({ index: 2, total: 5 })
    expect(stepPosition({ ...profile, onboarding_step: 'media' })).toEqual({ index: 5, total: 5 })
  })

  it('exposes only steps that have a screen', () => {
    expect(stepsFor('talent')).toEqual(TALENT_STEPS)
    expect(stepsFor('production')).toEqual(['identity', 'organization'])
  })
})
