import { Navigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { homeRouteFor, isOnboarded } from '@/lib/access'
import { AccountTypeStep } from './AccountTypeStep'
import { IdentityStep } from './IdentityStep'
import { OnboardingShell } from './OnboardingShell'

/**
 * Common onboarding entry point — one route, driven by the profile's own state
 * so a refresh or a reconnection resumes exactly where the user stopped.
 *
 *   no account_type      → "How are you using Let It Cast?"
 *   account_type set     → identity
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

  return (
    <OnboardingShell
      step={2}
      totalSteps={2}
      eyebrow={profile.account_type === 'talent' ? 'Talent onboarding' : 'Production onboarding'}
      title="Tell us who you are"
      subtitle="Your name is how productions and talents will recognise you."
    >
      <IdentityStep />
    </OnboardingShell>
  )
}
