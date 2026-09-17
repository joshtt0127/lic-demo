import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { Button, FormError, Spinner, TextField } from '@/components/ui'
import { fieldErrors, forgotPasswordSchema } from '@/features/auth/validation'
import { useAuth } from '@/features/auth/AuthProvider'
import { AuthLayout } from './AuthLayout'

export function ForgotPassword() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const parsed = forgotPasswordSchema.safeParse({ email })
    setErrors(fieldErrors(parsed))
    if (!parsed.success) return

    setPending(true)
    const { error } = await requestPasswordReset(parsed.data.email)
    setPending(false)

    if (error) {
      setFormError(error)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <AuthLayout
        title="Check your inbox"
        subtitle={`We sent a reset link to ${email}. It expires in one hour.`}
        footer={
          <Link to="/auth/sign-in" className="font-semibold text-link hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="flex items-center gap-3 rounded-card border border-line bg-card p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-signal-good-bg text-signal-good">
            <MailCheck className="h-4 w-4" />
          </span>
          <p className="text-sm text-muted">
            No email? Check your spam folder, or{' '}
            <button
              type="button"
              onClick={() => setSent(false)}
              className="font-semibold text-link hover:underline"
            >
              try another address
            </button>
            .
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      footer={
        <Link to="/auth/sign-in" className="font-semibold text-link hover:underline">
          Back to sign in
        </Link>
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

        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending && <Spinner />}
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  )
}
