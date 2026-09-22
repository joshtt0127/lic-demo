import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { FormError, FormField, Input, Spinner, TextField } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { AvatarUpload } from '@/components/upload/AvatarUpload'
import { useAuth } from '@/features/auth/AuthProvider'
import { useOnboardingNav } from '@/features/onboarding/steps'
import {
  useTalentProfile,
  useUpdateAccountProfile,
  useUpdateTalentProfile,
  type TalentProfileFull,
} from '@/features/talent/queries'
import { displayName } from '@/lib/access'
import { errorMessage } from '@/lib/supabase'
import { CountryField } from '../CountryField'
import { useT } from '@/lib/i18n'

/** Step 1 — photo, name, stage name, headline, location. */
export function TalentIdentityStep() {
  const { profile } = useAuth()
  const { data, isLoading, error } = useTalentProfile(profile?.id)

  if (isLoading || (!data && !error)) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-[104px] w-[104px] rounded-full" />
        <Skeleton className="h-[52px] w-full" />
        <Skeleton className="h-[52px] w-full" />
        <Skeleton className="h-[52px] w-full" />
      </div>
    )
  }

  if (!data) {
    return <FormError>{errorMessage(error, 'Could not load your profile')}</FormError>
  }

  return <IdentityForm key={data.profile.id} data={data} />
}

function IdentityForm({ data }: { data: TalentProfileFull }) {
  const t = useT()
  const profileId = data.profile.id
  const nav = useOnboardingNav()
  const updateAccount = useUpdateAccountProfile(profileId)
  const updateTalent = useUpdateTalentProfile(profileId)

  const [form, setForm] = useState({
    firstName: data.profile.first_name ?? '',
    lastName: data.profile.last_name ?? '',
    professionalName: data.talent.professional_name ?? '',
    headline: data.talent.headline ?? '',
    city: data.profile.city ?? '',
    country: data.profile.country ?? '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const nextErrors: Record<string, string> = {}
    if (!form.firstName.trim()) nextErrors.firstName = 'First name is required'
    if (!form.lastName.trim()) nextErrors.lastName = 'Last name is required'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    try {
      await updateAccount.mutateAsync({
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        city: form.city.trim() || null,
        country: form.country.trim() || null,
      })
      await updateTalent.mutateAsync({
        professional_name: form.professionalName.trim() || null,
        headline: form.headline.trim() || null,
      })
      await nav.next()
    } catch (saveError) {
      setFormError(errorMessage(saveError, 'Could not save your details'))
    }
  }

  const busy = updateAccount.isPending || updateTalent.isPending || nav.pending

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-7" noValidate>
      {(formError || nav.error) && <FormError>{formError ?? nav.error}</FormError>}

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-[19px] font-bold text-ink">{t('onb.photo')}</h2>
          <p className="mt-1 text-[14px] text-muted">
            A clear photo helps casting directors remember you.
          </p>
        </div>
        <AvatarUpload
          profileId={profileId}
          avatarUrl={data.profile.avatar_url}
          name={displayName(data.profile)}
        />
      </section>

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label={t('onb.firstName')}
          plainLabel
          fieldSize="lg"
          autoComplete="given-name"
          value={form.firstName}
          onChange={set('firstName')}
          error={errors.firstName}
        />
        <TextField
          label={t('onb.lastName')}
          plainLabel
          fieldSize="lg"
          autoComplete="family-name"
          value={form.lastName}
          onChange={set('lastName')}
          error={errors.lastName}
        />
      </div>

      <TextField
        label={t('onb.professionalName')}
        plainLabel
        optional
        fieldSize="lg"
        placeholder={t('onb.professionalNamePlaceholder')}
        value={form.professionalName}
        onChange={set('professionalName')}
      />

      <FormField
        label={t('onb.headline')}
        htmlFor="onboarding-headline"
        plainLabel
        optional
        hint={t('onb.headlineHint')}
      >
        <Input
          id="onboarding-headline"
          fieldSize="lg"
          maxLength={140}
          placeholder="Actress · 2x lead · SAG-AFTRA"
          value={form.headline}
          onChange={set('headline')}
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label={t('onb.city')}
          plainLabel
          optional
          fieldSize="lg"
          placeholder="Los Angeles"
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
