import { ArrowLeft, ArrowRight, Image as ImageIcon, Video } from 'lucide-react'
import { FormError, Spinner } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { MediaGallery } from '@/components/upload/MediaGallery'
import { useAuth } from '@/features/auth/AuthProvider'
import { useOnboardingNav } from '@/features/onboarding/steps'
import { profileCompletion } from '@/features/talent/completion'
import { useTalentProfile } from '@/features/talent/queries'
import { errorMessage } from '@/lib/supabase'
import { useT } from '@/lib/i18n'

/**
 * Step 4 — headshots and a showreel, then into the product.
 *
 * Designed from the language of the other steps: centered column, one panel,
 * the same section headings as step 1 and the same action row as step 3. It
 * closes on the profile-strength read-out, so the talent knows where they stand
 * before entering.
 */
export function MediaStep() {
  const t = useT()
  const { profile } = useAuth()
  const { data, isLoading, error } = useTalentProfile(profile?.id)
  const nav = useOnboardingNav()

  if (isLoading || (!data && !error)) {
    return (
      <div className="rounded-panel border border-white/70 bg-[#FBFAF7]/90 p-8 shadow-panel">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="mt-6 h-40 w-full" />
      </div>
    )
  }
  if (!data) return <FormError>{errorMessage(error, 'Could not load your profile')}</FormError>

  const headshots = data.media.filter(
    (asset) => asset.kind === 'headshot' || asset.kind === 'portfolio',
  )
  const showreels = data.media.filter((asset) => asset.kind === 'showreel')
  const completion = profileCompletion(data)
  const empty = headshots.length === 0 && showreels.length === 0

  return (
    <div className="flex flex-col gap-6">
      {nav.error && <FormError>{nav.error}</FormError>}

      <div className="rounded-panel border border-white/70 bg-[#FBFAF7]/90 px-6 py-7 shadow-panel backdrop-blur-sm sm:px-8">
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <ImageIcon className="h-[18px] w-[18px] text-muted" />
            <h2 className="font-display text-[19px] font-bold text-ink">{t('onb.headshots')}</h2>
          </div>
          <p className="-mt-3 text-[14px] text-muted">
            Your primary photos — productions look at these first.
          </p>
          <MediaGallery
            profileId={data.profile.id}
            kind="headshot"
            assets={headshots}
            addLabel="Add headshot"
          />
        </section>

        <section className="mt-8 flex flex-col gap-4 border-t border-line pt-7">
          <div className="flex items-center gap-2.5">
            <Video className="h-[18px] w-[18px] text-muted" />
            <h2 className="font-display text-[19px] font-bold text-ink">{t('onb.showreel')}</h2>
          </div>
          <p className="-mt-3 text-[14px] text-muted">
            One reel is enough to get started. Self-tapes you submit to a casting stay private to
            that casting.
          </p>
          <MediaGallery
            profileId={data.profile.id}
            kind="showreel"
            assets={showreels}
            aspect="video"
            addLabel="Add showreel"
          />
        </section>

        <div className="mt-8 flex flex-wrap items-center gap-4 rounded-field bg-ink px-5 py-4 text-white">
          <div className="min-w-[180px] flex-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">
              Profile strength
            </span>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-gold transition-[width] duration-500"
                style={{ width: `${completion.percent}%` }}
              />
            </div>
          </div>
          <span className="font-mono text-2xl font-bold">{completion.percent}%</span>
        </div>
      </div>

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
          {empty && (
            <button
              type="button"
              onClick={() => void nav.next()}
              disabled={nav.pending}
              className="text-[15px] font-semibold text-muted transition-colors hover:text-ink disabled:opacity-60"
            >
              Skip for now
            </button>
          )}
          <button
            type="button"
            onClick={() => void nav.next()}
            disabled={nav.pending}
            className="inline-flex h-14 items-center justify-center gap-2.5 rounded-field bg-ink px-9 text-[15px] font-bold text-white transition-all hover:bg-ink/90 active:scale-[0.99] disabled:opacity-60"
          >
            {nav.pending && <Spinner className="h-[18px] w-[18px]" />}
            Enter Let It Cast
            {!nav.pending && <ArrowRight className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </div>
    </div>
  )
}
