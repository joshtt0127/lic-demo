import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, FormError, PasswordField, Spinner } from '@/components/ui'
import { fieldErrors, resetPasswordSchema } from '@/features/auth/validation'
import { useAuth } from '@/features/auth/AuthProvider'
import { homeRouteFor } from '@/lib/access'
import { AuthLayout } from './AuthLayout'

/**
 * Landing page of the reset email. The Supabase client consumes the recovery
 * token from the URL (`detectSessionInUrl`), which gives a short-lived session —
 * so this route must stay reachable while "signed in".
 */
export function ResetPassword() {
  const { ready, session, profile, updatePassword } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ password: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const parsed = resetPasswordSchema.safeParse(form)
    setErrors(fieldErrors(parsed))
    if (!parsed.success) return

    setPending(true)
    const { error } = await updatePassword(parsed.data.password)
    setPending(false)

    if (error) {
      setFormError(error)
      return
    }
    navigate(homeRouteFor(profile), { replace: true })
  }

  if (ready && !session) {
    return (
      <AuthLayout
        title="This link has expired"
        subtitle="Reset links are valid for one hour and can only be used once."
        footer={
          <Link to="/auth/sign-in" className="font-semibold text-link hover:underline">
            Back to sign in
          </Link>
        }
      >
        <Button onClick={() => navigate('/auth/forgot-password')} size="lg" className="w-full">
          Request a new link
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="You'll stay signed in on this device.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {formError && <FormError>{formError}</FormError>}

        <PasswordField
          label="New password"
          autoComplete="new-password"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          hint="At least 8 characters."
          autoFocus
        />

        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={set('confirm')}
          error={errors.confirm}
        />

        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending && <Spinner />}
          Update password
        </Button>
      </form>
    </AuthLayout>
  )
}
