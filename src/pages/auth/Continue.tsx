import { Navigate } from 'react-router-dom'
import { FullPageLoader } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'
import { homeRouteFor, isOnboarded } from '@/lib/access'
import { takeReturnTo } from '@/features/auth/returnTo'

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

  // Quelqu'un venu d'une annonce partagée retourne à cette annonce — mais
  // seulement une fois son onboarding terminé, sinon on le renvoie dans un
  // écran qu'il ne peut pas encore utiliser.
  if (isOnboarded(profile)) {
    const back = takeReturnTo()
    if (back) return <Navigate to={back} replace />
  }

  return <Navigate to={homeRouteFor(profile)} replace />
}
