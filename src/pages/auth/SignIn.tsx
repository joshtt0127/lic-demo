import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Lock, Mail } from 'lucide-react'
import { Checkbox, FormError, FormField, Input, PasswordInput, Spinner } from '@/components/ui'
import { fieldErrors, signInSchema } from '@/features/auth/validation'
import { useAuth } from '@/features/auth/AuthProvider'
import { track } from '@/lib/analytics'
import { AuthLayout } from './AuthLayout'

export function SignIn() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [keepSignedIn, setKeepSignedIn] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const parsed = signInSchema.safeParse({ email, password })
    const nextErrors = fieldErrors(parsed)
    setErrors(nextErrors)
    if (!parsed.success) return

    setPending(true)
    const { error } = await signIn({ ...parsed.data, keepSignedIn })
    setPending(false)

    if (error) {
      setFormError(error)
      return
    }
    track('signed_in')
    // /continue waits for the profile, then routes to the right space.
    navigate(next || '/continue', { replace: true })
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your account"
      topRight={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/auth/sign-up" className="font-semibold text-link hover:underline">
            Sign up
          </Link>
        </>
      }
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/auth/sign-up" className="font-semibold text-link hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {formError && <FormError>{formError}</FormError>}

        <FormField label="Email" htmlFor="signin-email" plainLabel error={errors.email}>
          <Input
            id="signin-email"
            fieldSize="lg"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            icon={<Mail className="h-[18px] w-[18px]" />}
            invalid={Boolean(errors.email)}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoFocus
          />
        </FormField>

        <FormField label="Password" htmlFor="signin-password" plainLabel error={errors.password}>
          <PasswordInput
            id="signin-password"
            fieldSize="lg"
            autoComplete="current-password"
            placeholder="Your password"
            icon={<Lock className="h-[18px] w-[18px]" />}
            invalid={Boolean(errors.password)}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormField>

        <div className="flex items-center justify-between gap-3">
          <Checkbox
            id="keep-signed-in"
            checked={keepSignedIn}
            onChange={setKeepSignedIn}
            label="Keep me signed in"
          />
          <Link
            to="/auth/forgot-password"
            className="text-sm font-semibold text-link hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="mt-1 inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-field bg-ink text-[15px] font-bold text-white transition-all hover:bg-ink/90 active:scale-[0.99] disabled:opacity-60"
        >
          {pending && <Spinner className="h-[18px] w-[18px]" />}
          Sign in
          {!pending && <ArrowRight className="h-[18px] w-[18px]" />}
        </button>
      </form>

    </AuthLayout>
  )
}
