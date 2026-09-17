import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, FormError, PasswordField, Spinner, TextField } from '@/components/ui'
import { fieldErrors, signUpSchema } from '@/features/auth/validation'
import { useAuth } from '@/features/auth/AuthProvider'
import { track } from '@/lib/analytics'
import { AuthLayout } from './AuthLayout'

/**
 * Account creation. The account type is NOT asked here — the first onboarding
 * step ("How are you using Let It Cast?") owns that choice, so both sides of the
 * marketplace share one entry point.
 */
export function SignUp() {
  const { signUp, signIn } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const parsed = signUpSchema.safeParse(form)
    setErrors(fieldErrors(parsed))
    if (!parsed.success) return

    setPending(true)
    const { error } = await signUp(parsed.data)
    if (error) {
      setPending(false)
      setFormError(error)
      return
    }

    track('account_created')

    // Projects with email confirmation disabled return an active session right
    // away; otherwise sign in explicitly so the user lands in the onboarding.
    const { error: signInError } = await signIn({
      email: parsed.data.email,
      password: parsed.data.password,
    })
    setPending(false)

    if (signInError) {
      setFormError(
        'Your account is created. Confirm your email address, then sign in to continue.',
      )
      return
    }
    navigate('/onboarding', { replace: true })
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="One account, whether you cast or audition."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/auth/sign-in" className="font-semibold text-link hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {formError && <FormError>{formError}</FormError>}

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="First name"
            autoComplete="given-name"
            value={form.firstName}
            onChange={set('firstName')}
            error={errors.firstName}
            autoFocus
          />
          <TextField
            label="Last name"
            autoComplete="family-name"
            value={form.lastName}
            onChange={set('lastName')}
            error={errors.lastName}
          />
        </div>

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
        />

        <PasswordField
          label="Password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          hint="At least 8 characters."
        />

        <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
          {pending && <Spinner />}
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
