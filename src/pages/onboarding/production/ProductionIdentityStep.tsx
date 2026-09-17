import { useState } from 'react'
import { Card, FormError, FormField, TextField } from '@/components/ui'
import { AvatarUpload } from '@/components/upload/AvatarUpload'
import { useAuth } from '@/features/auth/AuthProvider'
import { useOnboardingNav } from '@/features/onboarding/steps'
import { updateProfile, upsertProductionProfile } from '@/data/repositories/profiles'
import { displayName } from '@/lib/access'
import { errorMessage } from '@/lib/supabase'
import { StepActions } from '../StepActions'

/**
 * Production identity. The organization step lands in the next slice
 * (`feat/production-onboarding`); until then this step completes the onboarding.
 */
export function ProductionIdentityStep() {
  const { profile, refreshProfile } = useAuth()
  const nav = useOnboardingNav()

  const [form, setForm] = useState({
    firstName: profile?.first_name ?? '',
    lastName: profile?.last_name ?? '',
    jobTitle: '',
    city: profile?.city ?? '',
    country: profile?.country ?? '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  async function handleContinue() {
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
      await upsertProductionProfile(profile.id, { job_title: form.jobTitle.trim() || null })
      await refreshProfile()
      await nav.next()
    } catch (error) {
      setFormError(errorMessage(error, 'Could not save your details'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      <Card className="flex flex-col gap-5">
        {(formError || nav.error) && <FormError>{formError ?? nav.error}</FormError>}

        <FormField label="Profile photo" optional>
          <AvatarUpload
            profileId={profile?.id as string}
            avatarUrl={profile?.avatar_url ?? null}
            name={displayName(profile)}
          />
        </FormField>

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="First name"
            autoComplete="given-name"
            value={form.firstName}
            onChange={set('firstName')}
            error={errors.firstName}
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
          label="Job title"
          placeholder="Casting director, Producer, Assistant…"
          value={form.jobTitle}
          onChange={set('jobTitle')}
          optional
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="City" placeholder="Paris" value={form.city} onChange={set('city')} optional />
          <TextField
            label="Country"
            placeholder="France"
            value={form.country}
            onChange={set('country')}
            optional
          />
        </div>
      </Card>

      <StepActions
        onContinue={handleContinue}
        continueLabel="Enter Let It Cast"
        pending={pending || nav.pending}
      />
    </div>
  )
}
