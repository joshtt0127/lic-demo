import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Check, Users } from 'lucide-react'
import { Button, Card, FormError, Logo, Spinner } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'
import { useOrganizationMutations } from '@/features/organizations/queries'
import { errorMessage } from '@/lib/supabase'
import { useT } from '@/lib/i18n'

/**
 * Le lien d'invitation reçu par e-mail.
 *
 * Il n'y a rien à saisir : le jeton est dans l'URL, la base vérifie qu'il est
 * valide, non expiré, non utilisé, et adressé à l'adresse du compte connecté.
 * Si la personne n'est pas connectée, `RequireAuth` l'envoie se connecter et la
 * ramène ici — le lien survit au détour par l'inscription.
 *
 * Les erreurs sont dites telles quelles (« envoyée à une autre adresse »,
 * « déjà utilisée », « expirée ») : deviner pourquoi un lien ne marche pas est
 * la pire expérience qu'on puisse offrir à quelqu'un qu'on vient d'inviter.
 */
export function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const t = useT()
  const { joinByToken } = useOrganizationMutations(profile?.id)

  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  // Deux montages en StrictMode ne doivent pas consommer le jeton deux fois.
  const attempted = useRef(false)

  useEffect(() => {
    if (!token || attempted.current) return
    attempted.current = true
    joinByToken
      .mutateAsync(token)
      .then(() => setDone(true))
      .catch((joinError) => setError(errorMessage(joinError, t('invite.failed'))))
  }, [token, joinByToken, t])

  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => navigate('/studio', { replace: true }), 1200)
    return () => clearTimeout(timer)
  }, [done, navigate])

  if (!token) return <Navigate to="/" replace />

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-paper px-6 py-16">
      <Card className="w-full max-w-md text-center">
        <div className="flex justify-center">
          <Logo size={26} />
        </div>

        {done ? (
          <>
            <span className="mx-auto mt-6 flex h-11 w-11 items-center justify-center rounded-full bg-signal-good-bg text-signal-good">
              <Check className="h-5 w-5" />
            </span>
            <h1 className="mt-4 text-lg font-bold tracking-tight text-ink">
              {t('invite.joined')}
            </h1>
            <p className="mt-2 text-sm text-muted">{t('invite.joinedHint')}</p>
          </>
        ) : error ? (
          <>
            <h1 className="mt-6 text-lg font-bold tracking-tight text-ink">
              {t('invite.cannotJoin')}
            </h1>
            <div className="mt-3"><FormError>{error}</FormError></div>
            <Button className="mt-5" variant="ghost" onClick={() => navigate('/continue')}>
              {t('invite.continue')}
            </Button>
          </>
        ) : (
          <>
            <span className="mx-auto mt-6 flex h-11 w-11 items-center justify-center rounded-full bg-paper text-ink">
              <Users className="h-5 w-5" />
            </span>
            <h1 className="mt-4 flex items-center justify-center gap-2 text-lg font-bold tracking-tight text-ink">
              <Spinner className="h-4 w-4" />
              {t('invite.joining')}
            </h1>
          </>
        )}
      </Card>
    </div>
  )
}
