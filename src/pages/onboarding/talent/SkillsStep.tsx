import { useState } from 'react'
import { Card, FormError } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { SkillPicker } from '@/components/form/SkillPicker'
import { useAuth } from '@/features/auth/AuthProvider'
import { useOnboardingNav } from '@/features/onboarding/steps'
import {
  useSkillsCatalog,
  useTalentProfile,
  useTalentSkillMutations,
} from '@/features/talent/queries'
import { errorMessage } from '@/lib/supabase'
import { StepActions } from '../StepActions'

/**
 * Skills are saved as you go (each add / level change is a write), so this step
 * has nothing to "submit" — Continue only advances.
 */
export function SkillsStep() {
  const { profile } = useAuth()
  const profileId = profile?.id
  const { data, isLoading, error } = useTalentProfile(profileId)
  const catalogue = useSkillsCatalog()
  const skills = useTalentSkillMutations(profileId)
  const nav = useOnboardingNav()
  const [formError, setFormError] = useState<string | null>(null)

  if (isLoading || (!data && !error)) {
    return (
      <Card className="flex flex-col gap-3">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </Card>
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

  return (
    <div>
      <Card className="flex flex-col gap-4">
        {(formError || nav.error) && <FormError>{formError ?? nav.error}</FormError>}

        <SkillPicker
          catalogue={catalogue.data ?? []}
          skills={data.skills}
          busy={busy}
          onAdd={(name) => run(skills.add.mutateAsync({ name }))}
          onLevelChange={(skillId, level) => run(skills.setLevel.mutateAsync({ skillId, level }))}
          onRemove={(skillId) => run(skills.remove.mutateAsync(skillId))}
        />
      </Card>

      <StepActions
        onBack={nav.back}
        onSkip={data.skills.length === 0 ? () => void nav.next() : undefined}
        onContinue={() => void nav.next()}
        pending={nav.pending}
      />
    </div>
  )
}
