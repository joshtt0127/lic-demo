import { useCallback, useState } from 'react'
import { completeOnboarding, updateProfile } from '@/data/repositories/profiles'
import { useAuth } from '@/features/auth/AuthProvider'
import { track } from '@/lib/analytics'
import { errorMessage } from '@/lib/supabase'
import type { AccountType, ProfileRow } from '@/types/database'

/**
 * Onboarding is resumable: the current step lives in `profiles.onboarding_step`,
 * so closing the tab, refreshing or signing back in resumes exactly where the
 * user stopped — nothing is held in React state.
 */

export const TALENT_STEPS = ['identity', 'casting', 'skills', 'media'] as const
export const PRODUCTION_STEPS = ['identity', 'organization'] as const

export type TalentStep = (typeof TALENT_STEPS)[number]
export type ProductionStep = (typeof PRODUCTION_STEPS)[number]
export type OnboardingStep = TalentStep | ProductionStep

export function stepsFor(accountType: AccountType): readonly OnboardingStep[] {
  return accountType === 'talent' ? TALENT_STEPS : PRODUCTION_STEPS
}

/** Current step, defaulting to the first one when the profile has none yet. */
export function currentStep(profile: ProfileRow): OnboardingStep {
  const steps = stepsFor(profile.account_type ?? 'talent')
  const stored = profile.onboarding_step as OnboardingStep | null
  return stored && steps.includes(stored) ? stored : steps[0]
}

export function stepPosition(profile: ProfileRow): { index: number; total: number } {
  const steps = stepsFor(profile.account_type ?? 'talent')
  // +1 / +1 because picking the account type is step 1 of the whole flow.
  return { index: steps.indexOf(currentStep(profile)) + 2, total: steps.length + 1 }
}

export function useOnboardingNav() {
  const { profile, refreshProfile } = useAuth()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const steps = stepsFor(profile?.account_type ?? 'talent')
  const step = profile ? currentStep(profile) : steps[0]
  const index = steps.indexOf(step)

  const goTo = useCallback(
    async (target: OnboardingStep | null) => {
      if (!profile) return
      setError(null)
      setPending(true)
      try {
        if (target === null) {
          await completeOnboarding(profile.id)
          track('onboarding_completed', { account_type: profile.account_type ?? '' })
        } else {
          await updateProfile(profile.id, { onboarding_step: target })
        }
        await refreshProfile()
      } catch (navError) {
        setError(errorMessage(navError, 'Could not save your progress'))
      } finally {
        setPending(false)
      }
    },
    [profile, refreshProfile],
  )

  const next = useCallback(async () => {
    track('onboarding_step_completed', { step })
    const following = steps[index + 1] ?? null
    await goTo(following)
  }, [goTo, index, step, steps])

  const back = useCallback(async () => {
    const previous = steps[index - 1]
    if (previous) await goTo(previous)
  }, [goTo, index, steps])

  return {
    step,
    steps,
    index,
    isFirst: index === 0,
    isLast: index === steps.length - 1,
    next,
    back,
    goTo,
    pending,
    error,
  }
}
