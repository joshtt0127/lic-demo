import { supabase, isSupabaseConfigured } from '@/lib/supabase'

/**
 * Product analytics — a thin abstraction, deliberately not a vendor SDK.
 *
 * Events are appended to `public.analytics_events` (RLS: you may only write your
 * own rows) and mirrored to the console in dev. Swapping in PostHog/Amplitude
 * later means changing `sinks`, nothing else.
 *
 * `track()` never throws and never blocks the UI: analytics must not be able to
 * break a user action.
 */

export type AnalyticsEvent =
  | 'account_created'
  | 'signed_in'
  | 'account_type_selected'
  | 'onboarding_step_completed'
  | 'onboarding_completed'
  | 'profile_updated'
  | 'profile_completed'
  | 'media_uploaded'
  | 'organization_created'
  | 'project_created'
  | 'casting_created'
  | 'casting_published'
  | 'casting_viewed'
  | 'casting_saved'
  | 'application_started'
  | 'application_submitted'
  | 'self_tape_uploaded'
  | 'candidate_reviewed'
  | 'candidate_shortlisted'
  | 'candidate_status_changed'
  | 'message_sent'
  | 'search_saved'

type Props = Record<string, string | number | boolean | null | undefined>

const isDev = import.meta.env.DEV

async function persist(name: AnalyticsEvent, props: Props) {
  if (!isSupabaseConfigured) return
  const { data } = await supabase.auth.getSession()
  const profileId = data.session?.user.id
  if (!profileId) return
  await supabase.from('analytics_events').insert({ profile_id: profileId, name, props })
}

export function track(name: AnalyticsEvent, props: Props = {}): void {
  if (isDev) console.debug('[analytics]', name, props)
  void persist(name, props).catch(() => {
    // Analytics is best-effort by design.
  })
}
