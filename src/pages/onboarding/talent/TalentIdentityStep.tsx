import { useState } from 'react'
import { Card, FormError, FormField, TextField } from '@/components/ui'
import { TextArea } from '@/components/EditModal'
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
import { StepActions } from '../StepActions'

/** Who you are: photo, name, stage name, location, headline. */
export function TalentIdentityStep() {
  const { profile } = useAuth()
  const { data, isLoading, error } = useTalentProfile(profile?.id)

  if (isLoading || (!data && !error)) {
    return (
      <Card className="flex flex-col gap-4">
        <Skeleton className="h-20 w-20 rounded-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-20 w-full" />
      </Card>
    )
  }

  if (!data) {
    return <FormError>{errorMessage(error, 'Could not load your profile')}</FormError>
  }

  // Keyed on the row so the form always initialises from real data, once.
  return <IdentityForm key={data.profile.id} data={data} />
}

function IdentityForm({ data }: { data: TalentProfileFull }) {
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

  const set =
    (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }))

  async function handleContinue() {
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
    } catch (error) {
      setFormError(errorMessage(error, 'Could not save your details'))
    }
  }

  const busy = updateAccount.isPending || updateTalent.isPending || nav.pending

  return (
    <div>
      <Card className="flex flex-col gap-5">
        {(formError || nav.error) && <FormError>{formError ?? nav.error}</FormError>}

        <FormField label="Profile photo" hint="Casting directors recognise faces before names.">
          <AvatarUpload
            profileId={profileId}
            avatarUrl={data.profile.avatar_url}
            name={displayName(data.profile)}
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
          label="Professional name"
          placeholder="The name you are credited under"
          value={form.professionalName}
          onChange={set('professionalName')}
          optional
        />

        <FormField
          label="Headline"
          hint="One line, shown under your name."
          optional
        >
          <TextArea
            rows={2}
            maxLength={140}
            placeholder="Actress · 2x lead · SAG-AFTRA"
            value={form.headline}
            onChange={set('headline')}
          />
        </FormField>

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

      <StepActions
        onBack={nav.isFirst ? undefined : nav.back}
        onContinue={handleContinue}
        pending={busy}
      />
    </div>
  )
}
