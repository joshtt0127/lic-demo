import { Navigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { currentStep, stepPosition } from '@/features/onboarding/steps'
import { homeRouteFor, isOnboarded } from '@/lib/access'
import { AccountTypeStep } from './AccountTypeStep'
import { OnboardingShell } from './OnboardingShell'
import { TalentIdentityStep } from './talent/TalentIdentityStep'
import { CastingProfileStep } from './talent/CastingProfileStep'
import { SkillsStep } from './talent/SkillsStep'
import { MediaStep } from './talent/MediaStep'
import { ProductionIdentityStep } from './production/ProductionIdentityStep'

/**
 * Common onboarding entry point — one route, driven by the profile's own state
 * so a refresh or a reconnection resumes exactly where the user stopped.
 *
 *   no account_type      → "How are you using Let It Cast?"
 *   account_type set     → the steps of that side, in order
 *   onboarding completed → out to /talent or /studio
 */
export function Onboarding() {
  const { profile } = useAuth()

  if (isOnboarded(profile)) return <Navigate to={homeRouteFor(profile)} replace />

  if (!profile?.account_type) {
    return (
      <OnboardingShell
        wide
        step={1}
        totalSteps={2}
        eyebrow="Welcome to Let It Cast"
        title="How are you using Let It Cast?"
        subtitle="This shapes your whole experience — and it's the only thing we need up front."
      >
        <AccountTypeStep />
      </OnboardingShell>
    )
  }

  const step = currentStep(profile)
  const { index, total } = stepPosition(profile)
  const talent = profile.account_type === 'talent'
  const eyebrow = talent ? 'Talent onboarding' : 'Production onboarding'

  if (!talent) {
    return (
      <OnboardingShell
        step={index}
        totalSteps={total}
        eyebrow={eyebrow}
        title="Tell us who you are"
        subtitle="Your name and role are how talents and teammates will recognise you."
      >
        <ProductionIdentityStep />
      </OnboardingShell>
    )
  }

  switch (step) {
    case 'casting':
      return (
        <OnboardingShell
          step={index}
          totalSteps={total}
          eyebrow={eyebrow}
          title="Your casting profile"
          subtitle="What productions filter on. Everything here is optional and editable later."
        >
          <CastingProfileStep />
        </OnboardingShell>
      )
    case 'skills':
      return (
        <OnboardingShell
          step={index}
          totalSteps={total}
          eyebrow={eyebrow}
          title="What can you do?"
          subtitle="Add your skills and how strong you are at each — this is how roles find you."
        >
          <SkillsStep />
        </OnboardingShell>
      )
    case 'media':
      return (
        <OnboardingShell
          step={index}
          totalSteps={total}
          eyebrow={eyebrow}
          title="Add your media"
          subtitle="Headshots and a showreel. You can add more, and reorder them, any time."
        >
          <MediaStep />
        </OnboardingShell>
      )
    case 'identity':
    default:
      return (
        <OnboardingShell
          step={index}
          totalSteps={total}
          eyebrow={eyebrow}
          title="Tell us who you are"
          subtitle="Your name and photo are how productions will recognise you."
        >
          <TalentIdentityStep />
        </OnboardingShell>
      )
  }
}
