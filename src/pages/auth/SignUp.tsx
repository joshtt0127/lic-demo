import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Lock, Mail, MailCheck } from 'lucide-react'
import {
  Button,
  FormError,
  FormField,
  Input,
  PasswordInput,
  Spinner,
  TextField,
} from '@/components/ui'
import { fieldErrors, signUpSchema } from '@/features/auth/validation'
import { useAuth } from '@/features/auth/AuthProvider'
import { rememberReturnTo } from '@/features/auth/returnTo'
import { useT } from '@/lib/i18n'
import { track } from '@/lib/analytics'
import { AuthLayout } from './AuthLayout'

/**
 * Account creation. The account type is NOT asked here — the first onboarding
 * step ("How are you using Let It Cast?") owns that choice, so both sides of the
 * marketplace share one entry point.
 */
export function SignUp() {
  const t = useT()
  const { signUp, signIn, resendConfirmation } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<string | null>(null)
  const [resent, setResent] = useState<string | null>(null)

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const parsed = signUpSchema.safeParse(form)
    setErrors(fieldErrors(parsed))
    if (!parsed.success) return

    setPending(true)
    const { error, needsConfirmation } = await signUp(parsed.data)
    if (error) {
      setPending(false)
      setFormError(error)
      return
    }

    track('account_created')

    // With email confirmation on, there is no session yet: the account waits
    // for the link. Otherwise sign in so the user lands in the onboarding.
    if (needsConfirmation) {
      setPending(false)
      setAwaitingConfirmation(parsed.data.email)
      return
    }

    const { error: signInError } = await signIn({
      email: parsed.data.email,
      password: parsed.data.password,
    })
    setPending(false)

    if (signInError) {
      setAwaitingConfirmation(parsed.data.email)
      return
    }
    // Un lien de casting partagé doit ramener sur ce casting, même après
    // l'onboarding : `/continue` consommera ce retour.
    rememberReturnTo(params.get('next'))
    navigate('/continue', { replace: true })
  }

  async function resend() {
    if (!awaitingConfirmation) return
    setResent(null)
    const { error } = await resendConfirmation(awaitingConfirmation)
    setResent(error ?? t('auth.confirm.resent'))
  }

  if (awaitingConfirmation) {
    return (
      <AuthLayout
        title={t('auth.confirm.title')}
        subtitle={t('auth.confirm.subtitle', { email: awaitingConfirmation })}
      >
        <div className="flex flex-col gap-4">
          <p className="flex items-start gap-2.5 rounded-field bg-paper p-3.5 text-[13.5px] leading-relaxed text-ink/90">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            {t('auth.confirm.hint')}
          </p>

          {resent && <p className="text-[13px] text-muted">{resent}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={resend}>
              {t('auth.confirm.resend')}
            </Button>
            <Link
              to="/auth/sign-in"
              className="inline-flex min-h-[36px] items-center rounded-btn px-2 text-[13px] font-semibold text-link hover:bg-link/5"
            >
              {t('auth.toSignIn')}
            </Link>
          </div>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t('auth.signUp.title')}
      subtitle="One account, whether you cast or audition."
      topRight={
        <>
          {t('auth.hasAccount')}{' '}
          <Link to="/auth/sign-in" className="inline-flex min-h-[34px] items-center font-semibold text-link hover:underline">
            {t('auth.toSignIn')}
          </Link>
        </>
      }
      footer={
        <>
          {t('auth.hasAccount')}{' '}
          <Link to="/auth/sign-in" className="inline-flex min-h-[34px] items-center font-semibold text-link hover:underline">
            {t('auth.toSignIn')}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {formError && <FormError>{formError}</FormError>}

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label={t('auth.firstName')}
            plainLabel
            fieldSize="lg"
            autoComplete="given-name"
            value={form.firstName}
            onChange={set('firstName')}
            error={errors.firstName}
            autoFocus
          />
          <TextField
            label={t('auth.lastName')}
            plainLabel
            fieldSize="lg"
            autoComplete="family-name"
            value={form.lastName}
            onChange={set('lastName')}
            error={errors.lastName}
          />
        </div>

        <FormField label={t('auth.email')} htmlFor="signup-email" plainLabel error={errors.email}>
          <Input
            id="signup-email"
            fieldSize="lg"
            type="email"
            autoComplete="email"
            placeholder={t('auth.emailPlaceholder')}
            icon={<Mail className="h-[18px] w-[18px]" />}
            invalid={Boolean(errors.email)}
            value={form.email}
            onChange={set('email')}
          />
        </FormField>

        <FormField
          label={t('auth.password')}
          htmlFor="signup-password"
          plainLabel
          error={errors.password}
          hint="At least 8 characters."
        >
          <PasswordInput
            id="signup-password"
            fieldSize="lg"
            autoComplete="new-password"
            placeholder="Create a password"
            icon={<Lock className="h-[18px] w-[18px]" />}
            invalid={Boolean(errors.password)}
            value={form.password}
            onChange={set('password')}
          />
        </FormField>

        <button
          type="submit"
          disabled={pending}
          className="mt-1 inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-field bg-ink text-[15px] font-bold text-white transition-all hover:bg-ink/90 active:scale-[0.99] disabled:opacity-60"
        >
          {pending && <Spinner className="h-[18px] w-[18px]" />}
          {t('auth.signUp.submit')}
          {!pending && <ArrowRight className="h-[18px] w-[18px]" />}
        </button>
      </form>

    </AuthLayout>
  )
}
