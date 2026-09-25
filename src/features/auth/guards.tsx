import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ConfigNotice } from '@/components/ConfigNotice'
import { Button, Card, FullPageLoader, Logo } from '@/components/ui'
import { canAccessSurface, homeRouteFor, isOnboarded, type Surface } from '@/lib/access'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAuth } from './AuthProvider'

/**
 * Route guards.
 *
 * They all wait for `ready` (session restore) before deciding, so a refresh on
 * a protected page never flashes the sign-in screen.
 */

/**
 * Un chargement qui n'aboutit pas finit par devoir le dire.
 *
 * Attendre est normal ; attendre sans fin ne l'est pas. Passé ce délai, on
 * arrête de faire tourner un spinner et on rend la main : une phrase, un
 * bouton. Mesuré en vrai — une requête de profil mise en pause laissait l'écran
 * « chargement de votre profil » indéfiniment.
 */
const GIVE_UP_MS = 8000

function useTooLong(active: boolean): boolean {
  const [tooLong, setTooLong] = useState(false)
  useEffect(() => {
    if (!active) {
      setTooLong(false)
      return
    }
    const timer = setTimeout(() => setTooLong(true), GIVE_UP_MS)
    return () => clearTimeout(timer)
  }, [active])
  return tooLong
}

function ProfileError({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <Card className="w-full max-w-md text-center">
        <div className="flex justify-center">
          <Logo size={26} />
        </div>
        <h1 className="mt-6 text-lg font-bold tracking-tight text-ink">
          We could not load your profile
        </h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <Button className="mt-5" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </Card>
    </div>
  )
}

/** Signed in, with a profile loaded. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { ready, session, profile, profileLoading, profileError, profilePaused } = useAuth()
  const location = useLocation()
  const stuck = useTooLong(!profile && (profileLoading || profilePaused))

  if (!isSupabaseConfigured) return <ConfigNotice />
  if (!ready) return <FullPageLoader label="Restoring your session…" />

  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/auth/sign-in?next=${next}`} replace />
  }

  if (profileError) return <ProfileError message={profileError} />
  if (!profile && (profileLoading || profilePaused)) {
    if (stuck) {
      return (
        <ProfileError
          message={
            profilePaused
              ? 'You appear to be offline. Check your connection and try again.'
              : 'This is taking longer than it should. Try again.'
          }
        />
      )
    }
    return <FullPageLoader label="Loading your profile…" />
  }

  return <>{children ?? <Outlet />}</>
}

/**
 * Réservé au personnel LIC.
 *
 * La garde d'écran n'est qu'un confort : ce sont les policies et les fonctions
 * `admin_*` qui refusent, et elles refuseraient même si quelqu'un atteignait
 * l'URL. Un écran n'est jamais une frontière de sécurité.
 */
export function RequireLicStaff({ children }: { children?: ReactNode }) {
  const { profile } = useAuth()

  return (
    <RequireAuth>
      {profile && profile.platform_role !== 'none' ? (
        (children ?? <Outlet />)
      ) : (
        <Navigate to={homeRouteFor(profile)} replace />
      )}
    </RequireAuth>
  )
}

/** Signed in **and** on the right side of the marketplace. */
export function RequireSurface({ surface, children }: { surface: Surface; children?: ReactNode }) {
  const { profile } = useAuth()

  return (
    <RequireAuth>
      <SurfaceGate surface={surface} profile={profile}>
        {children ?? <Outlet />}
      </SurfaceGate>
    </RequireAuth>
  )
}

function SurfaceGate({
  surface,
  profile,
  children,
}: {
  surface: Surface
  profile: ReturnType<typeof useAuth>['profile']
  children: ReactNode
}) {
  // No account type, or a wizard left half-finished: back to the onboarding,
  // which resumes at the stored step.
  if (!isOnboarded(profile)) return <Navigate to="/onboarding" replace />
  if (!canAccessSurface(profile, surface)) return <Navigate to={homeRouteFor(profile)} replace />
  return <>{children}</>
}

/** Already signed in → straight to your space (used on /auth/*). */
export function RedirectIfSignedIn({ children }: { children?: ReactNode }) {
  const { ready, session, profile, profileLoading } = useAuth()
  const location = useLocation()
  const next = new URLSearchParams(location.search).get('next')

  if (!isSupabaseConfigured) return <ConfigNotice />
  if (!ready) return <FullPageLoader />
  if (session) {
    if (profileLoading && !profile) return <FullPageLoader />
    return <Navigate to={next || homeRouteFor(profile)} replace />
  }
  return <>{children ?? <Outlet />}</>
}
