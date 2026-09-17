import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Plus, Search, Trash2 } from 'lucide-react'
import { FormError, Input, Spinner } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { SegmentedControl } from '@/components/form/SegmentedControl'
import { SKILL_LEVELS } from '@/components/form/SkillPicker'
import { useAuth } from '@/features/auth/AuthProvider'
import { useOnboardingNav } from '@/features/onboarding/steps'
import {
  useSkillsCatalog,
  useTalentProfile,
  useTalentSkillMutations,
} from '@/features/talent/queries'
import { errorMessage } from '@/lib/supabase'

/**
 * Step 3 — skills, with suggestions and a proficiency level per skill.
 *
 * Every add / level change / removal is written immediately, so this step has
 * nothing to submit: Continue only moves on.
 */

const SUGGESTED = [
  'Acting',
  'Singing',
  'Contemporary dance',
  'Horse riding',
  'Driving licence',
  'Martial arts',
  'Swimming',
  'Improvisation',
  'Comedy',
  'Presenting',
  'Voice acting',
  'Stage combat',
]

export function SkillsStep() {
  const { profile } = useAuth()
  const profileId = profile?.id
  const { data, isLoading, error } = useTalentProfile(profileId)
  const catalogue = useSkillsCatalog()
  const skills = useTalentSkillMutations(profileId)
  const nav = useOnboardingNav()

  const [query, setQuery] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const selected = useMemo(
    () => new Set((data?.skills ?? []).map((skill) => skill.name.toLowerCase())),
    [data?.skills],
  )

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    return (catalogue.data ?? [])
      .filter((skill) => !selected.has(skill.name.toLowerCase()))
      .filter((skill) => skill.name.toLowerCase().includes(needle))
      .slice(0, 6)
  }, [catalogue.data, query, selected])

  if (isLoading || (!data && !error)) {
    return (
      <div className="rounded-panel border border-white/70 bg-[#FBFAF7]/90 p-8 shadow-panel">
        <Skeleton className="h-[52px] w-full" />
        <Skeleton className="mt-6 h-24 w-full" />
      </div>
    )
  }
  if (!data) return <FormError>{errorMessage(error, 'Could not load your profile')}</FormError>

  const busy = skills.add.isPending || skills.setLevel.isPending || skills.remove.isPending

  function run(promise: Promise<unknown>) {
    setFormError(null)
    promise.catch((mutationError) =>
      setFormError(errorMessage(mutationError, 'Could not save that skill')),
    )
  }

  function add(name: string) {
    if (!name.trim()) return
    run(skills.add.mutateAsync({ name: name.trim() }))
    setQuery('')
  }

  const canCreate =
    query.trim().length > 1 &&
    !selected.has(query.trim().toLowerCase()) &&
    !matches.some((skill) => skill.name.toLowerCase() === query.trim().toLowerCase())

  return (
    <div className="flex flex-col gap-6">
      {(formError || nav.error) && <FormError>{formError ?? nav.error}</FormError>}

      <div className="rounded-panel border border-white/70 bg-[#FBFAF7]/90 px-6 py-7 shadow-panel backdrop-blur-sm sm:px-8">
        {/* search */}
        <div className="relative">
          <Input
            fieldSize="lg"
            icon={<Search className="h-[18px] w-[18px]" />}
            placeholder="Search a skill — acting, singing, horse riding…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              add(matches[0]?.name ?? query)
            }}
          />

          {(matches.length > 0 || canCreate) && (
            <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-field border border-line bg-card shadow-card-hover">
              {matches.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => add(skill.name)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-ink transition-colors hover:bg-paper"
                >
                  {skill.name}
                  {skill.category && (
                    <span className="text-[11px] uppercase tracking-label text-muted">
                      {skill.category}
                    </span>
                  )}
                </button>
              ))}
              {canCreate && (
                <button
                  type="button"
                  onClick={() => add(query)}
                  className="flex w-full items-center gap-2 border-t border-line px-4 py-2.5 text-left text-sm font-semibold text-ink transition-colors hover:bg-paper"
                >
                  <Plus className="h-4 w-4" />
                  Add “{query.trim()}”
                </button>
              )}
            </div>
          )}
        </div>

        {/* suggestions */}
        <div className="mt-6">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Suggested skills
          </span>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {SUGGESTED.map((name) => {
              const already = selected.has(name.toLowerCase())
              return (
                <button
                  key={name}
                  type="button"
                  disabled={already || busy}
                  onClick={() => add(name)}
                  className={
                    already
                      ? 'inline-flex items-center gap-2 rounded-full border border-line bg-[#F1F0EB] px-4 py-2.5 text-[14px] font-medium text-muted'
                      : 'inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-[14px] font-medium text-ink transition-colors hover:border-ink/25 hover:bg-paper'
                  }
                >
                  {already ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {name}
                </button>
              )
            })}
          </div>
        </div>

        {/* your skills */}
        <div className="mt-7 border-t border-line pt-6">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Your skills
          </span>

          {data.skills.length === 0 ? (
            <div className="mt-3 rounded-field bg-[#F1F0EB] px-6 py-7 text-center">
              <p className="text-[15px] font-bold text-ink">No skills yet.</p>
              <p className="mt-1 text-[14px] text-muted">
                Add at least 3 skills to make your profile easier to find.
              </p>
            </div>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-line overflow-hidden rounded-field border border-line bg-card">
              {data.skills.map((skill) => (
                <li key={skill.skillId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="flex-1 text-[15px] font-semibold text-ink">{skill.name}</span>
                  <SegmentedControl
                    size="sm"
                    options={SKILL_LEVELS.map((level) => ({
                      value: String(level.value),
                      label: level.label,
                    }))}
                    value={String(skill.level)}
                    onChange={(value) =>
                      value &&
                      run(
                        skills.setLevel.mutateAsync({
                          skillId: skill.skillId,
                          level: Number(value) as 1 | 2 | 3,
                        }),
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() => run(skills.remove.mutateAsync(skill.skillId))}
                    aria-label={`Remove ${skill.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-signal-no/10 hover:text-signal-no"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* actions */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => void nav.back()}
          disabled={nav.pending}
          className="inline-flex items-center gap-2.5 text-[15px] font-bold text-ink transition-opacity hover:opacity-70 disabled:opacity-60"
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
          Back
        </button>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => void nav.next()}
            disabled={nav.pending}
            className="text-[15px] font-semibold text-muted transition-colors hover:text-ink disabled:opacity-60"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={() => void nav.next()}
            disabled={nav.pending}
            className="inline-flex h-14 items-center justify-center gap-2.5 rounded-field bg-ink px-9 text-[15px] font-bold text-white transition-all hover:bg-ink/90 active:scale-[0.99] disabled:opacity-60"
          >
            {nav.pending && <Spinner className="h-[18px] w-[18px]" />}
            Continue
            {!nav.pending && <ArrowRight className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </div>
    </div>
  )
}
