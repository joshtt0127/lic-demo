import { Link } from 'react-router-dom'
import { Logo } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'
import { homeRouteFor } from '@/lib/access'
import { TalentCastingDetail } from '@/talent/TalentCastingDetail'

/**
 * A casting call opened through a shared link.
 *
 * Same page, same data, same RLS: a published casting is readable by any
 * signed-in account, which is what makes "Share" and "View as talent" honest.
 * Applying stays on the talent side.
 */
export function PublicCastingPage() {
  const { profile } = useAuth()
  const isTalent = profile?.account_type === 'talent'

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex h-16 w-full max-w-[1000px] items-center justify-between px-5 sm:px-8">
          <Link
            to={homeRouteFor(profile)}
            aria-label="Let It Cast"
            className="-my-1 flex items-center py-1"
          >
            <Logo size={24} />
          </Link>
          <Link
            to={homeRouteFor(profile)}
            className="-mr-2 inline-flex h-9 items-center rounded-btn px-2 text-sm font-semibold text-link hover:bg-link/5"
          >
            Back to my space
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1000px] px-5 py-7 sm:px-8">
        <TalentCastingDetail readOnly={!isTalent} />
      </main>
    </div>
  )
}
