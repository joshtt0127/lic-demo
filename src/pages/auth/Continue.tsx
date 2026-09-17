import { Navigate } from 'react-router-dom'
import { FullPageLoader } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'
import { homeRouteFor } from '@/lib/access'

/**
 * Where sign-in and sign-up hand off to.
 *
 * The destination depends on the profile (onboarding vs talent vs studio),
 * which is loaded right after the session — so this route waits for it instead
 * of dropping the user on the public landing page.
 */
export function Continue() {
  const { profile, profileLoading } = useAuth()

  if (!profile && profileLoading) return <FullPageLoader label="Opening your space…" />
  return <Navigate to={homeRouteFor(profile)} replace />
}
