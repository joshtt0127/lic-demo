import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button, Card, FormError, Spinner, TextField } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'
import { completeOnboarding, updateProfile } from '@/data/repositories/profiles'
import { track } from '@/lib/analytics'
import { errorMessage } from '@/lib/supabase'

/**
 * Minimal identity step — the one thing both experiences need before landing in
 * the product. The richer, per-side onboarding (casting profile, media, skills,
 * organization…) builds on top of this.
 */
export function IdentityStep() {
  const { profile, refreshProfile } = useAuth()

  const [form, setForm] = useState({
    firstName: profile?.first_name ?? '',
    lastName: profile?.last_name ?? '',
    city: profile?.city ?? '',
    country: profile?.country ?? '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!profile) return
    setFormError(null)

    const nextErrors: Record<string, string> = {}
    if (!form.firstName.trim()) nextErrors.firstName = 'First name is required'
    if (!form.lastName.trim()) nextErrors.lastName = 'Last name is required'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setPending(true)
    try {
      await updateProfile(profile.id, {
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        city: form.city.trim() || null,
        country: form.country.trim() || null,
      })
      track('onboarding_step_completed', { step: 'identity' })
      await completeOnboarding(profile.id)
      track('onboarding_completed', { account_type: profile.account_type ?? '' })
      await refreshProfile()
      // The guard on /onboarding now sends the user to their surface.
    } catch (error) {
      setFormError(errorMessage(error, 'Could not save your details'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Card className="flex flex-col gap-4">
        {formError && <FormError>{formError}</FormError>}

        <div className="grid gap-3 sm:grid-cols-2">
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

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="City"
            placeholder="Los Angeles"
            value={form.city}
            onChange={set('city')}
            optional
          />
          <TextField
            label="Country"
            placeholder="United States"
            value={form.country}
            onChange={set('country')}
            optional
          />
        </div>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button type="submit" size="lg" disabled={pending} iconRight={!pending ? <ArrowRight className="h-4 w-4" /> : undefined}>
          {pending && <Spinner />}
          Continue
        </Button>
      </div>
    </form>
  )
}
