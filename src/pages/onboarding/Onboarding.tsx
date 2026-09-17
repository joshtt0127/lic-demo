import { Navigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { currentStep, stepPosition, useOnboardingNav } from '@/features/onboarding/steps'
import { homeRouteFor, isOnboarded } from '@/lib/access'
import { AccountTypeStep } from './AccountTypeStep'
import { OnboardingShell } from './OnboardingShell'
import type { StepperItem } from './VerticalStepper'
import { TalentIdentityStep } from './talent/TalentIdentityStep'
import { CastingProfileStep } from './talent/CastingProfileStep'
import { SkillsStep } from './talent/SkillsStep'
import { MediaStep } from './talent/MediaStep'
import { ProductionIdentityStep } from './production/ProductionIdentityStep'
import { OrganizationStep } from './production/OrganizationStep'

/**
 * Common onboarding entry point — one route, driven by the profile's own state
 * so a refresh or a reconnection resumes exactly where the user stopped.
 *
 *   no account_type      → "How are you using Let It Cast?"
 *   account_type set     → the steps of that side, in order
 *   onboarding completed → out to /talent or /studio
 */

const PRODUCTION_STEPPER: StepperItem[] = [
  { label: 'Your profile', hint: 'Name, role, photo' },
  { label: 'Your organization', hint: 'Create or join a team' },
]

const TALENT_STEPPER: StepperItem[] = [
  { label: 'Your identity', hint: 'Basic information' },
  { label: 'Casting profile', hint: 'Help us match you' },
  { label: 'Your experience', hint: 'Skills and credits' },
  { label: 'You’re all set', hint: 'Photos & showreel' },
]

export function Onboarding() {
  const { profile } = useAuth()
  // Used only for the header's "Skip for now" on the split steps; each step
  // owns its own navigation for Back / Continue.
  const nav = useOnboardingNav()

  if (isOnboarded(profile)) return <Navigate to={homeRouteFor(profile)} replace />

  // ── The fork: talent or production ──
  if (!profile?.account_type) {
    return (
      <OnboardingShell
        eyebrow="Welcome to Let It Cast"
        title="How are you using Let It Cast?"
        subtitle="This shapes your whole experience — and it’s the only thing we need up front."
        step={1}
        totalSteps={2}
        progressPlacement="header"
        panel={false}
      >
        <AccountTypeStep />
      </OnboardingShell>
    )
  }

  const step = currentStep(profile)
  const { index, total } = stepPosition(profile)
  const talent = profile.account_type === 'talent'

  if (!talent) {
    const productionStep = index - 1
    const productionTotal = total - 1

    if (step === 'organization') {
      return (
        <OnboardingShell
          eyebrow="Production onboarding"
          title="Set up your organization"
          subtitle="Projects, castings and candidates belong to a team. You can invite the rest of it right after."
          step={productionStep}
          totalSteps={productionTotal}
          stepperItems={PRODUCTION_STEPPER}
        >
          <OrganizationStep />
        </OnboardingShell>
      )
    }

    return (
      <OnboardingShell
        eyebrow="Production onboarding"
        title="Tell us who you are"
        subtitle="Your name and role are how talents and teammates will recognise you."
        step={productionStep}
        totalSteps={productionTotal}
        stepperItems={PRODUCTION_STEPPER}
      >
        <ProductionIdentityStep />
      </OnboardingShell>
    )
  }

  // The account-type choice is step 1 of the whole flow; inside the talent
  // wizard the design numbers the four steps 1 → 4.
  const talentStep = index - 1
  const talentTotal = total - 1

  switch (step) {
    case 'casting':
      return (
        <OnboardingShell
          title="Your casting profile"
          subtitle="What productions filter on. Everything here is optional and editable later."
          step={talentStep}
          totalSteps={talentTotal}
          stepperItems={TALENT_STEPPER}
          onSkip={() => void nav.next()}
        >
          <CastingProfileStep />
        </OnboardingShell>
      )
    case 'skills':
      return (
        <OnboardingShell
          variant="centered"
          title="What can you do?"
          subtitle="Add your skills and how strong you are at each — this is how roles find you."
          step={talentStep}
          totalSteps={talentTotal}
        >
          <SkillsStep />
        </OnboardingShell>
      )
    case 'media':
      return (
        <OnboardingShell
          variant="centered"
          title="You’re all set"
          subtitle="Add your photos and a showreel — this is what productions see first."
          step={talentStep}
          totalSteps={talentTotal}
        >
          <MediaStep />
        </OnboardingShell>
      )
    case 'identity':
    default:
      return (
        <OnboardingShell
          title="Tell us who you are"
          subtitle="Your name and photo are how productions will recognise you."
          step={talentStep}
          totalSteps={talentTotal}
          stepperItems={TALENT_STEPPER}
        >
          <TalentIdentityStep />
        </OnboardingShell>
      )
  }
}
