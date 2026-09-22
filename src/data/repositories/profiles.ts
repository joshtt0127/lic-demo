import { supabase } from '@/lib/supabase'
import type { ProductionProfileRow, ProfileRow, TalentProfileRow } from '@/types/database'

/**
 * Profile reads/writes. Components never query Supabase directly — they call a
 * repository (or a hook wrapping one), so every table has exactly one place
 * where it is read and written.
 */

export async function getProfile(id: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export type ProfilePatch = Partial<
  Pick<
    ProfileRow,
    | 'first_name'
    | 'last_name'
    | 'avatar_url'
    | 'city'
    | 'country'
    | 'locale'
    | 'email_notifications'
    | 'onboarding_step'
    | 'onboarding_completed_at'
  >
>

export async function updateProfile(id: string, patch: ProfilePatch): Promise<ProfileRow> {
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

/** Marks the onboarding as done — the guards then let the user into their surface. */
export async function completeOnboarding(id: string): Promise<ProfileRow> {
  return updateProfile(id, {
    onboarding_step: null,
    onboarding_completed_at: new Date().toISOString(),
  })
}

export async function getTalentProfile(profileId: string): Promise<TalentProfileRow | null> {
  const { data, error } = await supabase
    .from('talent_profiles')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error) throw error
  return data
}

export type TalentProfilePatch = Partial<Omit<TalentProfileRow, 'profile_id' | 'created_at' | 'updated_at'>>

export async function upsertTalentProfile(
  profileId: string,
  patch: TalentProfilePatch,
): Promise<TalentProfileRow> {
  const { data, error } = await supabase
    .from('talent_profiles')
    .upsert({ profile_id: profileId, ...patch }, { onConflict: 'profile_id' })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function getProductionProfile(
  profileId: string,
): Promise<ProductionProfileRow | null> {
  const { data, error } = await supabase
    .from('production_profiles')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error) throw error
  return data
}

export type ProductionProfilePatch = Partial<Pick<ProductionProfileRow, 'job_title' | 'phone'>>

export async function upsertProductionProfile(
  profileId: string,
  patch: ProductionProfilePatch,
): Promise<ProductionProfileRow> {
  const { data, error } = await supabase
    .from('production_profiles')
    .upsert({ profile_id: profileId, ...patch }, { onConflict: 'profile_id' })
    .select('*')
    .single()
  if (error) throw error
  return data
}
