import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { FormError, Spinner, TextField } from '@/components/ui'
import { AvatarUpload } from '@/components/upload/AvatarUpload'
import { useAuth } from '@/features/auth/AuthProvider'
import { useOnboardingNav } from '@/features/onboarding/steps'
import { updateProfile, upsertProductionProfile } from '@/data/repositories/profiles'
import { displayName } from '@/lib/access'
import { errorMessage } from '@/lib/supabase'
import { CountryField } from '../CountryField'

/** Production step 1 — who you are on the production side. */
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
      await upsertProductionProfile(profile.id, { job_title: form.jobTitle.trim() || null })
      await refreshProfile()
      await nav.next()
    } catch (saveError) {
      setFormError(errorMessage(saveError, 'Could not save your details'))
    } finally {
      setPending(false)
    }
  }

  const busy = pending || nav.pending

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-7" noValidate>
      {(formError || nav.error) && <FormError>{formError ?? nav.error}</FormError>}

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-[19px] font-bold text-ink">Profile photo</h2>
          <p className="mt-1 text-[14px] text-muted">
            Talents and teammates see this next to your name and your notes.
          </p>
        </div>
        <AvatarUpload
          profileId={profile?.id as string}
          avatarUrl={profile?.avatar_url ?? null}
          name={displayName(profile)}
        />
      </section>

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="First name"
          plainLabel
          fieldSize="lg"
          autoComplete="given-name"
          value={form.firstName}
          onChange={set('firstName')}
          error={errors.firstName}
        />
        <TextField
          label="Last name"
          plainLabel
          fieldSize="lg"
          autoComplete="family-name"
          value={form.lastName}
          onChange={set('lastName')}
          error={errors.lastName}
        />
      </div>

      <TextField
        label="Job title"
        plainLabel
        optional
        fieldSize="lg"
        placeholder="Casting director, Producer, Assistant…"
        value={form.jobTitle}
        onChange={set('jobTitle')}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="City"
          plainLabel
          optional
          fieldSize="lg"
          placeholder="Paris"
          value={form.city}
          onChange={set('city')}
        />
        <CountryField
          optional
          value={form.country}
          onChange={(country) => setForm((current) => ({ ...current, country }))}
        />
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-14 items-center justify-center gap-2.5 rounded-field bg-ink px-9 text-[15px] font-bold text-white transition-all hover:bg-ink/90 active:scale-[0.99] disabled:opacity-60"
        >
          {busy && <Spinner className="h-[18px] w-[18px]" />}
          Continue
          {!busy && <ArrowRight className="h-[18px] w-[18px]" />}
        </button>
      </div>
    </form>
  )
}
