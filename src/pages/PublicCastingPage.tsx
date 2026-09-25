import { Link, useLocation } from 'react-router-dom'
import { Logo } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'
import { homeRouteFor } from '@/lib/access'
import { useT } from '@/lib/i18n'
import { TalentCastingDetail } from '@/talent/TalentCastingDetail'

/**
 * Une annonce ouverte depuis un lien partagé — **sans compte si besoin**.
 *
 * Même page, mêmes données, mêmes policies : une annonce publiée est lisible
 * par n'importe qui, connecté ou non. C'est ce qui fait qu'un lien partagé sur
 * un réseau ou dans un groupe fait son travail, au lieu de demander la création
 * d'un compte pour savoir si l'annonce intéresse.
 *
 * Candidater, en revanche, demande un compte comédien — et le retour se fait
 * **sur cette annonce**, pas sur un accueil générique : `next` porte le chemin
 * courant, `RequireAuth` et l'écran de connexion le respectent déjà.
 */
export function PublicCastingPage() {
  const { profile, session } = useAuth()
  const location = useLocation()
  const t = useT()
  const isTalent = profile?.account_type === 'talent'
  const next = encodeURIComponent(location.pathname)

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
          {session ? (
            <Link
              to={homeRouteFor(profile)}
              className="-mr-2 inline-flex h-9 items-center rounded-btn px-2 text-sm font-semibold text-link hover:bg-link/5"
            >
              {t('publicCasting.backToSpace')}
            </Link>
          ) : (
            <Link
              to={`/auth/sign-in?next=${next}`}
              className="inline-flex h-9 items-center rounded-field bg-cream px-3.5 text-[13px] font-bold text-ink transition-colors hover:bg-cream/80"
            >
              {t('publicCasting.signIn')}
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1000px] px-5 py-7 sm:px-8">
        <TalentCastingDetail readOnly={!isTalent} />

        {/* Le visiteur sans compte voit tout, et sait quoi faire ensuite. */}
        {!session && (
          <div className="mt-6 flex flex-col items-start gap-3 rounded-card border border-line bg-card p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-ink">{t('publicCasting.applyTitle')}</p>
              <p className="mt-0.5 text-[13.5px] text-muted">{t('publicCasting.applyHint')}</p>
            </div>
            <Link
              to={`/auth/sign-up?next=${next}`}
              className="inline-flex h-12 shrink-0 items-center rounded-field bg-ink px-5 text-[14px] font-bold text-white transition-colors hover:bg-ink/90"
            >
              {t('publicCasting.createAccount')}
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
