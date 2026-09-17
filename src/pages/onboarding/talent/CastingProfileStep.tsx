import { useState } from 'react'
import { Card, FormError, FormField, Input, TextField } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { MultiSelect } from '@/components/form/MultiSelect'
import { SegmentedControl } from '@/components/form/SegmentedControl'
import { useAuth } from '@/features/auth/AuthProvider'
import { useOnboardingNav } from '@/features/onboarding/steps'
import {
  useLanguagesCatalog,
  useSetTalentLanguages,
  useTalentProfile,
  useUpdateTalentProfile,
  type TalentProfileFull,
} from '@/features/talent/queries'
import { errorMessage } from '@/lib/supabase'
import { StepActions } from '../StepActions'

/**
 * The casting-facing part of the profile — the attributes a role is actually
 * matched on. Everything here is optional and editable later, and nothing
 * sensitive is required to use the product.
 */

export const GENDER_OPTIONS = [
  { value: 'Female', label: 'Female' },
  { value: 'Male', label: 'Male' },
  { value: 'Non-binary', label: 'Non-binary' },
  { value: 'Additional', label: 'Additional' },
]

export const ETHNICITY_OPTIONS = [
  'Asian',
  'Black / African Descent',
  'Ethnically Ambiguous / Multiracial',
  'Indigenous Peoples',
  'Latino / Hispanic',
  'Middle Eastern',
  'South Asian / Indian',
  'Southeast Asian / Pacific Islander',
  'White / European Descent',
].map((value) => ({ value, label: value }))

export const EXPERIENCE_OPTIONS = [
  { value: 'Emerging', label: 'Emerging' },
  { value: 'Mid-career', label: 'Mid-career' },
  { value: 'Established', label: 'Established' },
  { value: 'Star', label: 'Star' },
]

export function CastingProfileStep() {
  const { profile } = useAuth()
  const { data, isLoading, error } = useTalentProfile(profile?.id)

  if (isLoading || (!data && !error)) {
    return (
      <Card className="flex flex-col gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </Card>
    )
  }
  if (!data) return <FormError>{errorMessage(error, 'Could not load your profile')}</FormError>

  return <CastingProfileForm key={data.profile.id} data={data} />
}

function CastingProfileForm({ data }: { data: TalentProfileFull }) {
  const profileId = data.profile.id
  const nav = useOnboardingNav()
  const updateTalent = useUpdateTalentProfile(profileId)
  const setLanguages = useSetTalentLanguages(profileId)
  const languagesCatalogue = useLanguagesCatalog()

  const [form, setForm] = useState({
    gender: data.talent.gender,
    playingAgeMin: data.talent.playing_age_min?.toString() ?? '',
    playingAgeMax: data.talent.playing_age_max?.toString() ?? '',
    heightCm: data.talent.height_cm?.toString() ?? '',
    unionName: data.talent.union_name ?? '',
    experienceLevel: data.talent.experience_level,
    nationalities: data.talent.nationalities,
    ethnicities: data.talent.ethnicities,
    accents: data.talent.accents,
    languages: data.languages.map((language) => language.code),
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const languageOptions = (languagesCatalogue.data ?? []).map((language) => ({
    value: language.code,
    label: language.name,
  }))

  function validate(): boolean {
    const next: Record<string, string> = {}
    const min = form.playingAgeMin ? Number(form.playingAgeMin) : null
    const max = form.playingAgeMax ? Number(form.playingAgeMax) : null

    if (min !== null && (Number.isNaN(min) || min < 0 || min > 120)) {
      next.playingAgeMin = 'Enter an age between 0 and 120'
    }
    if (max !== null && (Number.isNaN(max) || max < 0 || max > 120)) {
      next.playingAgeMax = 'Enter an age between 0 and 120'
    }
    if (min !== null && max !== null && !next.playingAgeMin && !next.playingAgeMax && min > max) {
      next.playingAgeMax = 'The upper age must be greater than the lower one'
    }
    const height = form.heightCm ? Number(form.heightCm) : null
    if (height !== null && (Number.isNaN(height) || height < 50 || height > 260)) {
      next.heightCm = 'Enter a height in cm (50–260)'
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function save() {
    await updateTalent.mutateAsync({
      gender: form.gender || null,
      playing_age_min: form.playingAgeMin ? Number(form.playingAgeMin) : null,
      playing_age_max: form.playingAgeMax ? Number(form.playingAgeMax) : null,
      height_cm: form.heightCm ? Number(form.heightCm) : null,
      union_name: form.unionName.trim() || null,
      experience_level: form.experienceLevel || null,
      nationalities: form.nationalities,
      ethnicities: form.ethnicities,
      accents: form.accents,
    })
    await setLanguages.mutateAsync(form.languages)
  }

  async function handleContinue() {
    setFormError(null)
    if (!validate()) return
    try {
      await save()
      await nav.next()
    } catch (error) {
      setFormError(errorMessage(error, 'Could not save your casting details'))
    }
  }

  const busy = updateTalent.isPending || setLanguages.isPending || nav.pending

  return (
    <div>
      <Card className="flex flex-col gap-5">
        {(formError || nav.error) && <FormError>{formError ?? nav.error}</FormError>}

        <FormField label="Gender" optional>
          <SegmentedControl
            options={GENDER_OPTIONS}
            value={form.gender}
            allowClear
            onChange={(gender) => setForm((current) => ({ ...current, gender }))}
          />
        </FormField>

        <FormField
          label="Playing age"
          hint="The age range you can credibly play — not your real age."
          error={errors.playingAgeMin ?? errors.playingAgeMax}
          optional
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={120}
              placeholder="24"
              value={form.playingAgeMin}
              invalid={Boolean(errors.playingAgeMin)}
              onChange={(event) =>
                setForm((current) => ({ ...current, playingAgeMin: event.target.value }))
              }
              className="w-24"
            />
            <span className="text-sm text-muted">to</span>
            <Input
              type="number"
              min={0}
              max={120}
              placeholder="34"
              value={form.playingAgeMax}
              invalid={Boolean(errors.playingAgeMax)}
              onChange={(event) =>
                setForm((current) => ({ ...current, playingAgeMax: event.target.value }))
              }
              className="w-24"
            />
            <span className="text-sm text-muted">years old</span>
          </div>
        </FormField>

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Height (cm)"
            type="number"
            min={50}
            max={260}
            placeholder="170"
            value={form.heightCm}
            error={errors.heightCm}
            onChange={(event) => setForm((current) => ({ ...current, heightCm: event.target.value }))}
            optional
          />
          <TextField
            label="Union"
            placeholder="SAG-AFTRA, Equity…"
            value={form.unionName}
            onChange={(event) => setForm((current) => ({ ...current, unionName: event.target.value }))}
            optional
          />
        </div>

        <FormField label="Experience" optional>
          <SegmentedControl
            options={EXPERIENCE_OPTIONS}
            value={form.experienceLevel}
            allowClear
            onChange={(experienceLevel) => setForm((current) => ({ ...current, experienceLevel }))}
          />
        </FormField>

        <FormField label="Languages" optional>
          <MultiSelect
            options={languageOptions}
            values={form.languages}
            onChange={(languages) => setForm((current) => ({ ...current, languages }))}
            placeholder="Search a language…"
            emptyLabel="No language selected"
          />
        </FormField>

        <FormField label="Accents" optional>
          <MultiSelect
            options={[
              'Standard American',
              'RP / British',
              'Cockney',
              'Irish',
              'Scottish',
              'Parisian French',
              'Southern French',
              'Québécois',
              'Australian',
            ].map((value) => ({ value, label: value }))}
            values={form.accents}
            onChange={(accents) => setForm((current) => ({ ...current, accents }))}
            allowCreate
            placeholder="Search or add an accent…"
            emptyLabel="No accent added"
          />
        </FormField>

        <FormField label="Nationalities" hint="Useful for work permits and co-productions." optional>
          <MultiSelect
            options={['American', 'British', 'French', 'Canadian', 'Australian', 'German', 'Italian', 'Spanish'].map(
              (value) => ({ value, label: value }),
            )}
            values={form.nationalities}
            onChange={(nationalities) => setForm((current) => ({ ...current, nationalities }))}
            allowCreate
            placeholder="Search or add a nationality…"
            emptyLabel="None added"
          />
        </FormField>

        <FormField label="Appearance" hint="Only what you are comfortable sharing." optional>
          <MultiSelect
            options={ETHNICITY_OPTIONS}
            values={form.ethnicities}
            onChange={(ethnicities) => setForm((current) => ({ ...current, ethnicities }))}
            placeholder="Search…"
            emptyLabel="Nothing selected"
          />
        </FormField>
      </Card>

      <StepActions
        onBack={nav.back}
        onSkip={() => void nav.next()}
        onContinue={handleContinue}
        pending={busy}
      />
    </div>
  )
}
