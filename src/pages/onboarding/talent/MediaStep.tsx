import { Card, FormError, FormField } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { MediaGallery } from '@/components/upload/MediaGallery'
import { useAuth } from '@/features/auth/AuthProvider'
import { useOnboardingNav } from '@/features/onboarding/steps'
import { profileCompletion } from '@/features/talent/completion'
import { useTalentProfile } from '@/features/talent/queries'
import { errorMessage } from '@/lib/supabase'
import { StepActions } from '../StepActions'

/**
 * Last talent step: headshots and a showreel. Uploads are immediate, so this
 * step also shows where the profile stands before entering the product.
 */
export function MediaStep() {
  const { profile } = useAuth()
  const { data, isLoading, error } = useTalentProfile(profile?.id)
  const nav = useOnboardingNav()

  if (isLoading || (!data && !error)) {
    return (
      <Card className="flex flex-col gap-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </Card>
    )
  }
  if (!data) return <FormError>{errorMessage(error, 'Could not load your profile')}</FormError>

  const headshots = data.media.filter((asset) => asset.kind === 'headshot')
  const showreels = data.media.filter((asset) => asset.kind === 'showreel')
  const completion = profileCompletion(data)

  return (
    <div>
      <Card className="flex flex-col gap-6">
        {nav.error && <FormError>{nav.error}</FormError>}

        <FormField label="Headshots" hint="Your primary photos — productions look at these first.">
          <MediaGallery
            profileId={data.profile.id}
            kind="headshot"
            assets={headshots}
            addLabel="Add headshot"
            emptyHint="JPG, PNG, WebP or AVIF up to 20 MB each."
          />
        </FormField>

        <FormField label="Showreel" hint="A single reel is enough to get started.">
          <MediaGallery
            profileId={data.profile.id}
            kind="showreel"
            assets={showreels}
            aspect="video"
            addLabel="Add showreel"
            emptyHint="MP4, MOV or WebM up to 200 MB."
          />
        </FormField>

        <div className="flex items-center gap-3 rounded-btn bg-paper px-4 py-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-ink transition-[width] duration-300"
              style={{ width: `${completion.percent}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-xs font-semibold text-ink">
            Profile {completion.percent}%
          </span>
        </div>
      </Card>

      <StepActions
        onBack={nav.back}
        onSkip={data.media.length === 0 ? () => void nav.next() : undefined}
        onContinue={() => void nav.next()}
        continueLabel="Enter Let It Cast"
        pending={nav.pending}
      />
    </div>
  )
}
