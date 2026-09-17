import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, FormError, PasswordField, Spinner, TextField } from '@/components/ui'
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
    const { error } = await signIn(parsed.data)
    setPending(false)

    if (error) {
      setFormError(error)
      return
    }
    track('signed_in')
    // The guard on the target route resolves the final destination.
    navigate(next || '/', { replace: true })
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your Let It Cast account."
      footer={
        <>
          New here?{' '}
          <Link to="/auth/sign-up" className="font-semibold text-link hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {formError && <FormError>{formError}</FormError>}

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          autoFocus
        />

        <div>
          <PasswordField
            label="Password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />
          <div className="mt-2 text-right">
            <Link to="/auth/forgot-password" className="text-xs font-medium text-link hover:underline">
              Forgot your password?
            </Link>
          </div>
        </div>

        <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
          {pending && <Spinner />}
          Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}
