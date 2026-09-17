import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  CalendarDays,
  Flag,
  Globe,
  Ruler,
  Sparkles,
  User,
  Users,
} from 'lucide-react'
import { FormError, Input, SelectInput, Spinner } from '@/components/ui'
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

/**
 * Step 2 — the casting-facing attributes a role is matched on. Everything is
 * optional and editable later, and nothing sensitive is required to use the
 * product.
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

const UNIONS = [
  'SAG-AFTRA',
  'Equity (UK)',
  'UDA',
  'ACTRA',
  'SFA (France)',
  'BECTU',
  'MEAA',
  'Not a union member',
]

const ACCENT_OPTIONS = [
  'Standard American',
  'RP / British',
  'Cockney',
  'Irish',
  'Scottish',
  'Parisian French',
  'Southern French',
  'Québécois',
  'Australian',
  'South African',
].map((value) => ({ value, label: value }))

const NATIONALITY_OPTIONS = [
  'American',
  'British',
  'French',
  'Canadian',
  'Australian',
  'German',
  'Italian',
  'Spanish',
  'Irish',
  'Moroccan',
  'Nigerian',
  'Indian',
].map((value) => ({ value, label: value }))

const OTHER_UNION = '__other__'

export function CastingProfileStep() {
  const { profile } = useAuth()
  const { data, isLoading, error } = useTalentProfile(profile?.id)

  if (isLoading || (!data && !error)) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-[52px] w-full" />
        <Skeleton className="h-[52px] w-full" />
        <Skeleton className="h-[52px] w-full" />
      </div>
    )
  }
  if (!data) return <FormError>{errorMessage(error, 'Could not load your profile')}</FormError>

  return <CastingProfileForm key={data.profile.id} data={data} />
}

function Row({
  icon,
  label,
  hint,
  children,
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className="text-muted">{icon}</span>
        <span className="text-[15px] font-bold text-ink">{label}</span>
        <span className="text-[13px] text-muted">Optional</span>
      </div>
      {children}
      {hint && <p className="text-[13px] text-muted">{hint}</p>}
    </section>
  )
}

function CastingProfileForm({ data }: { data: TalentProfileFull }) {
  const profileId = data.profile.id
  const nav = useOnboardingNav()
  const updateTalent = useUpdateTalentProfile(profileId)
  const setLanguages = useSetTalentLanguages(profileId)
  const languagesCatalogue = useLanguagesCatalog()

  const storedUnion = data.talent.union_name ?? ''
  const [customUnion, setCustomUnion] = useState(
    Boolean(storedUnion) && !UNIONS.includes(storedUnion),
  )

  const [form, setForm] = useState({
    gender: data.talent.gender,
    playingAgeMin: data.talent.playing_age_min?.toString() ?? '',
    playingAgeMax: data.talent.playing_age_max?.toString() ?? '',
    heightCm: data.talent.height_cm?.toString() ?? '',
    unionName: storedUnion,
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
      next.playingAge = 'Enter an age between 0 and 120'
    }
    if (max !== null && (Number.isNaN(max) || max < 0 || max > 120)) {
      next.playingAge = 'Enter an age between 0 and 120'
    }
    if (min !== null && max !== null && !next.playingAge && min > max) {
      next.playingAge = 'The upper age must be greater than the lower one'
    }
    const height = form.heightCm ? Number(form.heightCm) : null
    if (height !== null && (Number.isNaN(height) || height < 50 || height > 260)) {
      next.height = 'Enter a height in cm (50–260)'
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    if (!validate()) return
    try {
      await save()
      await nav.next()
    } catch (saveError) {
      setFormError(errorMessage(saveError, 'Could not save your casting details'))
    }
  }

  const busy = updateTalent.isPending || setLanguages.isPending || nav.pending

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-7" noValidate>
      {(formError || nav.error) && <FormError>{formError ?? nav.error}</FormError>}

      <Row icon={<User className="h-[18px] w-[18px]" />} label="Gender">
        <SegmentedControl
          variant="pills"
          options={GENDER_OPTIONS}
          value={form.gender}
          allowClear
          onChange={(gender) => setForm((current) => ({ ...current, gender }))}
        />
      </Row>

      <Row
        icon={<CalendarDays className="h-[18px] w-[18px]" />}
        label="Playing age"
        hint={errors.playingAge ?? 'The age range you can credibly play — not your real age.'}
      >
        <div className="flex items-center gap-3">
          <Input
            fieldSize="lg"
            type="number"
            min={0}
            max={120}
            placeholder="24"
            aria-label="Playing age from"
            value={form.playingAgeMin}
            invalid={Boolean(errors.playingAge)}
            onChange={(event) =>
              setForm((current) => ({ ...current, playingAgeMin: event.target.value }))
            }
            className="w-[88px] text-center"
          />
          <span className="text-[15px] text-muted">to</span>
          <Input
            fieldSize="lg"
            type="number"
            min={0}
            max={120}
            placeholder="34"
            aria-label="Playing age to"
            value={form.playingAgeMax}
            invalid={Boolean(errors.playingAge)}
            onChange={(event) =>
              setForm((current) => ({ ...current, playingAgeMax: event.target.value }))
            }
            className="w-[88px] text-center"
          />
          <span className="text-[15px] text-ink">years old</span>
        </div>
      </Row>

      <div className="grid gap-7 sm:grid-cols-2">
        <Row icon={<Ruler className="h-[18px] w-[18px]" />} label="Height" hint={errors.height}>
          <Input
            fieldSize="lg"
            type="number"
            min={50}
            max={260}
            placeholder="170"
            aria-label="Height in centimetres"
            suffix="cm"
            value={form.heightCm}
            invalid={Boolean(errors.height)}
            onChange={(event) =>
              setForm((current) => ({ ...current, heightCm: event.target.value }))
            }
          />
        </Row>

        <Row icon={<Users className="h-[18px] w-[18px]" />} label="Union">
          {customUnion ? (
            <Input
              fieldSize="lg"
              placeholder="Your union"
              aria-label="Union"
              value={form.unionName}
              onChange={(event) =>
                setForm((current) => ({ ...current, unionName: event.target.value }))
              }
            />
          ) : (
            <SelectInput
              fieldSize="lg"
              aria-label="Union"
              value={UNIONS.includes(form.unionName) ? form.unionName : ''}
              onChange={(event) => {
                if (event.target.value === OTHER_UNION) {
                  setCustomUnion(true)
                  setForm((current) => ({ ...current, unionName: '' }))
                  return
                }
                setForm((current) => ({ ...current, unionName: event.target.value }))
              }}
            >
              <option value="">SAG-AFTRA, Equity…</option>
              {UNIONS.map((union) => (
                <option key={union} value={union}>
                  {union}
                </option>
              ))}
              <option value={OTHER_UNION}>Other…</option>
            </SelectInput>
          )}
        </Row>
      </div>

      <Row icon={<Sparkles className="h-[18px] w-[18px]" />} label="Experience level">
        <SegmentedControl
          variant="pills"
          options={EXPERIENCE_OPTIONS}
          value={form.experienceLevel}
          allowClear
          onChange={(experienceLevel) => setForm((current) => ({ ...current, experienceLevel }))}
        />
      </Row>

      <Row icon={<Globe className="h-[18px] w-[18px]" />} label="Languages">
        <MultiSelect
          fieldSize="lg"
          options={languageOptions}
          values={form.languages}
          onChange={(languages) => setForm((current) => ({ ...current, languages }))}
          placeholder="Search a language…"
        />
      </Row>

      <Row icon={<AudioLines className="h-[18px] w-[18px]" />} label="Accents">
        <MultiSelect
          fieldSize="lg"
          options={ACCENT_OPTIONS}
          values={form.accents}
          onChange={(accents) => setForm((current) => ({ ...current, accents }))}
          allowCreate
          placeholder="Search or add an accent…"
        />
      </Row>

      <Row
        icon={<Flag className="h-[18px] w-[18px]" />}
        label="Nationalities"
        hint="Useful for work permits and co-productions."
      >
        <MultiSelect
          fieldSize="lg"
          options={NATIONALITY_OPTIONS}
          values={form.nationalities}
          onChange={(nationalities) => setForm((current) => ({ ...current, nationalities }))}
          allowCreate
          placeholder="Search or add a nationality…"
        />
      </Row>

      <Row
        icon={<Sparkles className="h-[18px] w-[18px]" />}
        label="Appearance"
        hint="Only what you are comfortable sharing."
      >
        <MultiSelect
          fieldSize="lg"
          options={ETHNICITY_OPTIONS}
          values={form.ethnicities}
          onChange={(ethnicities) => setForm((current) => ({ ...current, ethnicities }))}
          placeholder="Search…"
        />
      </Row>

      <div className="mt-2 flex items-center justify-between gap-4 border-t border-line pt-6">
        <button
          type="button"
          onClick={() => void nav.back()}
          disabled={busy}
          className="inline-flex h-14 items-center gap-2.5 rounded-field border border-line bg-card px-7 text-[15px] font-bold text-ink transition-colors hover:bg-paper disabled:opacity-60"
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
          Back
        </button>

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
